// ============================================================
// REPOSITORIO DE PAGOS — Supabase
// registrarPago: inserta pago, actualiza cuota, y si todas
// las cuotas quedan pagadas, marca el préstamo como pagado.
// Si algún paso falla, intenta deshacer lo hecho.
// ============================================================

import { supabase } from '../lib/supabaseClient';
import type { Pago } from '../types';

// ── Helpers de mapeo ──────────────────────────────────────────

function mapRowToPago(row: Record<string, any>): Pago {
  return {
    id: row.id_pago as string,
    prestamoId: row.id_prestamo as string,
    cuotaId: `${row.id_prestamo}-${row.numero_cuota}`,
    clienteId: row.id_cliente ?? '',
    fecha: row.fecha as string,
    montoTotal: row.valor as number,
    aplicadoAMora: row.a_mora as number,
    aplicadoAInteres: row.a_interes as number,
    aplicadoACapital: row.a_capital as number,
  };
}

// ── Obtener pagos por préstamo ────────────────────────────────

export async function obtenerPagosPorPrestamo(prestamoId: string): Promise<Pago[]> {
  const { data, error } = await supabase
    .from('pago')
    .select('*')
    .eq('id_prestamo', prestamoId)
    .order('fecha', { ascending: false });

  if (error) throw new Error(`Error al obtener pagos: ${error.message}`);
  return (data ?? []).map(mapRowToPago);
}

// ── Registrar pago completo (compensado) ──────────────────────

export interface DatosRegistroPago {
  prestamoId: string;
  numeroCuota: number;
  clienteId: string;
  fecha: string;
  valor: number;
  aMora: number;
  aInteres: number;
  aCapital: number;
  montoPagadoAnterior: number;
  totalCuota: number;
}

export async function registrarPago(datos: DatosRegistroPago): Promise<void> {
  // Validar que el reparto sume al valor
  const suma = datos.aMora + datos.aInteres + datos.aCapital;
  if (Math.abs(suma - datos.valor) > 0.01) {
    throw new Error(
      `El reparto del pago no cuadra: mora(${datos.aMora}) + interés(${datos.aInteres}) + capital(${datos.aCapital}) = ${suma}, esperado ${datos.valor}`
    );
  }

  // ── Paso 1: Insertar el pago ──────────────────────────────
  const { data: pagoData, error: errPago } = await supabase.from('pago').insert({
    id_prestamo: datos.prestamoId,
    numero_cuota: datos.numeroCuota,
    fecha: datos.fecha,
    valor: datos.valor,
    a_mora: datos.aMora,
    a_interes: datos.aInteres,
    a_capital: datos.aCapital,
  }).select().single();

  if (errPago) {

    throw new Error(`Error al registrar el pago: ${errPago.message}`);
  }
  
  const idPago = pagoData.id_pago as string;

  // ── Paso 2: Actualizar estado de la cuota ────────────────
  const nuevoMontoPagado = datos.montoPagadoAnterior + datos.aCapital + datos.aInteres;
  const pagada = nuevoMontoPagado >= datos.totalCuota - 0.01;
  const estadoCuota: 'pendiente' | 'parcial' | 'pagada' = pagada
    ? 'pagada'
    : nuevoMontoPagado > 0
    ? 'parcial'
    : 'pendiente';

  const { error: errCuota } = await supabase
    .from('cuota')
    .update({ estado: estadoCuota })
    .eq('id_prestamo', datos.prestamoId)
    .eq('numero_cuota', datos.numeroCuota);

  if (errCuota) {

    // Compensar: eliminar el pago recién insertado
    await supabase.from('pago').delete().eq('id_pago', idPago);
    throw new Error(`Error al actualizar la cuota (pago eliminado para mantener consistencia): ${errCuota.message}`);
  }

  // ── Paso 3: Verificar si todas las cuotas están pagadas ──
  const { data: cuotasPendientes, error: errVerif } = await supabase
    .from('cuota')
    .select('estado')
    .eq('id_prestamo', datos.prestamoId)
    .neq('estado', 'pagada');

  if (errVerif) {
    // No es crítico, solo no podemos verificar el estado del préstamo
    console.warn('No se pudo verificar si el préstamo fue completamente pagado:', errVerif.message);
    return;
  }

  // Si no quedan cuotas sin pagar, marcar el préstamo como pagado
  if ((cuotasPendientes ?? []).length === 0) {
    const { error: errEstado } = await supabase
      .from('prestamo')
      .update({ estado: 'pagado' })
      .eq('id_prestamo', datos.prestamoId);

    if (errEstado) {
      console.warn('No se pudo marcar el préstamo como pagado:', errEstado.message);
    }
  }
}

// ============================================================
// REPOSITORIO DE CUOTAS — Supabase
// Usa la vista v_saldo_prestamo para saldo pendiente.
// ============================================================

import { supabase } from '../lib/supabaseClient';
import type { Cuota } from '../types';
import { calcularResumenPrestamo, generarCuotasBase } from '../logic/calculos';

// ── Helpers de mapeo ──────────────────────────────────────────

function mapRowToCuota(row: Record<string, any>, montoPagado: number, cuotaBase?: { montoCapital: number; montoInteres: number }): Cuota {
  const estado = row.estado as string;
  const totalCuota = row.valor_cuota as number;
  return {
    id: `${row.id_prestamo}-${row.numero_cuota}`,
    prestamoId: row.id_prestamo as string,
    numeroCuota: row.numero_cuota as number,
    fechaVencimiento: row.fecha_vencimiento as string,
    montoCapital: cuotaBase?.montoCapital ?? totalCuota,
    montoInteres: cuotaBase?.montoInteres ?? 0,
    totalCuota,
    montoPagado,
    pagada: estado === 'pagada',
  };
}

// ── Obtener cuotas por préstamo ───────────────────────────────

export async function obtenerCuotasPorPrestamo(prestamoId: string): Promise<Cuota[]> {
  const [
    { data: cuotasData, error: errC },
    { data: pagosData, error: errP },
    { data: prestamoData, error: errPr }
  ] = await Promise.all([
    supabase.from('cuota').select('*').eq('id_prestamo', prestamoId).order('numero_cuota'),
    supabase.from('pago').select('numero_cuota, a_capital, a_interes').eq('id_prestamo', prestamoId),
    supabase.from('prestamo').select('monto, tasa_interes, tipo_interes, plazo_dias, comision, comision_modo').eq('id_prestamo', prestamoId).single()
  ]);

  if (errC) throw new Error(`Error al obtener cuotas: ${errC.message}`);
  if (errP) throw new Error(`Error al obtener pagos para cuotas: ${errP.message}`);
  if (errPr) throw new Error(`Error al obtener préstamo para cuotas: ${errPr.message}`);

  const p = prestamoData;
  const resumen = calcularResumenPrestamo({
    monto: p.monto,
    tasaMensual: p.tasa_interes,
    tipoInteres: p.tipo_interes,
    plazoEnDias: p.plazo_dias,
    fechaInicio: '2020-01-01', // no importa para el desglose
    comision: p.comision || 0,
    tipoComision: p.comision_modo === 'sumada' ? 'sumada_deuda' : 'descontada_desembolso'
  });
  
  const cuotasBase = generarCuotasBase(
    resumen.capitalBase,
    resumen.cuotaDiaria,
    resumen.tasaDiariaEfectiva,
    p.tipo_interes,
    p.plazo_dias,
    '2020-01-01'
  );
  const cuotasMap = new Map(cuotasBase.map(c => [c.numeroCuota, c]));

  // Agrupar pagos por numero_cuota
  const pagosPorCuota = new Map<number, number>();
  for (const p of pagosData ?? []) {
    const num = p.numero_cuota as number;
    const pagado = (p.a_capital ?? 0) + (p.a_interes ?? 0);
    pagosPorCuota.set(num, (pagosPorCuota.get(num) ?? 0) + pagado);
  }

  return (cuotasData ?? []).map(row => 
    mapRowToCuota(
      row,
      pagosPorCuota.get(row.numero_cuota as number) ?? 0,
      cuotasMap.get(row.numero_cuota as number)
    )
  );
}

// ── Actualizar cuota ──────────────────────────────────────────

export async function actualizarCuota(cuota: Cuota): Promise<Cuota> {
  let estado: 'pendiente' | 'parcial' | 'pagada';
  if (cuota.pagada || cuota.montoPagado >= cuota.totalCuota - 0.01) {
    estado = 'pagada';
  } else if (cuota.montoPagado > 0) {
    estado = 'parcial';
  } else {
    estado = 'pendiente';
  }

  const { error } = await supabase
    .from('cuota')
    .update({ estado })
    .eq('id_prestamo', cuota.prestamoId)
    .eq('numero_cuota', cuota.numeroCuota);

  if (error) throw new Error(`Error al actualizar cuota: ${error.message}`);
  return { ...cuota, pagada: estado === 'pagada' };
}

// ── Saldo pendiente via vista v_saldo_prestamo ───────────────

export async function obtenerSaldoPrestamo(prestamoId: string): Promise<number> {
  const { data, error } = await supabase
    .from('v_saldo_prestamo')
    .select('saldo_pendiente')
    .eq('id_prestamo', prestamoId)
    .maybeSingle();

  if (error) throw new Error(`Error al obtener saldo: ${error.message}`);
  return (data as any)?.saldo_pendiente ?? 0;
}

// ── Días de atraso via vista v_cuota_atrasada ────────────────

export async function obtenerCuotasAtrasadas(): Promise<
  { id_prestamo: string; id_cliente: string; dias_atraso: number; monto_atrasado: number }[]
> {
  const { data, error } = await supabase.from('v_cuota_atrasada').select('*');
  if (error) throw new Error(`Error al obtener cuotas atrasadas: ${error.message}`);
  return data ?? [];
}

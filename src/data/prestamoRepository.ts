// ============================================================
// REPOSITORIO DE PRÉSTAMOS — Supabase + Offline Protection
// Única puerta de entrada para leer/escribir préstamos.
//
// CONVERSIÓN DE TASAS:
//   - Pantalla usa porcentaje (ej. 10 → 10%)
//   - Base de datos almacena decimal (0.10)
//   - La conversión se hace AQUÍ, no en la pantalla.
// ============================================================

import { supabase } from '../lib/supabaseClient';
import type { Cuota, Prestamo, EstadoPrestamo } from '../types';
import { withOfflineProtection } from '../lib/offlineWrapper';
import { remapPendingId } from '../lib/offlineQueue';
import { isReplaying } from '../lib/syncState';

// ── Helpers de mapeo ──────────────────────────────────────────

function mapRowToPrestamo(row: Record<string, any>): Prestamo {
  return {
    id: String(row.id_prestamo),
    clienteId: String(row.id_cliente),
    monto: row.monto as number,
    // DB guarda en decimal → la pantalla muestra decimal (p.ej. 0.10 = 10%)
    // El campo tasaMensual en el dominio también es decimal.
    tasaMensual: row.tasa_interes as number,
    tipoInteres: row.tipo_interes as 'simple' | 'compuesto',
    plazoEnSemanas: row.plazo_semanas as number,
    fechaInicio: row.fecha_inicio as string,
    comision: row.comision != null ? (row.comision as number) : undefined,
    tipoComision: (row.comision_modo as any) || 'descontada_desembolso',
    tasaMora: row.tasa_mora != null ? (row.tasa_mora as number) : undefined,
    diasGracia: (row.dias_gracia as number) ?? 0,
    estado: row.estado as EstadoPrestamo,
    creadoEn: row.fecha_inicio as string,
  };
}

// ── Obtener todos ─────────────────────────────────────────────

export async function obtenerPrestamos(): Promise<Prestamo[]> {
  const { data, error } = await supabase
    .from('prestamo')
    .select('*')
    .order('fecha_inicio', { ascending: false });

  if (error) throw new Error(`Error al obtener préstamos: ${error.message}`);
  return (data ?? []).map(mapRowToPrestamo);
}

// ── Obtener por cliente ───────────────────────────────────────

export async function obtenerPrestamosPorCliente(clienteId: string): Promise<Prestamo[]> {
  const { data, error } = await supabase
    .from('prestamo')
    .select('*')
    .eq('id_cliente', clienteId)
    .order('fecha_inicio', { ascending: false });

  if (error) throw new Error(`Error al obtener préstamos del cliente: ${error.message}`);
  return (data ?? []).map(mapRowToPrestamo);
}

// ── Obtener activo por cliente ────────────────────────────────

export async function obtenerPrestamoActivo(clienteId: string): Promise<Prestamo | undefined> {
  const { data, error } = await supabase
    .from('prestamo')
    .select('*')
    .eq('id_cliente', clienteId)
    .eq('estado', 'activo')
    .maybeSingle();

  if (error) throw new Error(`Error al verificar préstamo activo: ${error.message}`);
  return data ? mapRowToPrestamo(data) : undefined;
}

// ── Obtener por ID ────────────────────────────────────────────

export async function obtenerPrestamoPorId(id: string): Promise<Prestamo | undefined> {
  const { data, error } = await supabase
    .from('prestamo')
    .select('*')
    .eq('id_prestamo', id)
    .maybeSingle();

  if (error) throw new Error(`Error al obtener préstamo: ${error.message}`);
  return data ? mapRowToPrestamo(data) : undefined;
}

// ── Guardar préstamo + cuotas (transacción compensada) ───────

export async function guardarPrestamo(
  datos: Omit<Prestamo, 'id' | 'estado' | 'creadoEn'>,
  cuotas: Omit<Cuota, 'id' | 'pagada' | 'montoPagado'>[],
  _offlineId?: string,
): Promise<Prestamo> {
  const prestamoId = _offlineId || crypto.randomUUID();

  return withOfflineProtection({
    operationKey: 'guardarPrestamo',
    operationType: 'insert',
    payload: { datos, cuotas, _offlineId: prestamoId },

    execute: async () => {
      // 1. Insertar el préstamo
      const { data: prestamoData, error: errP } = await supabase.from('prestamo').insert({
        id_cliente: datos.clienteId,
        monto: datos.monto,
        tasa_interes: datos.tasaMensual,
        tipo_interes: datos.tipoInteres,
        fecha_inicio: datos.fechaInicio,
        plazo_semanas: datos.plazoEnSemanas,
        comision: datos.comision || 0,
        comision_modo: datos.tipoComision === 'sumada_deuda' ? 'sumada' : 'descontada',
        tasa_mora: datos.tasaMora || null,
        dias_gracia: datos.diasGracia || 0,
        estado: 'activo',
      }).select().single();

      if (errP) {

        // Manejo amigable del error de préstamo activo duplicado
        if (errP.code === '23505' || errP.message?.includes('unique')) {
          throw new Error('Este cliente ya tiene un préstamo activo. Debe pagarlo antes de adquirir otro.');
        }
        throw new Error(`Error al crear el préstamo: ${errP.message}`);
      }

      const id = String(prestamoData.id_prestamo);

      if (isReplaying() && _offlineId) {
        await remapPendingId(_offlineId, id);
      }
      const nuevo: Prestamo = {
        ...datos,
        id,
        estado: 'activo',
        creadoEn: datos.fechaInicio,
      };

      // 2. Insertar todas las cuotas
      if (cuotas.length > 0) {
        const { error: errQ } = await supabase.from('cuota').insert(
          cuotas.map((c) => ({
            id_prestamo: id,
            numero_cuota: c.numeroCuota,
            fecha_vencimiento: c.fechaVencimiento,
            valor_cuota: c.totalCuota,
            estado: 'pendiente',
          }))
        );

        if (errQ) {

          // Compensación: eliminar el préstamo recién creado
          await supabase.from('prestamo').delete().eq('id_prestamo', id);
          throw new Error(`Error al crear las cuotas (préstamo eliminado): ${errQ.message}`);
        }
      }

      return nuevo;
    },

    getFallbackResult: () => ({
      ...datos,
      id: prestamoId,
      estado: 'activo' as const,
      creadoEn: datos.fechaInicio,
    }),
  });
}

// ── Actualizar estado ─────────────────────────────────────────

export async function actualizarEstadoPrestamo(id: string, estado: EstadoPrestamo): Promise<void> {
  return withOfflineProtection({
    operationKey: 'actualizarEstadoPrestamo',
    operationType: 'update',
    payload: { id, estado },
    lww: { table: 'prestamo', keyField: 'id_prestamo', keyValue: id },

    execute: async () => {
      const { error } = await supabase
        .from('prestamo')
        .update({ estado })
        .eq('id_prestamo', id);

      if (error) throw new Error(`Error al actualizar estado del préstamo: ${error.message}`);
    },
  });
}

export async function actualizarPrestamo(prestamo: Prestamo): Promise<void> {
  return withOfflineProtection({
    operationKey: 'actualizarPrestamo',
    operationType: 'update',
    payload: prestamo,
    lww: { table: 'prestamo', keyField: 'id_prestamo', keyValue: prestamo.id },

    execute: async () => {
      const { error } = await supabase
        .from('prestamo')
        .update({
          id_cliente: prestamo.clienteId,
          monto: prestamo.monto,
          tasa_interes: prestamo.tasaMensual,
          tipo_interes: prestamo.tipoInteres,
          fecha_inicio: prestamo.fechaInicio,
          plazo_semanas: prestamo.plazoEnSemanas,
          comision: prestamo.comision ?? null,
          comision_modo: prestamo.tipoComision === 'sumada_deuda' ? 'sumada' : 'descontada',
          tasa_mora: prestamo.tasaMora ?? null,
          dias_gracia: prestamo.diasGracia ?? 0,
          estado: prestamo.estado,
        })
        .eq('id_prestamo', prestamo.id);

      if (error) throw new Error(`Error al actualizar préstamo: ${error.message}`);
    },
  });
}

// ── Eliminar préstamo ─────────────────────────────────────────

export async function eliminarPrestamo(id: string): Promise<void> {
  return withOfflineProtection({
    operationKey: 'eliminarPrestamo',
    operationType: 'delete',
    payload: { id },

    execute: async () => {
      // Primero eliminar pagos asociados
      const { error: errorPagos } = await supabase
        .from('pago')
        .delete()
        .eq('id_prestamo', id);
      if (errorPagos) throw new Error(`Error al eliminar pagos del préstamo: ${errorPagos.message}`);

      // Luego eliminar cuotas asociadas
      const { error: errorCuotas } = await supabase
        .from('cuota')
        .delete()
        .eq('id_prestamo', id);
      if (errorCuotas) throw new Error(`Error al eliminar cuotas del préstamo: ${errorCuotas.message}`);

      // Finalmente eliminar el préstamo
      const { error } = await supabase
        .from('prestamo')
        .delete()
        .eq('id_prestamo', id);

      if (error) throw new Error(`Error al eliminar préstamo: ${error.message}`);
    },
  });
}

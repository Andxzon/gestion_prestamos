// ============================================================
// REPOSITORIO DE CLIENTES — Supabase + Offline Protection
// Única puerta de entrada para leer/escribir clientes.
// Todas las escrituras pasan por withOfflineProtection para
// garantizar que los datos NUNCA se pierdan.
// ============================================================

import { supabase } from '../lib/supabaseClient';
import type { Cliente, Referencia } from '../types';
import { fechaHoyLocal } from '../logic/calculos';
import { withOfflineProtection } from '../lib/offlineWrapper';
import { remapPendingId } from '../lib/offlineQueue';
import { isReplaying } from '../lib/syncState';

// ── Helpers de mapeo ──────────────────────────────────────────

function mapRowToCliente(row: Record<string, any>, refs: Referencia[]): Cliente {
  return {
    id: String(row.id_cliente),
    nombre: row.nombre as string,
    telefono: row.telefono as string,
    direccion: row.direccion as string,
    documento: (row.documento as string) || undefined,
    referencias: refs,
    creadoEn: '',
  };
}

function mapRowToReferencia(row: Record<string, any>): Referencia {
  return {
    nombre: row.nombre as string,
    telefono: row.telefono as string,
    parentesco: row.parentesco as string,
  };
}

// ── Obtener todos ─────────────────────────────────────────────

export async function obtenerClientes(): Promise<Cliente[]> {
  const { data: clientes, error: errC } = await supabase
    .from('cliente')
    .select('*')
    .order('nombre');

  if (errC) throw new Error(`Error al obtener clientes: ${errC.message}`);

  const { data: refs, error: errR } = await supabase
    .from('referencia')
    .select('*');

  if (errR) throw new Error(`Error al obtener referencias: ${errR.message}`);

  return (clientes ?? []).map((cli) => {
    const refsCli = (refs ?? [])
      .filter((r) => r.id_cliente === cli.id_cliente)
      .map(mapRowToReferencia);
    return mapRowToCliente(cli, refsCli);
  });
}

// ── Obtener por ID ────────────────────────────────────────────

export async function obtenerClientePorId(id: string): Promise<Cliente | undefined> {
  const { data: cli, error: errC } = await supabase
    .from('cliente')
    .select('*')
    .eq('id_cliente', id)
    .single();

  if (errC) {
    if (errC.code === 'PGRST116') return undefined; // Not found
    throw new Error(`Error al obtener cliente: ${errC.message}`);
  }
  if (!cli) return undefined;

  const { data: refs, error: errR } = await supabase
    .from('referencia')
    .select('*')
    .eq('id_cliente', id);

  if (errR) throw new Error(`Error al obtener referencias: ${errR.message}`);

  return mapRowToCliente(cli, (refs ?? []).map(mapRowToReferencia));
}

// ── Guardar (insertar) ────────────────────────────────────────

export async function guardarCliente(
  datos: Omit<Cliente, 'id' | 'creadoEn'>,
  _offlineId?: string,
): Promise<Cliente> {
  // Pre-generar UUID para idempotencia en replays
  const clienteId = _offlineId || crypto.randomUUID();

  return withOfflineProtection({
    operationKey: 'guardarCliente',
    operationType: 'insert',
    payload: { ...datos, _offlineId: clienteId },

    execute: async () => {
      const { data: cliData, error: errC } = await supabase.from('cliente').insert({
        nombre: datos.nombre,
        telefono: datos.telefono,
        direccion: datos.direccion,
        documento: datos.documento ?? null,
      }).select().single();

      if (errC) throw new Error(`Error al guardar cliente: ${errC.message}`);

      const id = String(cliData.id_cliente);

      // En replay, otros registros pendientes pueden apuntar al ID local temporal.
      if (isReplaying() && _offlineId) {
        await remapPendingId(_offlineId, id);
      }

      if (datos.referencias.length > 0) {
        const { error: errR } = await supabase.from('referencia').insert(
          datos.referencias.map((r) => ({
            id_cliente: id,
            nombre: r.nombre,
            telefono: r.telefono,
            parentesco: r.parentesco,
          }))
        );
        if (errR) {
          await supabase.from('cliente').delete().eq('id_cliente', id);
          throw new Error(`Error al guardar referencias: ${errR.message}`);
        }
      }

      return { ...datos, id, creadoEn: fechaHoyLocal() };
    },

    getFallbackResult: () => ({
      ...datos,
      id: clienteId,
      creadoEn: fechaHoyLocal(),
    }),
  });
}

// ── Actualizar ────────────────────────────────────────────────

export async function actualizarCliente(cliente: Cliente): Promise<Cliente> {
  return withOfflineProtection({
    operationKey: 'actualizarCliente',
    operationType: 'update',
    payload: cliente,
    lww: { table: 'cliente', keyField: 'id_cliente', keyValue: cliente.id },

    execute: async () => {
      const { error: errC } = await supabase
        .from('cliente')
        .update({
          nombre: cliente.nombre,
          telefono: cliente.telefono,
          direccion: cliente.direccion,
          documento: cliente.documento ?? null,
        })
        .eq('id_cliente', cliente.id);

      if (errC) throw new Error(`Error al actualizar cliente: ${errC.message}`);

      // Reemplazar referencias: borrar las antiguas y reinsertar
      const { error: errD } = await supabase
        .from('referencia')
        .delete()
        .eq('id_cliente', cliente.id);

      if (errD) throw new Error(`Error al limpiar referencias: ${errD.message}`);

      if (cliente.referencias.length > 0) {
        const { error: errR } = await supabase.from('referencia').insert(
          cliente.referencias.map((r) => ({
            id_cliente: cliente.id,
            nombre: r.nombre,
            telefono: r.telefono,
            parentesco: r.parentesco,
          }))
        );
        if (errR) throw new Error(`Error al actualizar referencias: ${errR.message}`);
      }

      return cliente;
    },

    getFallbackResult: () => cliente,
  });
}

// ── Eliminar ──────────────────────────────────────────────────

export async function eliminarCliente(id: string): Promise<void> {
  return withOfflineProtection({
    operationKey: 'eliminarCliente',
    operationType: 'delete',
    payload: { id },

    execute: async () => {
      // Las referencias se eliminan por cascade en Supabase si está configurado,
      // si no, las eliminamos explícitamente primero.
      await supabase.from('referencia').delete().eq('id_cliente', id);
      const { error } = await supabase.from('cliente').delete().eq('id_cliente', id);
      if (error) throw new Error(`Error al eliminar cliente: ${error.message}`);
    },
  });
}

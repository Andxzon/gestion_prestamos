// ============================================================
// REPOSITORIO DEL DASHBOARD — Supabase
// ============================================================

import { supabase } from '../lib/supabaseClient';
import { fechaHoyLocal } from '../logic/calculos';

export interface DashboardStats {
  saldoPendiente: number;
  gananciaTotal: number;
  cobroHoy: number;
  clientesAtrasadosCount: number;
}

export interface ClienteAtrasado {
  id: string;
  nombre: string;
  diasAtraso: number;
  montoAtrasado: number;
}

export interface ReporteClienteRow {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  saldoPendiente: number;
  cuotasAtrasadas: number;
  estadoPrestamo: string;
  fechaUltimoPago: string;
}

export interface Proyeccion {
  recaudoEsperado: number;
  gananciaProyectada: number;
}

// ── Dashboard principal ───────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const hoy = fechaHoyLocal();

  // 1. Saldo total pendiente (desde vista v_saldo_prestamo)
  const { data: saldoData, error: errSaldo } = await supabase
    .from('v_saldo_prestamo')
    .select('saldo_pendiente');

  if (errSaldo) throw new Error(`Error al obtener saldo: ${errSaldo.message}`);

  const saldoPendiente = (saldoData ?? []).reduce(
    (sum: number, row: any) => sum + (row.saldo_pendiente ?? 0),
    0
  );

  // 2. Cobro hoy: cuotas vencidas hoy o antes, menos lo ya pagado
  const { data: cobroData, error: errCobro } = await supabase
    .from('cuota')
    .select('id_prestamo, numero_cuota, valor_cuota')
    .lte('fecha_vencimiento', hoy)
    .neq('estado', 'pagada');

  if (errCobro) throw new Error(`Error al obtener cobros de hoy: ${errCobro.message}`);

  // Fetch pagos for those cuotas to subtract what is already paid
  let cobroHoy = 0;
  if (cobroData && cobroData.length > 0) {
    const prestamoIds = Array.from(new Set(cobroData.map(c => c.id_prestamo)));
    const { data: pagosData } = await supabase
      .from('pago')
      .select('id_prestamo, numero_cuota, a_capital, a_interes')
      .in('id_prestamo', prestamoIds);
    
    const pagosMap = new Map<string, number>();
    for (const p of pagosData ?? []) {
      const key = `${p.id_prestamo}-${p.numero_cuota}`;
      const pagado = (p.a_capital ?? 0) + (p.a_interes ?? 0);
      pagosMap.set(key, (pagosMap.get(key) ?? 0) + pagado);
    }

    cobroHoy = cobroData.reduce((sum, c) => {
      const key = `${c.id_prestamo}-${c.numero_cuota}`;
      const pagado = pagosMap.get(key) ?? 0;
      return sum + (c.valor_cuota - pagado);
    }, 0);
  }

  // 3. Ganancia total: suma de a_interes + a_mora de pagos, más comisiones
  const { data: pagoData, error: errPago } = await supabase
    .from('pago')
    .select('a_interes, a_mora');

  if (errPago) throw new Error(`Error al obtener pagos: ${errPago.message}`);

  const { data: comisionData, error: errComision } = await supabase
    .from('prestamo')
    .select('comision')
    .eq('comision_modo', 'descontada_desembolso')
    .not('comision', 'is', null);

  if (errComision) throw new Error(`Error comisiones: ${errComision.message}`);

  let gananciaTotal = (pagoData ?? []).reduce(
    (sum: number, p: any) => sum + (p.a_interes ?? 0) + (p.a_mora ?? 0),
    0
  );
  gananciaTotal += (comisionData ?? []).reduce(
    (sum: number, p: any) => sum + (p.comision ?? 0),
    0
  );

  // 4. Clientes atrasados (v_cuota_atrasada + join manual a prestamo)
  // v_cuota_atrasada tiene id_prestamo, numero_cuota, fecha_vencimiento, valor_cuota, dias_atraso
  const { data: atrasadas, error: errAt } = await supabase
    .from('v_cuota_atrasada')
    .select('id_prestamo');

  if (errAt) throw new Error(`Error al obtener atrasados: ${errAt.message}`);

  let clientesAtrasadosCount = 0;
  if (atrasadas && atrasadas.length > 0) {
    const pIds = Array.from(new Set(atrasadas.map(a => a.id_prestamo)));
    const { data: prestamosAtrasados } = await supabase
      .from('prestamo')
      .select('id_cliente')
      .in('id_prestamo', pIds);
    
    const clientesIds = new Set((prestamosAtrasados ?? []).map(p => p.id_cliente));
    clientesAtrasadosCount = clientesIds.size;
  }

  return {
    saldoPendiente,
    gananciaTotal,
    cobroHoy,
    clientesAtrasadosCount,
  };
}

// ── Clientes atrasados ────────────────────────────────────────

export async function getClientesAtrasados(): Promise<ClienteAtrasado[]> {
  const { data: atrasadas, error: errAt } = await supabase
    .from('v_cuota_atrasada')
    .select('id_prestamo, numero_cuota, dias_atraso, valor_cuota');

  if (errAt) throw new Error(`Error al obtener clientes atrasados: ${errAt.message}`);
  if (!atrasadas || atrasadas.length === 0) return [];

  const pIds = Array.from(new Set(atrasadas.map(a => a.id_prestamo)));
  
  // Obtener info del préstamo y pagos para calcular la deuda real
  const [ { data: prestamos }, { data: pagos }, { data: clientes } ] = await Promise.all([
    supabase.from('prestamo').select('id_prestamo, id_cliente').in('id_prestamo', pIds),
    supabase.from('pago').select('id_prestamo, numero_cuota, a_capital, a_interes').in('id_prestamo', pIds),
    supabase.from('cliente').select('id_cliente, nombre') // idealmente solo los clientes de estos prestamos, pero fetch all is ok
  ]);

  const pMap = new Map((prestamos ?? []).map(p => [p.id_prestamo, p.id_cliente]));
  const cMap = new Map((clientes ?? []).map(c => [c.id_cliente, c.nombre]));

  const pagosMap = new Map<string, number>();
  for (const p of pagos ?? []) {
    const key = `${p.id_prestamo}-${p.numero_cuota}`;
    const pagado = (p.a_capital ?? 0) + (p.a_interes ?? 0);
    pagosMap.set(key, (pagosMap.get(key) ?? 0) + pagado);
  }

  const clientStats = new Map<string, { dias: number; monto: number }>();
  
  for (const a of atrasadas) {
    const idCliente = pMap.get(a.id_prestamo);
    if (!idCliente) continue;

    const key = `${a.id_prestamo}-${a.numero_cuota}`;
    const pagado = pagosMap.get(key) ?? 0;
    const deuda = a.valor_cuota - pagado;

    if (deuda > 0) {
      const exist = clientStats.get(idCliente);
      if (exist) {
        exist.dias = Math.max(exist.dias, a.dias_atraso);
        exist.monto += deuda;
      } else {
        clientStats.set(idCliente, { dias: a.dias_atraso, monto: deuda });
      }
    }
  }

  const resultado: ClienteAtrasado[] = [];
  for (const [id, stats] of clientStats.entries()) {
    resultado.push({
      id,
      nombre: cMap.get(id) ?? 'Desconocido',
      diasAtraso: stats.dias,
      montoAtrasado: stats.monto,
    });
  }

  return resultado.sort((a, b) => b.diasAtraso - a.diasAtraso);
}

// ── Reporte de clientes ───────────────────────────────────────

export async function obtenerReporteClientes(): Promise<ReporteClienteRow[]> {
  const [
    { data: clientes, error: errC },
    { data: prestamos, error: errP },
    { data: saldos, error: errS },
    { data: atrasadas, error: errA },
    { data: pagos, error: errPg },
  ] = await Promise.all([
    supabase.from('cliente').select('id_cliente, nombre, direccion, telefono'),
    supabase.from('prestamo').select('id_prestamo, id_cliente, estado, fecha_inicio'),
    supabase.from('v_saldo_prestamo').select('id_prestamo, id_cliente, saldo_pendiente'),
    supabase.from('v_cuota_atrasada').select('id_prestamo'),
    supabase.from('pago').select('id_prestamo, fecha').order('fecha', { ascending: false }),
  ]);

  if (errC) throw new Error(`Error clientes: ${errC.message}`);
  if (errP) throw new Error(`Error préstamos: ${errP.message}`);
  if (errS) throw new Error(`Error saldos: ${errS.message}`);
  if (errA) throw new Error(`Error atrasadas: ${errA.message}`);
  if (errPg) throw new Error(`Error pagos: ${errPg.message}`);

  const pMap = new Map((prestamos ?? []).map((p: any) => [p.id_prestamo, p.id_cliente]));

  const saldoPorPrestamo = new Map<string, number>();
  for (const s of saldos ?? []) {
    saldoPorPrestamo.set((s as any).id_prestamo, (s as any).saldo_pendiente ?? 0);
  }

  const atrasadasPorCliente = new Map<string, number>();
  for (const a of atrasadas ?? []) {
    const cid = pMap.get((a as any).id_prestamo);
    if (cid) {
      atrasadasPorCliente.set(cid, (atrasadasPorCliente.get(cid) ?? 0) + 1);
    }
  }

  const ultimoPagoPorPrestamo = new Map<string, string>();
  for (const pg of pagos ?? []) {
    const pid = (pg as any).id_prestamo as string;
    if (!ultimoPagoPorPrestamo.has(pid)) {
      ultimoPagoPorPrestamo.set(pid, (pg as any).fecha as string);
    }
  }

  return (clientes ?? []).map((cli: any) => {
    const prestamosCliente = (prestamos ?? []).filter((p: any) => p.id_cliente === cli.id_cliente);
    const prestamoActivo = prestamosCliente.sort((a: any, b: any) =>
      b.fecha_inicio.localeCompare(a.fecha_inicio)
    )[0];

    const saldoPendiente = prestamosCliente.reduce(
      (sum: number, p: any) => sum + (saldoPorPrestamo.get(p.id_prestamo) ?? 0),
      0
    );

    const cuotasAtrasadas = atrasadasPorCliente.get(cli.id_cliente) ?? 0;

    const ultimoPago = prestamosCliente
      .map((p: any) => ultimoPagoPorPrestamo.get(p.id_prestamo))
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? 'N/A';

    return {
      id: cli.id_cliente as string,
      nombre: cli.nombre as string,
      direccion: cli.direccion as string,
      telefono: cli.telefono as string,
      saldoPendiente,
      cuotasAtrasadas,
      estadoPrestamo: prestamoActivo ? prestamoActivo.estado : 'Sin préstamos',
      fechaUltimoPago: ultimoPago,
    };
  });
}

// ── Proyección ────────────────────────────────────────────────

export async function obtenerProyeccion(
  fechaInicio: string,
  fechaFin: string
): Promise<Proyeccion> {
  const { data, error } = await supabase
    .from('cuota')
    .select('valor_cuota')
    .neq('estado', 'pagada')
    .gte('fecha_vencimiento', fechaInicio)
    .lte('fecha_vencimiento', fechaFin);

  if (error) throw new Error(`Error al obtener proyección: ${error.message}`);

  const recaudoEsperado = (data ?? []).reduce(
    (sum: number, c: any) => sum + (c.valor_cuota ?? 0),
    0
  );

  return { recaudoEsperado, gananciaProyectada: 0 };
}

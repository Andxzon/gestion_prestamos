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
  desgloseGanancia: { nombre: string; monto: number }[];
  desgloseCobroHoy: { nombre: string; monto: number }[];
}

export interface ClienteAtrasado {
  id: string;
  nombre: string;
  diasAtraso: number;
  montoAtrasado: number;
}

export interface CobroSemana {
  id_prestamo: string;
  numero_cuota: number;
  nombre: string;
  fechaCobro: string;
  monto: number;
}

export interface ReporteClienteRow {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  valorPrestamo: number;
  interesesPagados: number;
  interesesMora: number;
  totalAbonado: number;
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

  // 1. Saldo total pendiente (Total esperado - Total abonado)
  const { data: cuotasData, error: errCuotas } = await supabase.from('cuota').select('valor_cuota, estado');
  const { data: pagosAll, error: errPagosAll } = await supabase.from('pago').select('a_capital, a_interes, a_mora');

  if (errCuotas) throw new Error(`Error al obtener cuotas: ${errCuotas.message}`);
  if (errPagosAll) throw new Error(`Error al obtener pagos: ${errPagosAll.message}`);

  const totalEsperado = (cuotasData ?? []).reduce((sum, c) => sum + (c.valor_cuota ?? 0), 0);
  const totalPagado = (pagosAll ?? []).reduce((sum, p) => sum + (p.a_capital ?? 0) + (p.a_interes ?? 0) + (p.a_mora ?? 0), 0);
  const saldoPendiente = Math.max(0, totalEsperado - totalPagado);

  // 2. Cobro hoy: cuotas vencidas hoy o antes, menos lo ya pagado
  const { data: cobroData, error: errCobro } = await supabase
    .from('cuota')
    .select('id_prestamo, numero_cuota, valor_cuota')
    .lte('fecha_vencimiento', hoy)
    .neq('estado', 'pagada');

  if (errCobro) throw new Error(`Error al obtener cobros de hoy: ${errCobro.message}`);

  // Fetch pagos for those cuotas to subtract what is already paid
  let cobroHoy = 0;
  const cobroPorPrestamo = new Map<string, number>();
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
      const pendiente = Math.max(0, c.valor_cuota - pagado);
      cobroPorPrestamo.set(c.id_prestamo, (cobroPorPrestamo.get(c.id_prestamo) ?? 0) + pendiente);
      return sum + pendiente;
    }, 0);
  }

  // 3. Ganancia total: suma de a_interes + a_mora de pagos, más comisiones
  const { data: pagoData, error: errPago } = await supabase
    .from('pago')
    .select('id_prestamo, a_interes, a_mora');

  if (errPago) throw new Error(`Error al obtener pagos: ${errPago.message}`);

  const { data: comisionData, error: errComision } = await supabase
    .from('prestamo')
    .select('id_prestamo, id_cliente, comision')
    .eq('comision_modo', 'descontada')
    .not('comision', 'is', null);

  if (errComision) throw new Error(`Error comisiones: ${errComision.message}`);

  const [ { data: prestamosDesglose, error: errPrestamosDesglose }, { data: clientesDesglose, error: errClientesDesglose } ] = await Promise.all([
    supabase.from('prestamo').select('id_prestamo, id_cliente').not('id_prestamo', 'is', null),
    supabase.from('cliente').select('id_cliente, nombre'),
  ]);
  if (errPrestamosDesglose) throw new Error(`Error al obtener préstamos para el desglose: ${errPrestamosDesglose.message}`);
  if (errClientesDesglose) throw new Error(`Error al obtener clientes para el desglose: ${errClientesDesglose.message}`);

  const clientePorPrestamo = new Map((prestamosDesglose ?? []).map(p => [p.id_prestamo, p.id_cliente]));
  const nombrePorCliente = new Map((clientesDesglose ?? []).map(c => [c.id_cliente, c.nombre]));
  const gananciaPorCliente = new Map<string, number>();
  for (const p of pagoData ?? []) {
    const idCliente = clientePorPrestamo.get(p.id_prestamo);
    if (idCliente == null) continue;
    gananciaPorCliente.set(idCliente, (gananciaPorCliente.get(idCliente) ?? 0) + (p.a_interes ?? 0) + (p.a_mora ?? 0));
  }
  for (const p of comisionData ?? []) {
    if (p.id_cliente == null) continue;
    gananciaPorCliente.set(p.id_cliente, (gananciaPorCliente.get(p.id_cliente) ?? 0) + (p.comision ?? 0));
  }
  const aDesglose = (montos: Map<any, number>) => Array.from(montos, ([id, monto]) => ({
    nombre: nombrePorCliente.get(id) ?? 'Cliente desconocido',
    monto,
  })).filter(item => item.monto > 0).sort((a, b) => b.monto - a.monto);
  const desgloseGanancia = aDesglose(gananciaPorCliente);
  const desgloseCobroHoy = aDesglose(new Map(Array.from(cobroPorPrestamo, ([idPrestamo, monto]) => [clientePorPrestamo.get(idPrestamo), monto] as const)
    .reduce((map, [idCliente, monto]) => {
      if (idCliente != null) map.set(idCliente, (map.get(idCliente) ?? 0) + monto);
      return map;
    }, new Map<any, number>())));
  const gananciaTotal = desgloseGanancia.reduce((sum, item) => sum + item.monto, 0);

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
    desgloseGanancia,
    desgloseCobroHoy,
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

// ── Cobros de esta semana ─────────────────────────────────────

export async function getCobrosSemana(): Promise<CobroSemana[]> {
  const hoyStr = fechaHoyLocal();
  const dateHoy = new Date(hoyStr + 'T00:00:00');
  const maxDate = new Date(dateHoy);
  maxDate.setDate(dateHoy.getDate() + 7);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  const { data: cuotas, error } = await supabase
    .from('cuota')
    .select('id_prestamo, numero_cuota, valor_cuota, fecha_vencimiento')
    .neq('estado', 'pagada')
    .gte('fecha_vencimiento', hoyStr)
    .lte('fecha_vencimiento', maxDateStr)
    .order('fecha_vencimiento', { ascending: true });

  if (error) throw new Error(`Error al obtener cobros de la semana: ${error.message}`);
  if (!cuotas || cuotas.length === 0) return [];

  const pIds = Array.from(new Set(cuotas.map(c => c.id_prestamo)));
  const [ { data: prestamos }, { data: clientes }, { data: pagos } ] = await Promise.all([
    supabase.from('prestamo').select('id_prestamo, id_cliente').in('id_prestamo', pIds),
    supabase.from('cliente').select('id_cliente, nombre'),
    supabase.from('pago').select('id_prestamo, numero_cuota, a_capital, a_interes').in('id_prestamo', pIds),
  ]);

  const pMap = new Map((prestamos ?? []).map(p => [p.id_prestamo, p.id_cliente]));
  const cMap = new Map((clientes ?? []).map(c => [c.id_cliente, c.nombre]));

  const pagosMap = new Map<string, number>();
  for (const p of pagos ?? []) {
    const key = `${p.id_prestamo}-${p.numero_cuota}`;
    const pagado = (p.a_capital ?? 0) + (p.a_interes ?? 0);
    pagosMap.set(key, (pagosMap.get(key) ?? 0) + pagado);
  }

  const resultado: CobroSemana[] = [];
  for (const c of cuotas) {
    const key = `${c.id_prestamo}-${c.numero_cuota}`;
    const pagado = pagosMap.get(key) ?? 0;
    const monto = c.valor_cuota - pagado;
    
    if (monto > 0) {
      const idCliente = pMap.get(c.id_prestamo);
      const nombre = idCliente ? (cMap.get(idCliente) ?? 'Desconocido') : 'Desconocido';
      resultado.push({
        id_prestamo: c.id_prestamo,
        numero_cuota: c.numero_cuota,
        nombre,
        fechaCobro: c.fecha_vencimiento,
        monto,
      });
    }
  }

  return resultado;
}

// ── Reporte de clientes ───────────────────────────────────────

export async function obtenerReporteClientes(): Promise<ReporteClienteRow[]> {
  const [
    { data: clientes, error: errC },
    { data: prestamos, error: errP },
    , // { data: saldos, error: errS } no se usan
    { data: atrasadas, error: errA },
    { data: pagos, error: errPg },
  ] = await Promise.all([
    supabase.from('cliente').select('id_cliente, nombre, direccion, telefono'),
    supabase.from('prestamo').select('id_prestamo, id_cliente, estado, fecha_inicio, monto'),
    supabase.from('v_saldo_prestamo').select('id_prestamo, id_cliente, saldo_pendiente'),
    supabase.from('v_cuota_atrasada').select('id_prestamo'),
    supabase.from('pago').select('id_prestamo, fecha, a_capital, a_interes, a_mora').order('fecha', { ascending: false }),
    supabase.from('cuota').select('id_prestamo, valor_cuota'),
  ]);

  if (errC) throw new Error(`Error clientes: ${errC.message}`);
  if (errP) throw new Error(`Error préstamos: ${errP.message}`);
  if (errA) throw new Error(`Error atrasadas: ${errA.message}`);
  if (errPg) throw new Error(`Error pagos: ${errPg.message}`);

  const pMap = new Map((prestamos ?? []).map((p: any) => [p.id_prestamo, p.id_cliente]));

  const atrasadasPorCliente = new Map<string, number>();
  for (const a of atrasadas ?? []) {
    const cid = pMap.get((a as any).id_prestamo);
    if (cid) {
      atrasadasPorCliente.set(cid, (atrasadasPorCliente.get(cid) ?? 0) + 1);
    }
  }

  const { data: cuotasData } = await supabase.from('cuota').select('id_prestamo, valor_cuota');
  const totalEsperadoPorPrestamo = new Map<string, number>();
  for (const c of cuotasData ?? []) {
    totalEsperadoPorPrestamo.set(c.id_prestamo, (totalEsperadoPorPrestamo.get(c.id_prestamo) ?? 0) + c.valor_cuota);
  }

  const pagosPorPrestamo = new Map<string, { ultimo: string; cap: number; int: number; mora: number }>();
  for (const pg of pagos ?? []) {
    const pid = (pg as any).id_prestamo as string;
    if (!pagosPorPrestamo.has(pid)) {
      pagosPorPrestamo.set(pid, { ultimo: (pg as any).fecha, cap: 0, int: 0, mora: 0 });
    }
    const stat = pagosPorPrestamo.get(pid)!;
    stat.cap += (pg as any).a_capital ?? 0;
    stat.int += (pg as any).a_interes ?? 0;
    stat.mora += (pg as any).a_mora ?? 0;
  }

  return (clientes ?? []).map((cli: any) => {
    const prestamosCliente = (prestamos ?? []).filter((p: any) => p.id_cliente === cli.id_cliente);
    const prestamoActivo = prestamosCliente.sort((a: any, b: any) =>
      b.fecha_inicio.localeCompare(a.fecha_inicio)
    )[0];

    const valorPrestamo = prestamosCliente.reduce((sum: number, p: any) => sum + (p.monto ?? 0), 0);

    let interesesPagados = 0;
    let interesesMora = 0;
    let totalAbonado = 0;
    let totalEsperado = 0;
    
    prestamosCliente.forEach((p: any) => {
      totalEsperado += (totalEsperadoPorPrestamo.get(p.id_prestamo) ?? 0);
      const stats = pagosPorPrestamo.get(p.id_prestamo);
      if (stats) {
        interesesPagados += stats.int;
        interesesMora += stats.mora;
        totalAbonado += stats.cap + stats.int + stats.mora;
      }
    });

    const saldoPendiente = Math.max(0, totalEsperado - totalAbonado);

    const cuotasAtrasadas = atrasadasPorCliente.get(cli.id_cliente) ?? 0;

    const ultimoPago = prestamosCliente
      .map((p: any) => pagosPorPrestamo.get(p.id_prestamo)?.ultimo)
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? 'N/A';

    return {
      id: cli.id_cliente as string,
      nombre: cli.nombre as string,
      direccion: cli.direccion as string,
      telefono: cli.telefono as string,
      valorPrestamo,
      interesesPagados,
      interesesMora,
      totalAbonado,
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

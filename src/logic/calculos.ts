// ============================================================
// CÁLCULOS FINANCIEROS — funciones puras, sin efectos secundarios
// Todas las fórmulas del negocio viven aquí.
// ============================================================

import type { TipoInteres, TipoComision } from '../types';

// ────────────────────────────────────────────────────────────
// TIPOS DE RESULTADO
// ────────────────────────────────────────────────────────────

export interface ResumenPrestamo {
  /** Pago que el cliente debe hacer cada semana */
  cuotaSemanal: number;
  /** Suma de intereses a lo largo del plazo */
  interesTotal: number;
  /** Capital + intereses (cuotaSemanal × plazoEnSemanas) */
  totalAPagar: number;
  /** Dinero en mano que recibe el cliente */
  montoEfectivoCliente: number;
  /** Base sobre la que se calculan los intereses */
  capitalBase: number;
  /** Tasa semanal efectiva usada en los cálculos */
  tasaSemanalEfectiva: number;
  /** Fecha del último día de pago (YYYY-MM-DD) */
  fechaFinal: string;
}

export interface CuotaGenerada {
  numeroCuota: number;
  fechaVencimiento: string;
  montoCapital: number;
  montoInteres: number;
  totalCuota: number;
}

// ────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL: RESUMEN DEL PRÉSTAMO
// ────────────────────────────────────────────────────────────

/**
 * Calcula todos los datos financieros del préstamo antes de crearlo.
 * Fórmulas:
 *   Simple   → interés_total = capital × tasa_mensual × (plazo / 30)
 *              cuota_diaria  = (capital + interés_total) / plazo
 *   Compuesto → i = (1 + tasa_mensual)^(1/30) − 1   [tasa diaria equivalente]
 *              cuota_diaria = capital × i / (1 − (1 + i)^(−plazo))   [anualidad]
 *              interés_total = cuota_diaria × plazo − capital
 *
 * Comisión:
 *   descontada_desembolso → cliente recibe monto − comisión, interés sobre monto
 *   sumada_deuda          → cliente recibe monto, interés sobre monto + comisión
 */
export function calcularResumenPrestamo(params: {
  monto: number;
  tasaMensual: number;
  tipoInteres: TipoInteres;
  plazoEnSemanas: number;
  fechaInicio: string;
  comision?: number;
  tipoComision?: TipoComision;
}): ResumenPrestamo {
  const { monto, tasaMensual, tipoInteres, plazoEnSemanas, fechaInicio } = params;
  const comision = params.comision ?? 0;
  const tipoComision = params.tipoComision ?? 'descontada_desembolso';

  // ── Capital base (sobre el que se calcula el interés) ────
  const capitalBase =
    tipoComision === 'sumada_deuda' ? monto + comision : monto;

  // ── Lo que recibe el cliente en mano ────────────────────
  const montoEfectivoCliente =
    tipoComision === 'descontada_desembolso' ? monto - comision : monto;

  let cuotaSemanal: number;
  let interesTotal: number;
  let tasaSemanalEfectiva: number;

  if (tasaMensual === 0) {
    // Sin interés
    tasaSemanalEfectiva = 0;
    cuotaSemanal = capitalBase / plazoEnSemanas;
    interesTotal = 0;
  } else if (tipoInteres === 'simple') {
    tasaSemanalEfectiva = tasaMensual / 4;
    interesTotal = capitalBase * tasaMensual * (plazoEnSemanas / 4);
    cuotaSemanal = (capitalBase + interesTotal) / plazoEnSemanas;
  } else {
    // Interés compuesto — fórmula de anualidad
    tasaSemanalEfectiva = Math.pow(1 + tasaMensual, 1 / 4) - 1;
    cuotaSemanal =
      (capitalBase * tasaSemanalEfectiva) /
      (1 - Math.pow(1 + tasaSemanalEfectiva, -plazoEnSemanas));
    interesTotal = cuotaSemanal * plazoEnSemanas - capitalBase;
  }

  // ── Fecha final (semana N del préstamo) ────────────────────
  const fecha = new Date(fechaInicio + 'T00:00:00');
  fecha.setDate(fecha.getDate() + (plazoEnSemanas - 1) * 7);
  const fechaFinal = fecha.toISOString().split('T')[0];

  return {
    cuotaSemanal,
    interesTotal,
    totalAPagar: cuotaSemanal * plazoEnSemanas,
    montoEfectivoCliente,
    capitalBase,
    tasaSemanalEfectiva,
    fechaFinal,
  };
}

// ────────────────────────────────────────────────────────────
// GENERACIÓN DEL CALENDARIO DE CUOTAS
// ────────────────────────────────────────────────────────────

/**
 * Genera el calendario diario de cuotas.
 *
 * Simple:    capital y interés proporcionales fijos por día.
 * Compuesto: tabla de amortización — cuota fija pero desglose varía cada día.
 *            El último pago se ajusta para liquidar exactamente el saldo.
 */
export function generarCuotasBase(
  capitalBase: number,
  cuotaSemanal: number,
  tasaSemanalEfectiva: number,
  tipoInteres: TipoInteres,
  plazoEnSemanas: number,
  fechaInicio: string
): CuotaGenerada[] {
  const cuotas: CuotaGenerada[] = [];

  const addDias = (base: string, dias: number): string => {
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().split('T')[0];
  };

  if (tipoInteres === 'simple' || tasaSemanalEfectiva === 0) {
    // Cada cuota tiene la misma proporción de capital e interés
    const capitalSemana = capitalBase / plazoEnSemanas;
    const interesSemana = capitalBase * tasaSemanalEfectiva;

    for (let n = 1; n <= plazoEnSemanas; n++) {
      cuotas.push({
        numeroCuota: n,
        fechaVencimiento: addDias(fechaInicio, (n - 1) * 7),
        montoCapital: capitalSemana,
        montoInteres: interesSemana,
        totalCuota: cuotaSemanal,
      });
    }
  } else {
    // Tabla de amortización (interés compuesto)
    let saldo = capitalBase;
    const i = tasaSemanalEfectiva;

    for (let n = 1; n <= plazoEnSemanas; n++) {
      const interesSemana = saldo * i;
      let capitalSemana: number;
      let totalSemana: number;

      if (n === plazoEnSemanas) {
        // Último pago: liquidar saldo exacto para eliminar error de redondeo
        capitalSemana = saldo;
        totalSemana = saldo + interesSemana;
      } else {
        capitalSemana = cuotaSemanal - interesSemana;
        totalSemana = cuotaSemanal;
      }

      cuotas.push({
        numeroCuota: n,
        fechaVencimiento: addDias(fechaInicio, (n - 1) * 7),
        montoCapital: Math.max(0, capitalSemana),
        montoInteres: interesSemana,
        totalCuota: totalSemana,
      });

      saldo = Math.max(0, saldo - capitalSemana);
    }
  }

  return cuotas;
}

// ────────────────────────────────────────────────────────────
// MORA Y PAGOS
// ────────────────────────────────────────────────────────────

/**
 * Calcula la mora sobre una cuota vencida.
 * mora = totalCuota × tasaMoraDiaria × diasAtraso
 */
export function calcularMora(
  totalCuota: number,
  tasaMoraDiaria: number,
  diasAtraso: number,
  diasGracia: number = 0
): number {
  if (diasAtraso <= diasGracia) return 0;
  return totalCuota * tasaMoraDiaria * (diasAtraso - diasGracia);
}

/**
 * Distribuye un pago en orden: mora → interés → capital.
 * Devuelve cuánto se aplicó a cada rubro y el sobrante.
 */
export function distribuirPago(
  montoPago: number,
  moraPendiente: number,
  interesPendiente: number,
  capitalPendiente: number
): {
  aplicadoAMora: number;
  aplicadoAInteres: number;
  aplicadoACapital: number;
  sobrante: number;
} {
  let restante = montoPago;

  const aplicadoAMora = Math.min(restante, moraPendiente);
  restante -= aplicadoAMora;

  const aplicadoAInteres = Math.min(restante, interesPendiente);
  restante -= aplicadoAInteres;

  const aplicadoACapital = Math.min(restante, capitalPendiente);
  restante -= aplicadoACapital;

  return { aplicadoAMora, aplicadoAInteres, aplicadoACapital, sobrante: restante };
}

// ────────────────────────────────────────────────────────────
// UTILIDADES
// ────────────────────────────────────────────────────────────

/**
 * Calcula cuántos días de atraso tiene una cuota a partir de hoy.
 */
export function diasDeAtraso(fechaVencimiento: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVencimiento + 'T00:00:00');
  const diff = Math.floor((hoy.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

/**
 * Formatea un número como moneda colombiana (COP).
 */
export function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(valor));
}

/**
 * Formatea una fecha ISO a texto legible en español.
 * Ej: '2024-06-30' → '30 jun. 2024'
 */
export function formatearFecha(fechaISO: string): string {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Retorna la fecha actual en formato 'YYYY-MM-DD' usando la zona horaria LOCAL.
 * Evita el bug de toISOString() que opera en UTC y puede devolver el día
 * anterior/siguiente según la zona horaria del cliente (ej. Colombia UTC-5).
 */
export function fechaHoyLocal(): string {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

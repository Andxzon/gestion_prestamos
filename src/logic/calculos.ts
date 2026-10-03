// ============================================================
// CÁLCULOS FINANCIEROS — funciones puras, sin efectos secundarios
// Todas las fórmulas del negocio viven aquí.
// ============================================================

import type { TipoInteres, TipoComision } from '../types';

// ────────────────────────────────────────────────────────────
// TIPOS DE RESULTADO
// ────────────────────────────────────────────────────────────

export interface ResumenPrestamo {
  /** Pago que el cliente debe hacer cada día */
  cuotaDiaria: number;
  /** Suma de intereses a lo largo del plazo */
  interesTotal: number;
  /** Capital + intereses (cuotaDiaria × plazoEnDias) */
  totalAPagar: number;
  /** Dinero en mano que recibe el cliente */
  montoEfectivoCliente: number;
  /** Base sobre la que se calculan los intereses */
  capitalBase: number;
  /** Tasa diaria efectiva usada en los cálculos */
  tasaDiariaEfectiva: number;
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
  plazoEnDias: number;
  fechaInicio: string;
  comision?: number;
  tipoComision?: TipoComision;
}): ResumenPrestamo {
  const { monto, tasaMensual, tipoInteres, plazoEnDias, fechaInicio } = params;
  const comision = params.comision ?? 0;
  const tipoComision = params.tipoComision ?? 'descontada_desembolso';

  // ── Capital base (sobre el que se calcula el interés) ────
  const capitalBase =
    tipoComision === 'sumada_deuda' ? monto + comision : monto;

  // ── Lo que recibe el cliente en mano ────────────────────
  const montoEfectivoCliente =
    tipoComision === 'descontada_desembolso' ? monto - comision : monto;

  let cuotaDiaria: number;
  let interesTotal: number;
  let tasaDiariaEfectiva: number;

  if (tasaMensual === 0) {
    // Sin interés
    tasaDiariaEfectiva = 0;
    cuotaDiaria = capitalBase / plazoEnDias;
    interesTotal = 0;
  } else if (tipoInteres === 'simple') {
    tasaDiariaEfectiva = tasaMensual / 30;
    interesTotal = capitalBase * tasaMensual * (plazoEnDias / 30);
    cuotaDiaria = (capitalBase + interesTotal) / plazoEnDias;
  } else {
    // Interés compuesto — fórmula de anualidad
    tasaDiariaEfectiva = Math.pow(1 + tasaMensual, 1 / 30) - 1;
    cuotaDiaria =
      (capitalBase * tasaDiariaEfectiva) /
      (1 - Math.pow(1 + tasaDiariaEfectiva, -plazoEnDias));
    interesTotal = cuotaDiaria * plazoEnDias - capitalBase;
  }

  // ── Fecha final (día N del préstamo) ────────────────────
  const fecha = new Date(fechaInicio + 'T00:00:00');
  fecha.setDate(fecha.getDate() + plazoEnDias - 1);
  const fechaFinal = fecha.toISOString().split('T')[0];

  return {
    cuotaDiaria,
    interesTotal,
    totalAPagar: cuotaDiaria * plazoEnDias,
    montoEfectivoCliente,
    capitalBase,
    tasaDiariaEfectiva,
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
  cuotaDiaria: number,
  tasaDiariaEfectiva: number,
  tipoInteres: TipoInteres,
  plazoEnDias: number,
  fechaInicio: string
): CuotaGenerada[] {
  const cuotas: CuotaGenerada[] = [];

  const addDias = (base: string, dias: number): string => {
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().split('T')[0];
  };

  if (tipoInteres === 'simple' || tasaDiariaEfectiva === 0) {
    // Cada cuota tiene la misma proporción de capital e interés
    const capitalDia = capitalBase / plazoEnDias;
    const interesDia = capitalBase * tasaDiariaEfectiva;

    for (let n = 1; n <= plazoEnDias; n++) {
      cuotas.push({
        numeroCuota: n,
        fechaVencimiento: addDias(fechaInicio, n - 1),
        montoCapital: capitalDia,
        montoInteres: interesDia,
        totalCuota: cuotaDiaria,
      });
    }
  } else {
    // Tabla de amortización (interés compuesto)
    let saldo = capitalBase;
    const i = tasaDiariaEfectiva;

    for (let n = 1; n <= plazoEnDias; n++) {
      const interesDia = saldo * i;
      let capitalDia: number;
      let totalDia: number;

      if (n === plazoEnDias) {
        // Último pago: liquidar saldo exacto para eliminar error de redondeo
        capitalDia = saldo;
        totalDia = saldo + interesDia;
      } else {
        capitalDia = cuotaDiaria - interesDia;
        totalDia = cuotaDiaria;
      }

      cuotas.push({
        numeroCuota: n,
        fechaVencimiento: addDias(fechaInicio, n - 1),
        montoCapital: Math.max(0, capitalDia),
        montoInteres: interesDia,
        totalCuota: totalDia,
      });

      saldo = Math.max(0, saldo - capitalDia);
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

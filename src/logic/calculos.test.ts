// ============================================================
// TESTS DE CÁLCULOS FINANCIEROS — ejecutar con: npm test
// ============================================================
// Ejemplos numéricos verificables a mano para cada fórmula.

import { describe, it, expect } from 'vitest';
import {
  calcularResumenPrestamo,
  generarCuotasBase,
  distribuirPago,
  calcularMora,
  diasDeAtraso,
} from './calculos';

// ────────────────────────────────────────────────────────────
// calcularResumenPrestamo — Interés Simple
// ────────────────────────────────────────────────────────────

describe('calcularResumenPrestamo — interés simple', () => {
  it('calcula correctamente con 30 días al 10% mensual', () => {
    // Verificación manual:
    //   interésTotal = 600 000 × 0.10 × (30/30) = 60 000
    //   cuotaSemanal  = (600 000 + 60 000) / 30  = 22 000
    //   totalAPagar  = 22 000 × 30              = 660 000
    const r = calcularResumenPrestamo({
      monto: 600_000,
      tasaMensual: 0.10,
      tipoInteres: 'simple',
      plazoEnSemanas: 30,
      fechaInicio: '2024-06-01',
    });

    expect(r.interesTotal).toBeCloseTo(60_000, 0);
    expect(r.cuotaSemanal).toBeCloseTo(22_000, 0);
    expect(r.totalAPagar).toBeCloseTo(660_000, 0);
    expect(r.fechaFinal).toBe('2024-06-30');
    expect(r.capitalBase).toBe(600_000);
    expect(r.montoEfectivoCliente).toBe(600_000);
  });

  it('calcula correctamente con 15 días al 8% mensual', () => {
    // interésTotal = 300 000 × 0.08 × (15/30) = 12 000
    // cuotaSemanal  = (300 000 + 12 000) / 15  = 20 800
    const r = calcularResumenPrestamo({
      monto: 300_000,
      tasaMensual: 0.08,
      tipoInteres: 'simple',
      plazoEnSemanas: 15,
      fechaInicio: '2024-07-01',
    });

    expect(r.interesTotal).toBeCloseTo(12_000, 0);
    expect(r.cuotaSemanal).toBeCloseTo(20_800, 0);
    expect(r.totalAPagar).toBeCloseTo(312_000, 0);
    expect(r.fechaFinal).toBe('2024-07-15');
  });

  it('sin interés (tasa = 0): cuota es solo capital', () => {
    // cuotaSemanal = 300 000 / 30 = 10 000, sin interés
    const r = calcularResumenPrestamo({
      monto: 300_000,
      tasaMensual: 0,
      tipoInteres: 'simple',
      plazoEnSemanas: 30,
      fechaInicio: '2024-01-01',
    });

    expect(r.interesTotal).toBe(0);
    expect(r.cuotaSemanal).toBeCloseTo(10_000, 0);
    expect(r.totalAPagar).toBeCloseTo(300_000, 0);
  });
});

// ────────────────────────────────────────────────────────────
// calcularResumenPrestamo — Interés Compuesto (anualidad)
// ────────────────────────────────────────────────────────────

describe('calcularResumenPrestamo — interés compuesto', () => {
  it('fórmula de anualidad: 30 días al 10% mensual', () => {
    // i     = (1.10)^(1/30) - 1 ≈ 0.003175
    // cuota = 600 000 × 0.003175 / (1 − (1.003175)^−30)
    //       = 600 000 × 0.003175 / (1 − 1/1.10)
    //       = 600 000 × 0.003175 / 0.090909
    //       ≈ 20 955  (aproximado)
    // total = 20 955 × 30 ≈ 628 650
    const r = calcularResumenPrestamo({
      monto: 600_000,
      tasaMensual: 0.10,
      tipoInteres: 'compuesto',
      plazoEnSemanas: 30,
      fechaInicio: '2024-06-01',
    });

    // Verificamos que cuota ≈ 20 955 (tolerancia ±100)
    expect(r.cuotaSemanal).toBeGreaterThan(20_800);
    expect(r.cuotaSemanal).toBeLessThan(21_100);

    // El total × (1+i)^30 debe recuperar el capital
    // totalAPagar = cuota × 30 ≈ 628 650
    expect(r.totalAPagar).toBeCloseTo(r.cuotaSemanal * 30, 0);

    // Interés compuesto < interés simple para el mismo plazo y tasa
    // (porque la anualidad paga capital progresivamente)
    const simple = calcularResumenPrestamo({
      monto: 600_000, tasaMensual: 0.10,
      tipoInteres: 'simple', plazoEnSemanas: 30, fechaInicio: '2024-06-01',
    });
    expect(r.interesTotal).toBeLessThan(simple.interesTotal);
  });

  it('propiedad matemática: (1+tasa_diaria)^30 = 1 + tasa_mensual', () => {
    const r = calcularResumenPrestamo({
      monto: 100_000,
      tasaMensual: 0.12,
      tipoInteres: 'compuesto',
      plazoEnSemanas: 30,
      fechaInicio: '2024-01-01',
    });
    // La tasa diaria satisface esta propiedad por definición
    expect(Math.pow(1 + r.tasaSemanalEfectiva, 30)).toBeCloseTo(1.12, 8);
  });
});

// ────────────────────────────────────────────────────────────
// calcularResumenPrestamo — Comisión
// ────────────────────────────────────────────────────────────

describe('calcularResumenPrestamo — comisión', () => {
  it('descontada_desembolso: cliente recibe menos, interés sobre monto completo', () => {
    // monto=500 000, comision=20 000, tipo=descontada
    //   capitalBase          = 500 000 (interés sobre monto total)
    //   montoEfectivoCliente = 500 000 − 20 000 = 480 000
    const r = calcularResumenPrestamo({
      monto: 500_000,
      tasaMensual: 0.10,
      tipoInteres: 'simple',
      plazoEnSemanas: 30,
      comision: 20_000,
      tipoComision: 'descontada_desembolso',
      fechaInicio: '2024-01-01',
    });

    expect(r.capitalBase).toBe(500_000);
    expect(r.montoEfectivoCliente).toBe(480_000);
    // Interés = 500 000 × 0.10 = 50 000
    expect(r.interesTotal).toBeCloseTo(50_000, 0);
  });

  it('sumada_deuda: cliente recibe monto completo, interés sobre monto + comisión', () => {
    // monto=500 000, comision=20 000, tipo=sumada
    //   capitalBase          = 500 000 + 20 000 = 520 000
    //   montoEfectivoCliente = 500 000
    const r = calcularResumenPrestamo({
      monto: 500_000,
      tasaMensual: 0.10,
      tipoInteres: 'simple',
      plazoEnSemanas: 30,
      comision: 20_000,
      tipoComision: 'sumada_deuda',
      fechaInicio: '2024-01-01',
    });

    expect(r.capitalBase).toBe(520_000);
    expect(r.montoEfectivoCliente).toBe(500_000);
    // Interés = 520 000 × 0.10 = 52 000
    expect(r.interesTotal).toBeCloseTo(52_000, 0);
  });

  it('sin comisión: capitalBase === monto y cliente recibe monto', () => {
    const r = calcularResumenPrestamo({
      monto: 400_000,
      tasaMensual: 0.10,
      tipoInteres: 'simple',
      plazoEnSemanas: 30,
      fechaInicio: '2024-01-01',
    });
    expect(r.capitalBase).toBe(400_000);
    expect(r.montoEfectivoCliente).toBe(400_000);
  });
});

// ────────────────────────────────────────────────────────────
// generarCuotasBase
// ────────────────────────────────────────────────────────────

describe('generarCuotasBase — interés simple', () => {
  const MONTO = 300_000;
  const PLAZO = 15;

  const resumen = calcularResumenPrestamo({
    monto: MONTO, tasaMensual: 0.10,
    tipoInteres: 'simple', plazoEnSemanas: PLAZO, fechaInicio: '2024-07-01',
  });

  const cuotas = generarCuotasBase(
    resumen.capitalBase, resumen.cuotaSemanal,
    resumen.tasaSemanalEfectiva, 'simple', PLAZO, '2024-07-01'
  );

  it('genera exactamente el número de días de plazo', () => {
    expect(cuotas).toHaveLength(PLAZO);
  });

  it('primera cuota es el día de inicio, última es el día final', () => {
    expect(cuotas[0].numeroCuota).toBe(1);
    expect(cuotas[0].fechaVencimiento).toBe('2024-07-01');
    expect(cuotas[PLAZO - 1].fechaVencimiento).toBe('2024-07-15');
  });

  it('la suma de capitales recupera el capital base', () => {
    const sumCapital = cuotas.reduce((s, c) => s + c.montoCapital, 0);
    expect(sumCapital).toBeCloseTo(MONTO, 0);
  });

  it('la suma de totales es igual al totalAPagar del resumen', () => {
    const sumTotal = cuotas.reduce((s, c) => s + c.totalCuota, 0);
    expect(sumTotal).toBeCloseTo(resumen.totalAPagar, 0);
  });

  it('todas las cuotas tienen el mismo total (fijas)', () => {
    const primerTotal = cuotas[0].totalCuota;
    cuotas.forEach(c => expect(c.totalCuota).toBeCloseTo(primerTotal, 1));
  });
});

describe('generarCuotasBase — interés compuesto (amortización)', () => {
  const MONTO = 600_000;
  const PLAZO = 30;

  const resumen = calcularResumenPrestamo({
    monto: MONTO, tasaMensual: 0.10,
    tipoInteres: 'compuesto', plazoEnSemanas: PLAZO, fechaInicio: '2024-01-01',
  });

  const cuotas = generarCuotasBase(
    resumen.capitalBase, resumen.cuotaSemanal,
    resumen.tasaSemanalEfectiva, 'compuesto', PLAZO, '2024-01-01'
  );

  it('genera exactamente el número de días de plazo', () => {
    expect(cuotas).toHaveLength(PLAZO);
  });

  it('la suma de capitales recupera el capital base', () => {
    const sumCapital = cuotas.reduce((s, c) => s + c.montoCapital, 0);
    expect(sumCapital).toBeCloseTo(MONTO, 0); // tolerancia centavos de redondeo
  });

  it('el interés decrece con el tiempo (tabla de amortización)', () => {
    // En compuesto, el interés diario decrece a medida que baja el saldo
    expect(cuotas[0].montoInteres).toBeGreaterThan(cuotas[PLAZO - 1].montoInteres);
  });

  it('el capital por cuota crece con el tiempo', () => {
    expect(cuotas[0].montoCapital).toBeLessThan(cuotas[PLAZO - 1].montoCapital);
  });
});

// ────────────────────────────────────────────────────────────
// distribuirPago
// ────────────────────────────────────────────────────────────

describe('distribuirPago', () => {
  it('aplica en orden estricto mora → interés → capital', () => {
    const r = distribuirPago(100, 30, 50, 200);
    expect(r.aplicadoAMora).toBe(30);
    expect(r.aplicadoAInteres).toBe(50);
    expect(r.aplicadoACapital).toBe(20);
    expect(r.sobrante).toBe(0);
  });

  it('pago excedente queda como sobrante', () => {
    const r = distribuirPago(500, 30, 50, 100);
    expect(r.aplicadoAMora).toBe(30);
    expect(r.aplicadoAInteres).toBe(50);
    expect(r.aplicadoACapital).toBe(100);
    expect(r.sobrante).toBe(320);
  });

  it('pago insuficiente solo cubre mora parcialmente', () => {
    const r = distribuirPago(10, 30, 50, 100);
    expect(r.aplicadoAMora).toBe(10);
    expect(r.aplicadoAInteres).toBe(0);
    expect(r.aplicadoACapital).toBe(0);
    expect(r.sobrante).toBe(0);
  });

  it('sin mora: el pago va directo a interés y capital', () => {
    const r = distribuirPago(80, 0, 50, 200);
    expect(r.aplicadoAMora).toBe(0);
    expect(r.aplicadoAInteres).toBe(50);
    expect(r.aplicadoACapital).toBe(30);
    expect(r.sobrante).toBe(0);
  });

  it('suma de aplicaciones + sobrante = montoPago', () => {
    const pago = 1234.56;
    const r = distribuirPago(pago, 100, 200, 300);
    const suma = r.aplicadoAMora + r.aplicadoAInteres + r.aplicadoACapital + r.sobrante;
    expect(suma).toBeCloseTo(pago, 5);
  });
});

// ────────────────────────────────────────────────────────────
// calcularMora
// ────────────────────────────────────────────────────────────

describe('calcularMora', () => {
  it('mora = totalCuota × tasa × días', () => {
    // 22 000 × 0.005 × 3 = 330
    expect(calcularMora(22_000, 0.005, 3)).toBeCloseTo(330, 0);
  });

  it('mora cero si no hay atraso', () => {
    expect(calcularMora(22_000, 0.005, 0)).toBe(0);
  });

  it('mora cero si tasa es cero', () => {
    expect(calcularMora(22_000, 0, 5)).toBe(0);
  });

  it('mora cero si días de atraso <= días de gracia', () => {
    expect(calcularMora(22_000, 0.005, 2, 2)).toBe(0);
    expect(calcularMora(22_000, 0.005, 1, 2)).toBe(0);
  });

  it('cobra mora si días de atraso > días de gracia (cobra solo el exceso sobre la gracia)', () => {
    // gracia=2, atraso=3 → mora solo por (3-2)=1 día
    // 22 000 × 0.005 × 1 = 110
    expect(calcularMora(22_000, 0.005, 3, 2)).toBeCloseTo(110, 0);
  });
});

// ────────────────────────────────────────────────────────────
// diasDeAtraso
// ────────────────────────────────────────────────────────────

describe('diasDeAtraso', () => {
  it('retorna 0 para una fecha futura', () => {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    const iso = manana.toISOString().split('T')[0];
    expect(diasDeAtraso(iso)).toBe(0);
  });

  it('retorna 0 para hoy', () => {
    const hoy = new Date().toISOString().split('T')[0];
    expect(diasDeAtraso(hoy)).toBe(0);
  });

  it('retorna días positivos para fechas pasadas', () => {
    // Una fecha claramente pasada: hace 10 días
    const hace10 = new Date();
    hace10.setDate(hace10.getDate() - 10);
    const iso = hace10.toISOString().split('T')[0];
    expect(diasDeAtraso(iso)).toBe(10);
  });
});

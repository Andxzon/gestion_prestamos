// ============================================================
// TIPOS CENTRALES DEL DOMINIO
// ============================================================

export interface Referencia {
  nombre: string;
  telefono: string;
  parentesco: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  documento?: string; // opcional
  referencias: Referencia[];
  creadoEn: string; // ISO date
}

export type TipoInteres = 'simple' | 'compuesto';

export type EstadoPrestamo = 'activo' | 'pagado' | 'vencido';

/** Cómo se aplica la comisión:
 * descontada_desembolso → el cliente recibe monto − comisión, paga interés sobre monto
 * sumada_deuda          → el cliente recibe monto, paga interés sobre monto + comisión
 */
export type TipoComision = 'descontada_desembolso' | 'sumada_deuda';

export interface Prestamo {
  id: string;
  clienteId: string;
  monto: number;                        // capital inicial / monto a desembolsar
  tasaMensual: number;                  // ej. 0.10 = 10%
  tipoInteres: TipoInteres;
  plazoEnDias: number;
  fechaInicio: string;                  // ISO date "YYYY-MM-DD"
  comision?: number;                    // monto fijo opcional
  tipoComision?: TipoComision;          // default: descontada_desembolso
  tasaMora?: number;                    // tasa diaria de mora, ej. 0.005
  diasGracia?: number;                  // días sin cobro de mora (default 0)
  estado: EstadoPrestamo;
  creadoEn: string;
}


export interface Cuota {
  id: string;
  prestamoId: string;
  numeroCuota: number;              // día 1, 2, 3...
  fechaVencimiento: string;         // ISO date
  montoCapital: number;
  montoInteres: number;
  totalCuota: number;                   // capital + interés
  montoPagado: number;                  // acumulado de abonos (sin incluir mora)
  pagada: boolean;                      // true cuando montoPagado >= totalCuota
}

export interface Pago {
  id: string;
  prestamoId: string;
  cuotaId: string;
  clienteId: string;
  fecha: string;                    // ISO date
  montoTotal: number;               // lo que pagó
  aplicadoAMora: number;
  aplicadoAInteres: number;
  aplicadoACapital: number;
  nota?: string;
}

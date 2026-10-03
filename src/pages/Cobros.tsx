import React, { useState, useEffect } from 'react';
import type { Cliente, Prestamo, Cuota } from '../types';
import { obtenerClientes } from '../data/clienteRepository';
import { obtenerPrestamos } from '../data/prestamoRepository';
import { obtenerCuotasPorPrestamo } from '../data/cuotaRepository';
import { registrarPago } from '../data/pagoRepository';
import type { DatosRegistroPago } from '../data/pagoRepository';
import { formatearMoneda, formatearFecha, diasDeAtraso, calcularMora, distribuirPago, fechaHoyLocal } from '../logic/calculos';
import './Cobros.css';

// ── Tipos y Estructura para la vista ───────────────────────
type EstadoCobro = 'al-dia' | 'pendiente-hoy' | 'atrasado';

interface CobroVisual {
  cliente: Cliente;
  prestamo: Prestamo;
  cuotasPendientes: Cuota[];
  cuotaActual?: Cuota;
  montoCuotaActual: number;
  diasAtrasoActual: number;
  moraActual: number;
  totalExigible: number;
  estado: EstadoCobro;
}

const Cobros: React.FC = () => {
  const [cobros, setCobros] = useState<CobroVisual[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [cobroSeleccionado, setCobroSeleccionado] = useState<CobroVisual | null>(null);
  const [montoPago, setMontoPago] = useState<number | ''>(0);
  const [fechaPago, setFechaPago] = useState<string>(fechaHoyLocal());
  const [procesandoPago, setProcesandoPago] = useState(false);
  const [toast, setToast] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null);

  // ── Cargar y construir vista de cobros ───────────────────
  const recargarDatos = async () => {
    try {
      setCargando(true);
      setError(null);
      const hoy = fechaHoyLocal();

      const [clientes, prestamos] = await Promise.all([
        obtenerClientes(),
        obtenerPrestamos(),
      ]);

      const prestamosActivos = prestamos.filter(p => p.estado === 'activo');

      // Cargar cuotas de cada préstamo activo
      const listaCobros: (CobroVisual | null)[] = await Promise.all(
        prestamosActivos.map(async (prestamo) => {
          const cliente = clientes.find(c => c.id === prestamo.clienteId);
          if (!cliente) return null;

          const cuotas = await obtenerCuotasPorPrestamo(prestamo.id);
          const pendientes = cuotas
            .filter(c => !c.pagada)
            .sort((a, b) => a.numeroCuota - b.numeroCuota);
          const cuotaActual = pendientes.length > 0 ? pendientes[0] : undefined;

          let estado: EstadoCobro = 'al-dia';
          let diasAtrasoActual = 0;
          let moraActual = 0;
          let totalExigible = 0;
          let montoCuotaActual = 0;

          if (cuotaActual) {
            diasAtrasoActual = diasDeAtraso(cuotaActual.fechaVencimiento);
            moraActual = calcularMora(
              cuotaActual.totalCuota,
              prestamo.tasaMora ?? 0,
              diasAtrasoActual,
              prestamo.diasGracia
            );
            montoCuotaActual = cuotaActual.totalCuota - (cuotaActual.montoPagado || 0);
            totalExigible = montoCuotaActual + moraActual;

            if (diasAtrasoActual > 0) {
              estado = 'atrasado';
            } else if (cuotaActual.fechaVencimiento === hoy) {
              estado = 'pendiente-hoy';
            }
          }

          return {
            cliente,
            prestamo,
            cuotasPendientes: pendientes,
            cuotaActual,
            montoCuotaActual,
            diasAtrasoActual,
            moraActual,
            totalExigible,
            estado,
          } as CobroVisual;
        })
      );

      const filtrados = listaCobros.filter((c): c is CobroVisual => c !== null);
      filtrados.sort((a, b) => {
        const prioridad = { 'atrasado': 1, 'pendiente-hoy': 2, 'al-dia': 3 };
        return prioridad[a.estado] - prioridad[b.estado];
      });

      setCobros(filtrados);
    } catch (err: any) {
      setError(err.message ?? 'Error al cargar los cobros.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    recargarDatos();
  }, []);

  const mostrarToast = (tipo: 'exito' | 'error', mensaje: string) => {
    setToast({ tipo, mensaje });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Interacciones ─────────────────────────────────────────
  const abrirModalPago = (cobro: CobroVisual) => {
    setCobroSeleccionado(cobro);
    setMontoPago(cobro.totalExigible || 0);
    setFechaPago(fechaHoyLocal());
    setModalVisible(true);
  };

  const cerrarModal = () => {
    setModalVisible(false);
    setCobroSeleccionado(null);
  };

  // ── Lógica de Pago (Múltiples Cuotas) ────────────────────
  const registrarPagoHandler = async () => {
    if (!cobroSeleccionado || Number(montoPago) <= 0) return;

    setProcesandoPago(true);
    try {
      let sobrante = Number(montoPago);
      const { prestamo, cuotasPendientes } = cobroSeleccionado;

      for (const cuota of cuotasPendientes) {
        if (sobrante <= 0) break;

        const atraso = diasDeAtraso(cuota.fechaVencimiento);
        const moraTotal = calcularMora(
          cuota.totalCuota,
          prestamo.tasaMora ?? 0,
          atraso,
          prestamo.diasGracia
        );

        const capitalPendiente = cuota.montoCapital;
        const interesPendiente = cuota.montoInteres;
        const pagadoAnteriormente = cuota.montoPagado || 0;
        const faltaDeCuota = cuota.totalCuota - pagadoAnteriormente;
        const totalNecesario = moraTotal + faltaDeCuota;

        const reparto = distribuirPago(sobrante, moraTotal, interesPendiente, capitalPendiente);

        // Extraer numero_cuota del id compuesto "prestamoId-numeroCuota"
        const numeroCuota = cuota.numeroCuota;

        const datos: DatosRegistroPago = {
          prestamoId: prestamo.id,
          numeroCuota,
          clienteId: cobroSeleccionado.cliente.id,
          fecha: fechaPago,
          valor: reparto.aplicadoAMora + reparto.aplicadoAInteres + reparto.aplicadoACapital,
          aMora: reparto.aplicadoAMora,
          aInteres: reparto.aplicadoAInteres,
          aCapital: reparto.aplicadoACapital,
          montoPagadoAnterior: pagadoAnteriormente,
          totalCuota: cuota.totalCuota,
        };

        await registrarPago(datos);
        sobrante -= totalNecesario;
      }

      mostrarToast('exito', 'Pago registrado exitosamente.');
      cerrarModal();
      await recargarDatos();
    } catch (err: any) {
      mostrarToast('error', err.message ?? 'Error al registrar el pago.');
    } finally {
      setProcesandoPago(false);
    }
  };

  // ── Render ────────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="pagina-contenido">
        <div className="estado-carga">
          <div className="spinner" />
          <p>Cargando cobros…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pagina-contenido">
        <div className="estado-error">
          <span>⚠️</span>
          <p>{error}</p>
          <button className="btn-primario" onClick={recargarDatos}>Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pagina-contenido">
      <div className="prestamos-header">
        <div>
          <h1 className="pagina-titulo">Cobros de Hoy</h1>
          <p className="pagina-subtitulo">Revisa qué cuotas están pendientes de pago y registra abonos.</p>
        </div>
      </div>

      {cobros.length === 0 ? (
        <div className="clientes-vacio">
           <span className="clientes-vacio-icono">🎉</span>
           <p>No hay préstamos activos pendientes de cobro.</p>
        </div>
      ) : (
        <div className="cobros-lista">
          {cobros.map(cobro => (
            <div key={cobro.prestamo.id} className="cobro-card">
              <div className="cobro-info">
                <div className="cobro-cliente">
                  {cobro.cliente.nombre} 
                  <span className={`cobro-estado-badge ${cobro.estado}`}>
                    {cobro.estado.replace('-', ' ')}
                  </span>
                </div>
                
                <div className="cobro-detalles">
                  <span>📱 {cobro.cliente.telefono}</span>
                  {cobro.cuotaActual ? (
                    <>
                      <span>📅 Vence: {formatearFecha(cobro.cuotaActual.fechaVencimiento)}</span>
                      <span>🔢 Cuota {cobro.cuotaActual.numeroCuota}</span>
                    </>
                  ) : (
                    <span>Todas las cuotas generadas están pagadas.</span>
                  )}
                </div>
              </div>
              
              <div className="cobro-accion">
                <div className="cobro-monto-container">
                  <span className="cobro-monto-label">Total a cobrar hoy</span>
                  <span className="cobro-monto-valor">{formatearMoneda(cobro.totalExigible)}</span>
                  {cobro.moraActual > 0 && (
                    <span className="cobro-mora-valor">+ {formatearMoneda(cobro.moraActual)} mora ({cobro.diasAtrasoActual} días)</span>
                  )}
                </div>
                <button 
                  className="btn-primario" 
                  onClick={() => abrirModalPago(cobro)}
                  disabled={!cobro.cuotaActual}
                >
                  Registrar Pago
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Pago */}
      {modalVisible && cobroSeleccionado && (
        <div className="overlay">
          <div className="modal-formulario" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2 className="modal-titulo">Registrar Pago</h2>
              <button className="modal-cerrar" onClick={cerrarModal} disabled={procesandoPago}>✕</button>
            </div>

            <div className="modal-cuerpo">
              <p style={{ marginBottom: '16px', color: '#fff', fontWeight: 600 }}>
                {cobroSeleccionado.cliente.nombre}
              </p>

              <div className="form-fila">
                <label className="form-label">Monto recibido</label>
                <input 
                  type="number" 
                  className="form-input" 
                  style={{ fontSize: '18px', fontWeight: 'bold' }}
                  min="0" 
                  step="1000"
                  value={montoPago} 
                  onChange={e => setMontoPago(e.target.value === '' ? '' : Number(e.target.value))}
                  disabled={procesandoPago}
                />
                <span style={{ fontSize: '12px', color: 'var(--color-texto-suave)', marginTop: '4px' }}>
                  Puede ser un abono parcial o pago de varias cuotas juntas.
                </span>
              </div>

              <div className="form-fila" style={{ marginTop: '16px' }}>
                <label className="form-label">Fecha de pago</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={fechaPago} 
                  onChange={e => setFechaPago(e.target.value)}
                  disabled={procesandoPago}
                />
              </div>

              <div className="modal-resumen-pago">
                <div className="resumen-pago-fila">
                  <span>Cuota actual</span>
                  <span>{formatearMoneda(cobroSeleccionado.montoCuotaActual)}</span>
                </div>
                {cobroSeleccionado.moraActual > 0 && (
                  <div className="resumen-pago-fila" style={{ color: '#f87171' }}>
                    <span>Mora acumulada</span>
                    <span>{formatearMoneda(cobroSeleccionado.moraActual)}</span>
                  </div>
                )}
                <div className="resumen-pago-fila total">
                  <span>Total sugerido</span>
                  <span>{formatearMoneda(cobroSeleccionado.totalExigible)}</span>
                </div>
              </div>
            </div>

            <div className="modal-pie">
              <button className="btn-secundario" onClick={cerrarModal} disabled={procesandoPago}>Cancelar</button>
              <button
                className="btn-primario"
                onClick={registrarPagoHandler}
                disabled={Number(montoPago) <= 0 || procesandoPago}
              >
                {procesandoPago ? 'Procesando…' : 'Confirmar Abono'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast--${toast.tipo}`}>
          <span>{toast.tipo === 'exito' ? '✓' : '✕'}</span>
          {toast.mensaje}
        </div>
      )}
    </div>
  );
};

export default Cobros;

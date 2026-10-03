import React, { useState, useEffect } from 'react';
import type { Cliente, Prestamo, Cuota, Pago } from '../types';
import { obtenerPrestamosPorCliente, eliminarPrestamo } from '../data/prestamoRepository';
import { obtenerCuotasPorPrestamo } from '../data/cuotaRepository';
import { obtenerPagosPorPrestamo } from '../data/pagoRepository';
import { fechaHoyLocal } from '../logic/calculos';
import { ArrowLeft, Trash2, X, AlertTriangle } from 'lucide-react';
import './HistorialCliente.css';

interface HistorialClienteProps {
  cliente: Cliente;
  onVolver: () => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
};

const formatDate = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-CO');
};

interface PrestamoDato {
  prestamo: Prestamo;
  cuotas: Cuota[];
  pagos: Pago[];
  resumen: {
    totalPagado: number;
    saldoPendiente: number;
    moraCobrada: number;
    interesCobrado: number;
    capitalCobrado: number;
    diasAtrasoTotales: number;
  };
}

const HistorialCliente: React.FC<HistorialClienteProps> = ({ cliente, onVolver }) => {
  const [prestamosData, setPrestamosData] = useState<PrestamoDato[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prestamoAEliminar, setPrestamoAEliminar] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const cargar = async () => {
    try {
      setCargando(true);
        setError(null);

        const prestamos = await obtenerPrestamosPorCliente(cliente.id);

        const datos = await Promise.all(
          prestamos.map(async (p) => {
            const [cuotas, pagos] = await Promise.all([
              obtenerCuotasPorPrestamo(p.id),
              obtenerPagosPorPrestamo(p.id),
            ]);

            let totalPagado = 0;
            let moraCobrada = 0;
            let interesCobrado = 0;
            let capitalCobrado = 0;

            pagos.forEach(pago => {
              totalPagado += pago.montoTotal;
              moraCobrada += pago.aplicadoAMora;
              interesCobrado += pago.aplicadoAInteres;
              capitalCobrado += pago.aplicadoACapital;
            });

            let saldoPendiente = 0;
            let diasAtrasoTotales = 0;
            const hoy = fechaHoyLocal();
            const fechaHoy = new Date(hoy);

            cuotas.forEach(c => {
              if (!c.pagada) {
                saldoPendiente += (c.totalCuota - c.montoPagado);
                if (c.fechaVencimiento < hoy) {
                  const fechaVenc = new Date(c.fechaVencimiento);
                  const dias = Math.floor((fechaHoy.getTime() - fechaVenc.getTime()) / (1000 * 60 * 60 * 24));
                  diasAtrasoTotales += dias;
                }
              }
            });

            return {
              prestamo: p,
              cuotas,
              pagos,
              resumen: {
                totalPagado,
                saldoPendiente,
                moraCobrada,
                interesCobrado,
                capitalCobrado,
                diasAtrasoTotales,
              },
            };
          })
        );

        const ordenado = datos.sort((a, b) =>
          b.prestamo.fechaInicio.localeCompare(a.prestamo.fechaInicio)
        );
        setPrestamosData(ordenado);
      } catch (err: any) {
        setError(err.message ?? 'Error al cargar el historial.');
      } finally {
        setCargando(false);
      }
    };

  useEffect(() => {
    cargar();
  }, [cliente.id]);

  const confirmarEliminar = async () => {
    if (!prestamoAEliminar) return;
    setEliminando(true);
    try {
      await eliminarPrestamo(prestamoAEliminar);
      setPrestamoAEliminar(null);
      await cargar(); // Recargar los datos
    } catch (err: any) {
      alert(err.message || 'Error al eliminar el préstamo');
    } finally {
      setEliminando(false);
    }
  };

  if (cargando) {
    return (
      <div className="historial-container">
        <div className="historial-header">
          <button className="btn-volver" onClick={onVolver}>
            <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Volver a clientes
          </button>
        </div>
        <div className="estado-carga">
          <div className="spinner" />
          <p>Cargando historial…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="historial-container">
        <div className="historial-header">
          <button className="btn-volver" onClick={onVolver}>
            <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Volver a clientes
          </button>
        </div>
        <div className="estado-error">
          <div className="error-icon"><AlertTriangle size={22} /></div>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="historial-container">
      <div className="historial-header">
        <button className="btn-volver" onClick={onVolver}>
          <ArrowLeft size={16} style={{ marginRight: '6px' }} /> Volver a clientes
        </button>
        <div className="historial-titulo-grupo">
          <h2>Historial de: {cliente.nombre}</h2>
          <span className="historial-subtitulo">{prestamosData.length} préstamos registrados</span>
        </div>
      </div>

      {prestamosData.length === 0 ? (
        <div className="historial-vacio">Este cliente no tiene préstamos registrados.</div>
      ) : (
        <div className="historial-lista">
          {prestamosData.map((data, index) => (
            <div key={data.prestamo.id} className="historial-prestamo-card">
              
              <div className="prestamo-encabezado">
                <div className="prestamo-info-principal">
                  <h3>Préstamo #{prestamosData.length - index}</h3>
                  <span className={`badge-estado ${data.prestamo.estado}`}>
                    {data.prestamo.estado}
                  </span>
                  <button 
                    className="btn-peligro btn-peligro-sm" 
                    style={{ marginLeft: '16px' }}
                    onClick={() => setPrestamoAEliminar(data.prestamo.id)}
                    title="Eliminar préstamo"
                  >
                    <Trash2 size={14} /> Eliminar
                  </button>
                </div>
                <div className="prestamo-fechas">
                  <span>Otorgado: {formatDate(data.prestamo.fechaInicio)}</span>
                  <span>Monto inicial: {formatCurrency(data.prestamo.monto)}</span>
                </div>
              </div>

              <div className="prestamo-resumen">
                <div className="resumen-item">
                  <span className="resumen-label">Total Pagado</span>
                  <span className="resumen-valor">{formatCurrency(data.resumen.totalPagado)}</span>
                </div>
                <div className="resumen-item">
                  <span className="resumen-label">Saldo Pendiente</span>
                  <span className="resumen-valor warning">{formatCurrency(data.resumen.saldoPendiente)}</span>
                </div>
                <div className="resumen-item">
                  <span className="resumen-label">Mora Cobrada</span>
                  <span className="resumen-valor danger">{formatCurrency(data.resumen.moraCobrada)}</span>
                </div>
                <div className="resumen-item">
                  <span className="resumen-label">Días Atraso Totales</span>
                  <span className="resumen-valor danger">{data.resumen.diasAtrasoTotales} días</span>
                </div>
              </div>

              <div className="prestamo-detalles">
                <div className="detalle-columna">
                  <h4>Calendario de Cuotas</h4>
                  <div className="tabla-scroll">
                    <table className="tabla-historial">
                      <thead>
                        <tr>
                          <th>Nº</th>
                          <th>Vence</th>
                          <th>Monto</th>
                          <th>Pagado</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.cuotas.map(c => (
                          <tr key={c.id}>
                            <td>{c.numeroCuota}</td>
                            <td>{formatDate(c.fechaVencimiento)}</td>
                            <td>{formatCurrency(c.totalCuota)}</td>
                            <td>{formatCurrency(c.montoPagado)}</td>
                            <td>
                              {c.pagada ? (
                                <span className="text-success">Pagada</span>
                              ) : (
                                c.fechaVencimiento < fechaHoyLocal() 
                                ? <span className="text-danger">Atrasada</span>
                                : <span className="text-warning">Pendiente</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="detalle-columna">
                  <h4>Historial de Pagos</h4>
                  {data.pagos.length === 0 ? (
                    <div className="pagos-vacio">Aún no hay pagos.</div>
                  ) : (
                    <div className="tabla-scroll">
                      <table className="tabla-historial">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Total</th>
                            <th>Capital</th>
                            <th>Interés</th>
                            <th>Mora</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.pagos.map(p => (
                            <tr key={p.id}>
                              <td>{formatDate(p.fecha)}</td>
                              <td><strong>{formatCurrency(p.montoTotal)}</strong></td>
                              <td>{formatCurrency(p.aplicadoACapital)}</td>
                              <td>{formatCurrency(p.aplicadoAInteres)}</td>
                              <td className={p.aplicadoAMora > 0 ? 'text-danger' : ''}>
                                {formatCurrency(p.aplicadoAMora)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

      {prestamoAEliminar && (
        <div className="overlay">
          <div className="modal-formulario" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2 className="modal-titulo" style={{ color: '#ef4444' }}>
                <AlertTriangle size={20} /> Confirmar Eliminación
              </h2>
              <button className="modal-cerrar" onClick={() => setPrestamoAEliminar(null)}><X size={18} /></button>
            </div>
            <div className="modal-cuerpo">
              <p>¿Estás seguro de que deseas eliminar este préstamo? Esta acción también eliminará todas sus cuotas y pagos asociados, y <strong>no se puede deshacer</strong>.</p>
            </div>
            <div className="modal-pie">
              <button className="btn-secundario" onClick={() => setPrestamoAEliminar(null)} disabled={eliminando}>Cancelar</button>
              <button className="btn-peligro" onClick={confirmarEliminar} disabled={eliminando}>
                {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistorialCliente;

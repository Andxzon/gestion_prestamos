import React, { useState, useEffect, useMemo } from 'react';
import type { Prestamo, Cliente, TipoInteres, TipoComision, ModoInteres } from '../types';
import { obtenerPrestamos, guardarPrestamo, obtenerPrestamoActivo, eliminarPrestamo } from '../data/prestamoRepository';
import { obtenerClientes } from '../data/clienteRepository';
import { calcularResumenPrestamo, generarCuotasBase, formatearMoneda, formatearFecha, fechaHoyLocal } from '../logic/calculos';
import {
  Banknote, Plus, Calendar, Clock, TrendingUp, Trash2,
  X, AlertTriangle, CheckCircle, XCircle, RefreshCw
} from 'lucide-react';
import './Prestamos.css';

// ── Valores por defecto ──────────────────────────────────────
const FORM_VACIO = {
  clienteId: '',
  monto: 500000 as number | '',
  tasaMensual: 10 as number | '', // Porcentaje visual (ej. 10 para 10%)
  modoInteres: 'mensual' as ModoInteres,
  tipoInteres: 'simple' as TipoInteres,
  plazoEnSemanas: 4 as number | '',
  fechaInicio: fechaHoyLocal(),
  comision: 0 as number | '',
  tipoComision: 'descontada_desembolso' as TipoComision,
  tasaMora: '' as number | '',
  diasGracia: 0 as number | '',
};

type FormData = typeof FORM_VACIO;

const Prestamos: React.FC = () => {
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [form, setForm] = useState<FormData>(FORM_VACIO);
  const [errorCliente, setErrorCliente] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null);
  
  // Estados para eliminación
  const [prestamoAEliminar, setPrestamoAEliminar] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);

  // ── Cargar datos ───────────────────────────────────────────
  const cargarDatos = async () => {
    try {
      setCargando(true);
      setError(null);
      const [p, c] = await Promise.all([obtenerPrestamos(), obtenerClientes()]);
      setPrestamos(p);
      setClientes(c);
    } catch (err: any) {
      setError(err.message ?? 'Error al cargar los datos.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // ── Toast ──────────────────────────────────────────────────
  const mostrarToast = (tipo: 'exito' | 'error', mensaje: string) => {
    setToast({ tipo, mensaje });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Vista Previa en Vivo ───────────────────────────────────
  const resumen = useMemo(() => {
    const monto = Number(form.monto);
    const plazoEnSemanas = Number(form.plazoEnSemanas);
    const tasaMensual = Number(form.tasaMensual);
    const comision = Number(form.comision);

    if (monto <= 0 || plazoEnSemanas <= 0 || tasaMensual < 0) return null;
    return calcularResumenPrestamo({
      monto,
      tasaMensual: tasaMensual / 100, // Convertir 10 → 0.10
      modoInteres: form.modoInteres,
      tipoInteres: form.tipoInteres,
      plazoEnSemanas,
      fechaInicio: form.fechaInicio,
      comision,
      tipoComision: form.tipoComision,
    });
  }, [form]);

  // ── Manejo del Formulario ──────────────────────────────────
  const abrirNuevo = () => {
    setForm(FORM_VACIO);
    setErrorCliente(null);
    setMostrarModal(true);
  };

  const cerrarModal = () => {
    setMostrarModal(false);
  };

  const handleClienteChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setForm((prev) => ({ ...prev, clienteId: id }));
    setErrorCliente(null);

    if (id) {
      try {
        const activo = await obtenerPrestamoActivo(id);
        if (activo) {
          setErrorCliente('Este cliente ya tiene un préstamo activo. Debe pagarlo antes de adquirir otro.');
        }
      } catch (err: any) {
        setErrorCliente(`No se pudo verificar: ${err.message}`);
      }
    }
  };

  const handleGuardar = async () => {
    if (!form.clienteId) {
      mostrarToast('error', 'Debe seleccionar un cliente.');
      return;
    }
    if (errorCliente) {
      mostrarToast('error', 'No se puede crear el préstamo para este cliente.');
      return;
    }
    if (!resumen) {
      mostrarToast('error', 'Revisa los montos del préstamo.');
      return;
    }
    if (form.tasaMora !== '' && (Number(form.tasaMora) < 0 || Number(form.tasaMora) > 100)) {
      mostrarToast('error', 'La tasa de mora debe estar entre 0 y 100.');
      return;
    }

    setGuardando(true);
    try {
      // Generar cuotas en memoria (lógica sin cambios)
      const cuotasGeneradas = generarCuotasBase(
        resumen.capitalBase,
        resumen.cuotaSemanal,
        resumen.tasaSemanalEfectiva,
        form.tipoInteres,
        Number(form.plazoEnSemanas),
        form.fechaInicio
      );

      // guardarPrestamo inserta préstamo + cuotas con rollback si falla
      await guardarPrestamo(
        {
          clienteId: form.clienteId,
          monto: Number(form.monto),
          tasaMensual: Number(form.tasaMensual) / 100, // decimal para la BD
          tipoInteres: form.modoInteres === 'fijo' ? 'simple' : form.tipoInteres,
          modoInteres: form.modoInteres,
          plazoEnSemanas: Number(form.plazoEnSemanas),
          fechaInicio: form.fechaInicio,
          comision: form.comision === '' ? undefined : Number(form.comision),
          tipoComision: form.tipoComision,
          tasaMora: form.tasaMora === '' ? undefined : Number(form.tasaMora) / 100,
          diasGracia: Number(form.diasGracia),
        },
        cuotasGeneradas.map((c) => ({
          prestamoId: '',   // se rellena dentro de guardarPrestamo
          numeroCuota: c.numeroCuota,
          fechaVencimiento: c.fechaVencimiento,
          montoCapital: c.montoCapital,
          montoInteres: c.montoInteres,
          totalCuota: c.totalCuota,
        }))
      );

      await cargarDatos();
      mostrarToast('exito', 'Préstamo y calendario de cuotas generados correctamente.');
      cerrarModal();
    } catch (err: any) {
      mostrarToast('error', err.message ?? 'Error al guardar el préstamo.');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = async () => {
    if (!prestamoAEliminar) return;
    setEliminando(true);
    try {
      await eliminarPrestamo(prestamoAEliminar);
      setPrestamoAEliminar(null);
      await cargarDatos();
      mostrarToast('exito', 'Préstamo eliminado correctamente.');
    } catch (err: any) {
      mostrarToast('error', err.message || 'Error al eliminar el préstamo.');
    } finally {
      setEliminando(false);
    }
  };

  // Helper para mostrar nombres en la lista
  const getNombreCliente = (id: string) => clientes.find(c => c.id === id)?.nombre ?? 'Desconocido';

  // ── Render de carga / error ────────────────────────────────
  if (cargando) {
    return (
      <div className="pagina-contenido">
        <div className="estado-carga">
          <div className="spinner" />
          <p>Cargando préstamos…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pagina-contenido">
        <div className="estado-error">
          <div className="error-icon"><AlertTriangle size={22} /></div>
          <p>{error}</p>
          <button className="btn-primario" onClick={cargarDatos}><RefreshCw size={15} /> Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pagina-contenido">
      <div className="prestamos-header">
        <div>
          <h1 className="pagina-titulo">Préstamos</h1>
          <p className="pagina-subtitulo">Gestiona los créditos activos e historial.</p>
        </div>
        <button className="btn-primario" onClick={abrirNuevo}>
          <Plus size={17} /> Nuevo préstamo
        </button>
      </div>

      {prestamos.length === 0 ? (
        <div className="clientes-vacio">
           <span className="clientes-vacio-icono"><Banknote size={48} strokeWidth={1} /></span>
           <p>No hay préstamos registrados.</p>
        </div>
      ) : (
        <div className="prestamos-lista">
          {prestamos.map(p => (
            <div key={p.id} className="prestamo-card">
              <div className="prestamo-info-principal">
                <span className="prestamo-cliente">{getNombreCliente(p.clienteId)}</span>
                <div className="prestamo-detalles">
                   <span className="prestamo-detalle-item"><Calendar size={13} strokeWidth={2} /> {formatearFecha(p.fechaInicio)}</span>
                   <span className="prestamo-detalle-item"><Clock size={13} strokeWidth={2} /> {p.plazoEnSemanas} semanas</span>
                   <span className="prestamo-detalle-item"><TrendingUp size={13} strokeWidth={2} /> {(p.tasaMensual * 100).toFixed(1)}% {p.modoInteres === 'fijo' ? 'fijo total' : 'mensual'}</span>
                </div>
              </div>
              <div className="prestamo-acciones">
                 <div className="prestamo-monto">{formatearMoneda(p.monto)}</div>
                 <span className={`estado-badge ${p.estado}`}>{p.estado}</span>
                 <button 
                   className="btn-peligro btn-peligro-sm" 
                   onClick={() => setPrestamoAEliminar(p.id)}
                   title="Eliminar préstamo"
                 >
                   <Trash2 size={14} /> Eliminar
                 </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Nuevo Préstamo */}
      {mostrarModal && (
        <div className="overlay">
          <div className="modal-formulario" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h2 className="modal-titulo">
                <Banknote size={20} /> Nuevo Préstamo
              </h2>
              <button className="modal-cerrar" onClick={cerrarModal}><X size={18} /></button>
            </div>

            <div className="modal-cuerpo prestamo-modal-grid">
              
              {/* Columna Izquierda: Formulario */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                <div className="form-fila">
                  <label className="form-label">Cliente <span className="form-requerido">*</span></label>
                  <select className="form-select" value={form.clienteId} onChange={handleClienteChange}>
                    <option value="">-- Seleccione un cliente --</option>
                    {clientes.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre} ({c.documento || 'Sin doc'})</option>
                    ))}
                  </select>
                  {errorCliente && <span className="form-error">{errorCliente}</span>}
                </div>

                <div className="form-grid-2">
                  <div className="form-fila">
                    <label className="form-label">Monto (Capital)</label>
                    <input type="number" className="form-input" min="0" step="10000"
                      value={form.monto} onChange={e => setForm({...form, monto: e.target.value === '' ? '' : Number(e.target.value)})} />
                  </div>
                  <div className="form-fila">
                    <label className="form-label">Plazo (semanas)</label>
                    <input type="number" className="form-input" min="1" 
                      value={form.plazoEnSemanas} onChange={e => setForm({...form, plazoEnSemanas: e.target.value === '' ? '' : Number(e.target.value)})} />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-fila">
                    <label className="form-label">{form.modoInteres === 'fijo' ? 'Interés fijo total del préstamo (%)' : 'Tasa mensual (%)'}</label>
                    <input type="number" className="form-input" min="0" step="0.1"
                      value={form.tasaMensual} onChange={e => setForm({...form, tasaMensual: e.target.value === '' ? '' : Number(e.target.value)})} />
                  </div>
                  <div className="form-fila">
                    <label className="form-label">Modalidad de interés</label>
                    <select className="form-select" value={form.modoInteres} onChange={e => {
                      const modoInteres = e.target.value as ModoInteres;
                      setForm({...form, modoInteres, ...(modoInteres === 'fijo' ? { tipoInteres: 'simple' as TipoInteres } : {})});
                    }}>
                      <option value="mensual">Porcentaje mensual</option>
                      <option value="fijo">Porcentaje fijo por todo el préstamo</option>
                    </select>
                  </div>
                </div>

                {form.modoInteres === 'mensual' && (
                  <div className="form-fila">
                    <label className="form-label">Cálculo mensual</label>
                    <select className="form-select" value={form.tipoInteres} onChange={e => setForm({...form, tipoInteres: e.target.value as TipoInteres})}>
                      <option value="simple">Simple</option>
                      <option value="compuesto">Compuesto</option>
                    </select>
                  </div>
                )}

                <div className="form-grid-2">
                  <div className="form-fila">
                    <label className="form-label">Comisión Fija</label>
                    <input type="number" className="form-input" min="0"
                      value={form.comision} onChange={e => setForm({...form, comision: e.target.value === '' ? '' : Number(e.target.value)})} />
                  </div>
                  <div className="form-fila">
                    <label className="form-label">Tipo Comisión</label>
                    <select className="form-select" value={form.tipoComision} onChange={e => setForm({...form, tipoComision: e.target.value as TipoComision})}>
                      <option value="descontada_desembolso">Descontar del desembolso</option>
                      <option value="sumada_deuda">Sumar a la deuda</option>
                    </select>
                  </div>
                </div>
                
                <div className="form-grid-2">
                  <div className="form-fila">
                    <label className="form-label">Días de gracia (mora)</label>
                    <input type="number" className="form-input" min="0"
                      value={form.diasGracia} onChange={e => setForm({...form, diasGracia: e.target.value === '' ? '' : Number(e.target.value)})} />
                  </div>
                  <div className="form-fila">
                    <label className="form-label">Tasa mora diaria (%)</label>
                    <input type="number" className="form-input" min="0" max="100" step="0.1"
                      placeholder="Opcional"
                      value={form.tasaMora} onChange={e => setForm({...form, tasaMora: e.target.value === '' ? '' : Number(e.target.value)})} />
                  </div>
                </div>
                
                <div className="form-grid-2">
                  <div className="form-fila">
                    <label className="form-label">Fecha del 1er Cobro</label>
                    <input type="date" className="form-input" 
                      value={form.fechaInicio} onChange={e => setForm({...form, fechaInicio: e.target.value})} />
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Vista Previa */}
              <div>
                <h3 className="form-seccion-titulo" style={{ marginBottom: '16px' }}>Vista Previa</h3>
                {resumen ? (
                  <div className="resumen-prestamo">
                    <div className="resumen-grid">
                      <div className="resumen-item">
                        <span className="resumen-label">Monto a entregar hoy</span>
                        <span className="resumen-valor">{formatearMoneda(resumen.montoEfectivoCliente)}</span>
                      </div>
                      <div className="resumen-item">
                        <span className="resumen-label">Total a pagar al final</span>
                        <span className="resumen-valor">{formatearMoneda(resumen.totalAPagar)}</span>
                      </div>
                      <div className="resumen-item" style={{ gridColumn: 'span 2' }}>
                        <span className="resumen-label">CUOTA SEMANAL FIJA</span>
                        <span className="resumen-valor destacado">{formatearMoneda(resumen.cuotaSemanal)}</span>
                      </div>
                      <div className="resumen-item">
                        <span className="resumen-label">Intereses totales</span>
                        <span className="resumen-valor" style={{ color: '#f59e0b'}}>{formatearMoneda(resumen.interesTotal)}</span>
                      </div>
                      <div className="resumen-item">
                        <span className="resumen-label">Fecha del último pago</span>
                        <span className="resumen-valor">{formatearFecha(resumen.fechaFinal)}</span>
                      </div>
                      {form.tasaMora !== '' && Number(form.tasaMora) > 0 && (
                        <div className="resumen-item" style={{ gridColumn: 'span 2', marginTop: '8px', borderTop: '1px solid var(--color-borde)', paddingTop: '8px' }}>
                          <span className="resumen-label">Mora por día de atraso (sobre una cuota)</span>
                          <span className="resumen-valor" style={{ color: '#f87171' }}>
                            {formatearMoneda(resumen.cuotaSemanal * (Number(form.tasaMora) / 100))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p style={{ color: 'var(--color-texto-muted)', fontSize: '14px' }}>Llena los campos para ver el cálculo del préstamo.</p>
                )}
              </div>

            </div>

            <div className="modal-pie">
              <button className="btn-secundario" onClick={cerrarModal} disabled={guardando}>Cancelar</button>
              <button
                className="btn-primario"
                onClick={handleGuardar}
                disabled={!!errorCliente || !form.clienteId || guardando}
              >
                {guardando ? 'Guardando…' : 'Confirmar y generar cuotas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast--${toast.tipo}`} role="alert">
          <span className="toast-icon">{toast.tipo === 'exito' ? <CheckCircle size={17} /> : <XCircle size={17} />}</span>
          {toast.mensaje}
        </div>
      )}

      {/* Modal Confirmar Eliminación */}
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

export default Prestamos;

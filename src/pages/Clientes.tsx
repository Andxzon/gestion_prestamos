import React, { useState, useEffect } from 'react';
import type { Cliente, Referencia } from '../types';
import {
  obtenerClientes,
  guardarCliente,
  actualizarCliente,
  eliminarCliente,
} from '../data/clienteRepository';
import { obtenerPrestamosPorCliente } from '../data/prestamoRepository';
import HistorialCliente from '../components/HistorialCliente';
import {
  Plus, Search, X, Eye, Pencil, Trash2, UserPlus, User,
  Phone, MapPin, AlertTriangle, RefreshCw, CheckCircle,
  XCircle, ChevronRight,
} from 'lucide-react';
import './Clientes.css';

// ── Formulario vacío ─────────────────────────────────────────
const FORM_VACIO = {
  nombre: '',
  telefono: '',
  direccion: '',
  documento: '',
};

type FormData = typeof FORM_VACIO;

interface ErroresForm {
  nombre?: string;
  telefono?: string;
  direccion?: string;
}

// ── Componente principal ─────────────────────────────────────
const Clientes: React.FC = () => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [busqueda, setBusqueda] = useState('');
  const [mostrarModal, setMostrarModal] = useState(false);
  const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null);
  const [form, setForm] = useState<FormData>(FORM_VACIO);
  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [errores, setErrores] = useState<ErroresForm>({});
  const [toast, setToast] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null);
  const [confirmEliminar, setConfirmEliminar] = useState<Cliente | null>(null);
  const [clienteHistorial, setClienteHistorial] = useState<Cliente | null>(null);

  const cargarClientes = async () => {
    try {
      setCargando(true);
      setError(null);
      const data = await obtenerClientes();
      setClientes(data);
    } catch (err: any) {
      setError(err.message ?? 'Error al cargar los clientes.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarClientes();
  }, []);

  // Si hay un cliente seleccionado para historial, mostramos esa vista
  if (clienteHistorial) {
    return (
      <div className="pagina-contenido clientes-pagina">
        <HistorialCliente 
          cliente={clienteHistorial} 
          onVolver={() => setClienteHistorial(null)} 
        />
      </div>
    );
  }

  // ── Búsqueda ───────────────────────────────────────────────
  const clientesFiltrados = clientes.filter((c) =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  // ── Toast ──────────────────────────────────────────────────
  const mostrarToast = (tipo: 'exito' | 'error', mensaje: string) => {
    setToast({ tipo, mensaje });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Abrir formulario ───────────────────────────────────────
  const abrirNuevo = () => {
    setClienteEditando(null);
    setForm(FORM_VACIO);
    setReferencias([]);
    setErrores({});
    setMostrarModal(true);
  };

  const abrirEditar = (cliente: Cliente) => {
    setClienteEditando(cliente);
    setForm({
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      direccion: cliente.direccion,
      documento: cliente.documento ?? '',
    });
    setReferencias(cliente.referencias.map((r) => ({ ...r })));
    setErrores({});
    setMostrarModal(true);
  };

  const cerrarModal = () => {
    setMostrarModal(false);
    setClienteEditando(null);
  };

  // ── Validación ─────────────────────────────────────────────
  const validar = (): boolean => {
    const nuevosErrores: ErroresForm = {};
    if (!form.nombre.trim()) nuevosErrores.nombre = 'El nombre es obligatorio.';
    else if (form.nombre.trim().length < 3) nuevosErrores.nombre = 'El nombre debe tener al menos 3 caracteres.';

    if (!form.telefono.trim()) {
      nuevosErrores.telefono = 'El teléfono es obligatorio.';
    } else if (!/^\d{7,15}$/.test(form.telefono.trim())) {
      nuevosErrores.telefono = 'Ingrese solo dígitos (entre 7 y 15).';
    }

    if (!form.direccion.trim()) nuevosErrores.direccion = 'La dirección es obligatoria.';

    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  // ── Guardar ────────────────────────────────────────────────
  const handleGuardar = async () => {
    if (!validar()) return;

    const datos = {
      nombre: form.nombre.trim(),
      telefono: form.telefono.trim(),
      direccion: form.direccion.trim(),
      documento: form.documento.trim() || undefined,
      referencias,
    };

    setGuardando(true);
    try {
      if (clienteEditando) {
        await actualizarCliente({ ...clienteEditando, ...datos });
        mostrarToast('exito', 'Cliente actualizado correctamente.');
      } else {
        await guardarCliente(datos);
        mostrarToast('exito', 'Cliente registrado correctamente.');
      }
      await cargarClientes();
      cerrarModal();
    } catch (err: any) {
      mostrarToast('error', err.message ?? 'Error al guardar el cliente.');
    } finally {
      setGuardando(false);
    }
  };

  // ── Eliminar ───────────────────────────────────────────────
  const pedirConfirmacion = async (cliente: Cliente) => {
    try {
      const prestamos = await obtenerPrestamosPorCliente(cliente.id);
      if (prestamos.length > 0) {
        mostrarToast('error', `No se puede eliminar: ${cliente.nombre} tiene ${prestamos.length} préstamo(s) registrado(s).`);
        return;
      }
      setConfirmEliminar(cliente);
    } catch (err: any) {
      mostrarToast('error', `Error al verificar préstamos: ${err.message}`);
    }
  };

  const confirmarEliminar = async () => {
    if (!confirmEliminar) return;
    try {
      await eliminarCliente(confirmEliminar.id);
      await cargarClientes();
      setConfirmEliminar(null);
      mostrarToast('exito', 'Cliente eliminado.');
    } catch (err: any) {
      mostrarToast('error', err.message ?? 'Error al eliminar el cliente.');
    }
  };

  // ── Referencias ────────────────────────────────────────────
  const agregarReferencia = () => {
    setReferencias((prev) => [...prev, { nombre: '', telefono: '', parentesco: '' }]);
  };

  const actualizarReferencia = (idx: number, campo: keyof Referencia, valor: string) => {
    setReferencias((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r))
    );
  };

  const eliminarReferencia = (idx: number) => {
    setReferencias((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Render ─────────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="pagina-contenido clientes-pagina">
        <div className="estado-carga">
          <div className="spinner" />
          <p>Cargando clientes…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pagina-contenido clientes-pagina">
        <div className="estado-error">
          <div className="error-icon"><AlertTriangle size={22} /></div>
          <p>{error}</p>
          <button className="btn-primario" onClick={cargarClientes}><RefreshCw size={15} /> Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pagina-contenido clientes-pagina">
      {/* Cabecera */}
      <div className="clientes-header">
        <div>
          <h1 className="pagina-titulo">Clientes</h1>
          <p className="pagina-subtitulo">{clientes.length} cliente{clientes.length !== 1 ? 's' : ''} registrado{clientes.length !== 1 ? 's' : ''}</p>
        </div>
        <button id="btn-nuevo-cliente" className="btn-primario" onClick={abrirNuevo}>
          <Plus size={17} /> Nuevo cliente
        </button>
      </div>

      {/* Buscador */}
      <div className="clientes-buscador-wrap">
        <Search size={16} className="buscador-icono" />
        <input
          id="buscador-clientes"
          type="text"
          className="buscador-input"
          placeholder="Buscar por nombre…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar clientes por nombre"
        />
        {busqueda && (
          <button className="buscador-limpiar" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Lista */}
      {clientesFiltrados.length === 0 ? (
        <div className="clientes-vacio">
          <span className="clientes-vacio-icono"><User size={48} strokeWidth={1} /></span>
          <p>{busqueda ? 'No se encontraron clientes con ese nombre.' : 'Aún no hay clientes registrados.'}</p>
        </div>
      ) : (
        <ul className="clientes-lista" role="list">
          {clientesFiltrados.map((cliente) => (
            <ClienteCard
              key={cliente.id}
              cliente={cliente}
              onEditar={abrirEditar}
              onEliminar={pedirConfirmacion}
              onVerHistorial={() => setClienteHistorial(cliente)}
            />
          ))}
        </ul>
      )}

      {/* Modal formulario */}
      {mostrarModal && (
        <ModalFormulario
          clienteEditando={clienteEditando}
          form={form}
          setForm={setForm}
          referencias={referencias}
          errores={errores}
          guardando={guardando}
          onGuardar={handleGuardar}
          onCerrar={cerrarModal}
          onAgregarRef={agregarReferencia}
          onActualizarRef={actualizarReferencia}
          onEliminarRef={eliminarReferencia}
        />
      )}

      {/* Confirmación eliminar */}
      {confirmEliminar && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="modal-confirm">
            <div className="modal-confirm-icono">
            <AlertTriangle size={32} strokeWidth={1.5} />
          </div>
            <h2 className="modal-confirm-titulo">¿Eliminar cliente?</h2>
            <p className="modal-confirm-texto">
              Estás a punto de eliminar a <strong>{confirmEliminar.nombre}</strong>. Esta acción no se puede deshacer.
            </p>
            <div className="modal-confirm-acciones">
              <button className="btn-secundario" onClick={() => setConfirmEliminar(null)}>Cancelar</button>
              <button id="btn-confirmar-eliminar" className="btn-peligro" onClick={confirmarEliminar}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast toast--${toast.tipo}`} role="alert">
          <span className="toast-icon">{toast.tipo === 'exito' ? <CheckCircle size={17} /> : <XCircle size={17} />}</span>
          {toast.mensaje}
        </div>
      )}
    </div>
  );
};

// ── Tarjeta de cliente ───────────────────────────────────────
interface ClienteCardProps {
  cliente: Cliente;
  onEditar: (c: Cliente) => void;
  onEliminar: (c: Cliente) => void;
  onVerHistorial: () => void;
}

const ClienteCard: React.FC<ClienteCardProps> = ({ cliente, onEditar, onEliminar, onVerHistorial }) => {
  const iniciales = cliente.nombre
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  return (
    <li className="cliente-card">
      <div className="cliente-avatar" aria-hidden="true">{iniciales}</div>
      <div className="cliente-info">
        <span className="cliente-nombre">{cliente.nombre}</span>
        <span className="cliente-detalle">
          <span className="cliente-detalle-item"><Phone size={12} strokeWidth={2} /> {cliente.telefono}</span>
          <span className="cliente-detalle-sep">·</span>
          <span className="cliente-detalle-item"><MapPin size={12} strokeWidth={2} /> {cliente.direccion}</span>
        </span>
        {cliente.referencias.length > 0 && (
          <span className="cliente-refs">
            {cliente.referencias.length} referencia{cliente.referencias.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="cliente-acciones">
        <button
          className="btn-icono-accion btn-icono-accion--historial"
          onClick={onVerHistorial}
          title="Ver historial de préstamos"
          aria-label={`Ver historial de ${cliente.nombre}`}
        >
          <Eye size={16} strokeWidth={1.8} />
        </button>
        <button
          id={`btn-editar-${cliente.id}`}
          className="btn-icono-accion btn-icono-accion--editar"
          onClick={() => onEditar(cliente)}
          title="Editar cliente"
          aria-label={`Editar ${cliente.nombre}`}
        >
          <Pencil size={15} strokeWidth={1.8} />
        </button>
        <button
          id={`btn-eliminar-${cliente.id}`}
          className="btn-icono-accion btn-icono-accion--eliminar"
          onClick={() => onEliminar(cliente)}
          title="Eliminar cliente"
          aria-label={`Eliminar ${cliente.nombre}`}
        >
          <Trash2 size={15} strokeWidth={1.8} />
        </button>
      </div>
    </li>
  );
};

// ── Modal formulario ─────────────────────────────────────────
interface ModalFormularioProps {
  clienteEditando: Cliente | null;
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  referencias: Referencia[];
  errores: ErroresForm;
  guardando: boolean;
  onGuardar: () => void;
  onCerrar: () => void;
  onAgregarRef: () => void;
  onActualizarRef: (idx: number, campo: keyof Referencia, valor: string) => void;
  onEliminarRef: (idx: number) => void;
}

const ModalFormulario: React.FC<ModalFormularioProps> = ({
  clienteEditando, form, setForm, referencias, errores, guardando,
  onGuardar, onCerrar, onAgregarRef, onActualizarRef, onEliminarRef,
}) => {
  const campo = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
      <div className="modal-formulario">
        {/* Cabecera */}
        <div className="modal-header">
          <h2 id="modal-titulo" className="modal-titulo">
            {clienteEditando ? <><Pencil size={17} /> Editar cliente</> : <><UserPlus size={17} /> Nuevo cliente</>}
          </h2>
          <button className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar" disabled={guardando}><X size={18} /></button>
        </div>

        <div className="modal-cuerpo">
          {/* Datos personales */}
          <fieldset className="form-grupo">
            <legend className="form-seccion-titulo">Datos personales</legend>

            <div className="form-fila">
              <label className="form-label" htmlFor="campo-nombre">
                Nombre completo <span className="form-requerido">*</span>
              </label>
              <input
                id="campo-nombre"
                type="text"
                className={`form-input ${errores.nombre ? 'form-input--error' : ''}`}
                placeholder="Ej: María López García"
                value={form.nombre}
                onChange={campo('nombre')}
                autoFocus
                disabled={guardando}
              />
              {errores.nombre && <span className="form-error">{errores.nombre}</span>}
            </div>

            <div className="form-grid-2">
              <div className="form-fila">
                <label className="form-label" htmlFor="campo-telefono">
                  Teléfono <span className="form-requerido">*</span>
                </label>
                <input
                  id="campo-telefono"
                  type="tel"
                  className={`form-input ${errores.telefono ? 'form-input--error' : ''}`}
                  placeholder="Ej: 3001234567"
                  value={form.telefono}
                  onChange={campo('telefono')}
                  disabled={guardando}
                />
                {errores.telefono && <span className="form-error">{errores.telefono}</span>}
              </div>

              <div className="form-fila">
                <label className="form-label" htmlFor="campo-documento">
                  Documento <span className="form-opcional">(opcional)</span>
                </label>
                <input
                  id="campo-documento"
                  type="text"
                  className="form-input"
                  placeholder="Ej: 1098765432"
                  value={form.documento}
                  onChange={campo('documento')}
                  disabled={guardando}
                />
              </div>
            </div>

            <div className="form-fila">
              <label className="form-label" htmlFor="campo-direccion">
                Dirección <span className="form-requerido">*</span>
              </label>
              <input
                id="campo-direccion"
                type="text"
                className={`form-input ${errores.direccion ? 'form-input--error' : ''}`}
                placeholder="Ej: Calle 5 Sur #12-34, Barrio El Prado"
                value={form.direccion}
                onChange={campo('direccion')}
                disabled={guardando}
              />
              {errores.direccion && <span className="form-error">{errores.direccion}</span>}
            </div>
          </fieldset>

          {/* Referencias */}
          <fieldset className="form-grupo">
            <legend className="form-seccion-titulo">
              Referencias
              <span className="form-seccion-count">{referencias.length}</span>
            </legend>

            {referencias.length === 0 && (
              <p className="referencias-vacio">No hay referencias. Agrega una abajo.</p>
            )}

            {referencias.map((ref, idx) => (
              <div key={idx} className="referencia-fila">
                <div className="referencia-numero">#{idx + 1}</div>
                <div className="referencia-campos">
                  <input
                    id={`ref-nombre-${idx}`}
                    type="text"
                    className="form-input"
                    placeholder="Nombre"
                    value={ref.nombre}
                    onChange={(e) => onActualizarRef(idx, 'nombre', e.target.value)}
                    aria-label={`Nombre de referencia ${idx + 1}`}
                    disabled={guardando}
                  />
                  <input
                    id={`ref-telefono-${idx}`}
                    type="tel"
                    className="form-input"
                    placeholder="Teléfono"
                    value={ref.telefono}
                    onChange={(e) => onActualizarRef(idx, 'telefono', e.target.value)}
                    aria-label={`Teléfono de referencia ${idx + 1}`}
                    disabled={guardando}
                  />
                  <input
                    id={`ref-parentesco-${idx}`}
                    type="text"
                    className="form-input"
                    placeholder="Parentesco (Ej: Madre)"
                    value={ref.parentesco}
                    onChange={(e) => onActualizarRef(idx, 'parentesco', e.target.value)}
                    aria-label={`Parentesco de referencia ${idx + 1}`}
                    disabled={guardando}
                  />
                </div>
                <button
                  className="btn-eliminar-ref"
                  onClick={() => onEliminarRef(idx)}
                  title="Eliminar referencia"
                  aria-label={`Eliminar referencia ${idx + 1}`}
                  disabled={guardando}
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              id="btn-agregar-referencia"
              className="btn-agregar-ref"
              onClick={onAgregarRef}
              type="button"
              disabled={guardando}
            >
              <Plus size={15} /> Agregar referencia
            </button>
          </fieldset>
        </div>

        {/* Pie del modal */}
        <div className="modal-pie">
          <button className="btn-secundario" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button id="btn-guardar-cliente" className="btn-primario" onClick={onGuardar} disabled={guardando}>
            {guardando ? 'Guardando…' : clienteEditando ? 'Guardar cambios' : 'Registrar cliente'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Clientes;

import React, { useState, useEffect } from 'react';
import './Inicio.css';
import { getDashboardStats, getClientesAtrasados, getCobrosSemana } from '../data/dashboardRepository';
import type { DashboardStats, ClienteAtrasado, CobroSemana } from '../data/dashboardRepository';
import { formatearFecha } from '../logic/calculos';
import {
  DollarSign,
  TrendingUp,
  CalendarClock,
  AlertTriangle,
  RefreshCw,
  Clock,
  CalendarDays,
} from 'lucide-react';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
};

interface CardConfig {
  titulo: string;
  valor: string;
  Icono: React.FC<{ size?: number; strokeWidth?: number }>;
  colorClass: string;
}

const Inicio: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [atrasados, setAtrasados] = useState<ClienteAtrasado[]>([]);
  const [cobrosSemana, setCobrosSemana] = useState<CobroSemana[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = async () => {
    try {
      setCargando(true);
      setError(null);
      const [dataStats, dataAtrasados, dataCobros] = await Promise.all([
        getDashboardStats(),
        getClientesAtrasados(),
        getCobrosSemana(),
      ]);
      setStats(dataStats);
      setAtrasados(dataAtrasados);
      setCobrosSemana(dataCobros);
    } catch (err: any) {
      setError(err.message ?? 'Error al cargar el panel de inicio.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  if (cargando) {
    return (
      <div className="pagina-contenido">
        <div className="estado-carga">
          <div className="spinner" />
          <p>Cargando panel…</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="pagina-contenido">
        <div className="estado-error">
          <div className="error-icon">
            <AlertTriangle size={22} />
          </div>
          <p>{error ?? 'No se pudieron cargar los datos.'}</p>
          <button className="btn-primario" onClick={cargarDatos}>
            <RefreshCw size={15} /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  const cards: CardConfig[] = [
    {
      titulo: 'Saldo Pendiente',
      valor: formatCurrency(stats.saldoPendiente),
      Icono: DollarSign,
      colorClass: 'card--azul',
    },
    {
      titulo: 'Ganancia Total',
      valor: formatCurrency(stats.gananciaTotal),
      Icono: TrendingUp,
      colorClass: 'card--verde',
    },
    {
      titulo: 'Cobro para Hoy',
      valor: formatCurrency(stats.cobroHoy),
      Icono: CalendarClock,
      colorClass: 'card--ambar',
    },
    {
      titulo: 'Clientes Atrasados',
      valor: String(stats.clientesAtrasadosCount),
      Icono: AlertTriangle,
      colorClass: stats.clientesAtrasadosCount > 0 ? 'card--rojo' : 'card--verde',
    },
  ];

  return (
    <div className="pagina-contenido">
      <div className="dashboard-container">

        {/* Header */}
        <div className="dashboard-header">
          <div>
            <h1 className="pagina-titulo">Panel de Control</h1>
            <p className="pagina-subtitulo">Resumen general de tu cartera de préstamos</p>
          </div>
          <button className="btn-refresh" onClick={cargarDatos} title="Actualizar datos">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Tarjetas */}
        <div className="dashboard-cards">
          {cards.map((card) => (
            <div key={card.titulo} className={`dashboard-card ${card.colorClass}`}>
              <div className="card-icon-wrap">
                <card.Icono size={22} strokeWidth={1.8} />
              </div>
              <div className="card-body">
                <span className="card-title">{card.titulo}</span>
                <span className="card-value">{card.valor}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Clientes atrasados */}
        <div className="atrasados-section">
          <div className="atrasados-section-header">
            <h2 className="atrasados-titulo">
              <AlertTriangle size={18} strokeWidth={2} />
              Clientes Atrasados
            </h2>
            {atrasados.length > 0 && (
              <span className="atrasados-badge">{atrasados.length}</span>
            )}
          </div>

          {atrasados.length === 0 ? (
            <div className="no-atrasados">
              <TrendingUp size={28} strokeWidth={1.5} />
              <span>¡Excelente! No hay clientes con cuotas atrasadas.</span>
            </div>
          ) : (
            <div className="atrasados-list">
              {atrasados.map(cliente => (
                <div key={cliente.id} className="atrasado-item">
                  <div className="atrasado-avatar">
                    {cliente.nombre.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()}
                  </div>
                  <div className="atrasado-info">
                    <span className="atrasado-nombre">{cliente.nombre}</span>
                    <span className="atrasado-dias">
                      <Clock size={13} strokeWidth={2} />
                      {cliente.diasAtraso} días de atraso
                    </span>
                  </div>
                  <div className="atrasado-monto">
                    {formatCurrency(cliente.montoAtrasado)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cobros de la Semana */}
        <div className="atrasados-section cobros-semana-section">
          <div className="atrasados-section-header">
            <h2 className="atrasados-titulo">
              <CalendarDays size={18} strokeWidth={2} />
              Por Cobrar Esta Semana
            </h2>
            {cobrosSemana.length > 0 && (
              <span className="atrasados-badge" style={{ background: 'var(--color-primario)' }}>{cobrosSemana.length}</span>
            )}
          </div>

          {cobrosSemana.length === 0 ? (
            <div className="no-atrasados">
              <CalendarClock size={28} strokeWidth={1.5} />
              <span>No hay cuotas programadas para cobrar esta semana.</span>
            </div>
          ) : (
            <div className="atrasados-list">
              {cobrosSemana.map((cobro) => (
                <div key={`${cobro.id_prestamo}-${cobro.numero_cuota}`} className="atrasado-item cobro-item">
                  <div className="atrasado-avatar" style={{ background: 'rgba(59, 130, 246, 0.15)', color: 'var(--color-primario-light)' }}>
                    {cobro.nombre.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()}
                  </div>
                  <div className="atrasado-info">
                    <span className="atrasado-nombre">{cobro.nombre}</span>
                    <span className="atrasado-dias">
                      <CalendarDays size={13} strokeWidth={2} />
                      Ir el: {formatearFecha(cobro.fechaCobro)}
                    </span>
                  </div>
                  <div className="atrasado-monto" style={{ color: 'var(--color-texto)' }}>
                    {formatCurrency(cobro.monto)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Inicio;

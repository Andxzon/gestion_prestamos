import React, { useState, useEffect } from 'react';
import './Inicio.css';
import { getDashboardStats, getClientesAtrasados } from '../data/dashboardRepository';
import type { DashboardStats, ClienteAtrasado } from '../data/dashboardRepository';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
};

const Inicio: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [atrasados, setAtrasados] = useState<ClienteAtrasado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = async () => {
    try {
      setCargando(true);
      setError(null);
      const [dataStats, dataAtrasados] = await Promise.all([
        getDashboardStats(),
        getClientesAtrasados(),
      ]);
      setStats(dataStats);
      setAtrasados(dataAtrasados);
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
          <span>⚠️</span>
          <p>{error ?? 'No se pudieron cargar los datos.'}</p>
          <button className="btn-primario" onClick={cargarDatos}>Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pagina-contenido">
      <div className="dashboard-container">
        
        <div className="dashboard-cards">
          <div className="dashboard-card">
            <span className="card-title">Saldo Pendiente</span>
            <span className="card-value">{formatCurrency(stats.saldoPendiente)}</span>
          </div>
          
          <div className="dashboard-card">
            <span className="card-title">Ganancia Total</span>
            <span className="card-value" style={{ color: 'var(--success-color)' }}>
              {formatCurrency(stats.gananciaTotal)}
            </span>
          </div>

          <div className="dashboard-card">
            <span className="card-title">Cobro para Hoy</span>
            <span className="card-value" style={{ color: 'var(--accent-color)' }}>
              {formatCurrency(stats.cobroHoy)}
            </span>
          </div>

          <div className={`dashboard-card ${stats.clientesAtrasadosCount > 0 ? 'warning' : ''}`}>
            <span className="card-title">Clientes Atrasados</span>
            <span className="card-value">{stats.clientesAtrasadosCount}</span>
          </div>
        </div>

        <div className="atrasados-section">
          <h2>Lista de Clientes Atrasados</h2>
          {atrasados.length === 0 ? (
            <div className="no-atrasados">
              ¡Excelente! No hay clientes con cuotas atrasadas.
            </div>
          ) : (
            <div className="atrasados-list">
              {atrasados.map(cliente => (
                <div key={cliente.id} className="atrasado-item">
                  <div className="atrasado-info">
                    <span className="atrasado-nombre">{cliente.nombre}</span>
                    <span className="atrasado-dias">⚠️ {cliente.diasAtraso} días de atraso</span>
                  </div>
                  <div className="atrasado-monto">
                    {formatCurrency(cliente.montoAtrasado)}
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

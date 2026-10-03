import React, { useState, useEffect } from 'react';
import './Reportes.css';
import { obtenerReporteClientes, obtenerProyeccion } from '../data/dashboardRepository';
import type { ReporteClienteRow, Proyeccion } from '../data/dashboardRepository';
import { fechaHoyLocal } from '../logic/calculos';
import { Download, Printer, AlertTriangle, RefreshCw } from 'lucide-react';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
};

const Reportes: React.FC = () => {
  const [reporteClientes, setReporteClientes] = useState<ReporteClienteRow[]>([]);
  const [proyeccion, setProyeccion] = useState<Proyeccion>({ recaudoEsperado: 0, gananciaProyectada: 0 });
  const [periodoProyeccion, setPeriodoProyeccion] = useState<'semana' | 'mes'>('semana');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarReporte = async () => {
    try {
      setCargando(true);
      setError(null);
      const data = await obtenerReporteClientes();
      setReporteClientes(data);
    } catch (err: any) {
      setError(err.message ?? 'Error al cargar el reporte.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarReporte();
  }, []);

  useEffect(() => {
    const hoy = new Date();
    const fechaInicio = fechaHoyLocal();
    const fin = new Date(hoy);
    if (periodoProyeccion === 'semana') {
      fin.setDate(hoy.getDate() + 7);
    } else {
      fin.setMonth(hoy.getMonth() + 1);
    }
    const yyyy = fin.getFullYear();
    const mm = String(fin.getMonth() + 1).padStart(2, '0');
    const dd = String(fin.getDate()).padStart(2, '0');
    const fechaFin = `${yyyy}-${mm}-${dd}`;

    obtenerProyeccion(fechaInicio, fechaFin)
      .then(setProyeccion)
      .catch((err) => console.warn('Error en proyección:', err.message));
  }, [periodoProyeccion]);

  const exportarCSV = () => {
    if (reporteClientes.length === 0) return;
    const cabeceras = ['Nombre', 'Dirección', 'Teléfono', 'Valor Préstamos', 'Intereses Pagados', 'Intereses Mora', 'Total Abonado', 'Saldo Pendiente', 'Cuotas Atrasadas', 'Estado', 'Último Pago'];
    const filas = reporteClientes.map(r => [
      r.nombre, r.direccion, r.telefono,
      r.valorPrestamo, r.interesesPagados, r.interesesMora, r.totalAbonado,
      r.saldoPendiente, r.cuotasAtrasadas,
      r.estadoPrestamo, r.fechaUltimoPago
    ]);
    const csvContent = [
      cabeceras.join(','),
      ...filas.map(fila => fila.map(v => `"${v}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_clientes_${fechaHoyLocal()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (cargando) {
    return (
      <div className="pagina-contenido">
        <div className="estado-carga">
          <div className="spinner" />
          <p>Cargando reporte…</p>
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
          <button className="btn-primario" onClick={cargarReporte}><RefreshCw size={15} /> Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pagina-contenido">
      <div className="reportes-container">
        
        <div className="reportes-header">
          <div className="filtros-grupo">
            <label htmlFor="proyeccion-select">Proyección:</label>
            <select 
              id="proyeccion-select"
              className="report-select"
              value={periodoProyeccion}
              onChange={(e) => setPeriodoProyeccion(e.target.value as 'semana' | 'mes')}
            >
              <option value="semana">Esta Semana (7 días)</option>
              <option value="mes">Este Mes (30 días)</option>
            </select>
          </div>
          
          <div className="acciones-grupo">
            <button className="btn-exportar" onClick={exportarCSV}>
              <Download size={16} /> Exportar CSV
            </button>
            <button className="btn-exportar" onClick={() => window.print()} style={{ backgroundColor: 'var(--color-primario)' }}>
              <Printer size={16} /> Imprimir
            </button>
          </div>
        </div>

        <div className="proyeccion-section">
          <div className="proyeccion-card">
            <span className="proyeccion-titulo">Recaudo Esperado ({periodoProyeccion})</span>
            <span className="proyeccion-valor">{formatCurrency(proyeccion.recaudoEsperado)}</span>
          </div>
          <div className="proyeccion-card ganancia">
            <span className="proyeccion-titulo">Ganancia Proyectada ({periodoProyeccion})</span>
            <span className="proyeccion-valor">{formatCurrency(proyeccion.gananciaProyectada)}</span>
          </div>
        </div>

        <div className="tabla-reportes-container">
          <table className="tabla-reportes">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Valor Préstamo</th>
                <th>Intereses Pagados</th>
                <th>Mora Pagada</th>
                <th>Total Abonado</th>
                <th>Saldo Pendiente</th>
                <th>Atrasos</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {reporteClientes.map(fila => (
                <tr key={fila.id}>
                  <td>
                    <div><strong>{fila.nombre}</strong></div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{fila.telefono}</div>
                  </td>
                  <td>{formatCurrency(fila.valorPrestamo)}</td>
                  <td>{formatCurrency(fila.interesesPagados)}</td>
                  <td>{formatCurrency(fila.interesesMora)}</td>
                  <td style={{ color: 'var(--color-verde)' }}>{formatCurrency(fila.totalAbonado)}</td>
                  <td style={{ fontWeight: '600' }}>{formatCurrency(fila.saldoPendiente)}</td>
                  <td className={fila.cuotasAtrasadas > 0 ? 'texto-peligro' : ''}>
                    {fila.cuotasAtrasadas} cuotas
                  </td>
                  <td>
                    <span className={`badge-estado ${fila.estadoPrestamo}`}>
                      {fila.estadoPrestamo}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};

export default Reportes;

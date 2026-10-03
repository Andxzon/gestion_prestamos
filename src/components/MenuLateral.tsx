import React from 'react';
import './MenuLateral.css';

export type SeccionActiva = 'inicio' | 'clientes' | 'prestamos' | 'cobros' | 'reportes';

interface Props {
  seccionActiva: SeccionActiva;
  onNavegar: (seccion: SeccionActiva) => void;
  onCerrarSesion: () => void;
  usuarioEmail: string;
}

const items: { id: SeccionActiva; etiqueta: string; icono: string }[] = [
  { id: 'inicio',     etiqueta: 'Inicio',    icono: '🏠' },
  { id: 'clientes',   etiqueta: 'Clientes',  icono: '👥' },
  { id: 'prestamos',  etiqueta: 'Préstamos', icono: '💰' },
  { id: 'cobros',     etiqueta: 'Cobros',    icono: '📋' },
  { id: 'reportes',   etiqueta: 'Reportes',  icono: '📊' },
];

const MenuLateral: React.FC<Props> = ({ seccionActiva, onNavegar, onCerrarSesion, usuarioEmail }) => {
  return (
    <aside className="menu-lateral" role="navigation" aria-label="Menú principal">
      {/* Logo / Marca */}
      <div className="menu-header">
        <div className="menu-logo">
          <span className="menu-logo-icon">💼</span>
          <div className="menu-logo-texto">
            <span className="menu-logo-nombre">PrestaMás</span>
            <span className="menu-logo-slogan">Gestión de préstamos</span>
          </div>
        </div>
      </div>

      {/* Navegación */}
      <nav className="menu-nav">
        <ul className="menu-lista" role="list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                id={`nav-${item.id}`}
                className={`menu-item ${seccionActiva === item.id ? 'menu-item--activo' : ''}`}
                onClick={() => onNavegar(item.id)}
                aria-current={seccionActiva === item.id ? 'page' : undefined}
              >
                <span className="menu-item-icono" aria-hidden="true">{item.icono}</span>
                <span className="menu-item-texto">{item.etiqueta}</span>
                {seccionActiva === item.id && (
                  <span className="menu-item-indicador" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Pie del menú */}
      <div className="menu-footer">
        {usuarioEmail && (
          <div className="menu-usuario" title={usuarioEmail}>
            <span className="menu-usuario-icono">👤</span>
            <span className="menu-usuario-email">{usuarioEmail}</span>
          </div>
        )}
        <button
          id="btn-cerrar-sesion"
          className="menu-cerrar-sesion"
          onClick={onCerrarSesion}
          title="Cerrar sesión"
        >
          <span>🚪</span>
          <span>Cerrar sesión</span>
        </button>
        <div className="menu-version">v3.0.0 — Supabase</div>
      </div>
    </aside>
  );
};

export default MenuLateral;

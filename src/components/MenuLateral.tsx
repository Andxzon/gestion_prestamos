import React from 'react';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  ClipboardList,
  BarChart3,
  LogOut,
  User,
  Briefcase,
  X,
} from 'lucide-react';
import './MenuLateral.css';

export type SeccionActiva = 'inicio' | 'clientes' | 'prestamos' | 'cobros' | 'reportes';

interface Props {
  seccionActiva: SeccionActiva;
  onNavegar: (seccion: SeccionActiva) => void;
  onCerrarSesion: () => void;
  usuarioEmail: string;
  menuAbierto: boolean;
  onCerrarMenu: () => void;
}

const items: { id: SeccionActiva; etiqueta: string; Icono: React.FC<{ size?: number; strokeWidth?: number }> }[] = [
  { id: 'inicio',     etiqueta: 'Inicio',    Icono: LayoutDashboard },
  { id: 'clientes',   etiqueta: 'Clientes',  Icono: Users },
  { id: 'prestamos',  etiqueta: 'Préstamos', Icono: CreditCard },
  { id: 'cobros',     etiqueta: 'Cobros',    Icono: ClipboardList },
  { id: 'reportes',   etiqueta: 'Reportes',  Icono: BarChart3 },
];

const MenuLateral: React.FC<Props> = ({
  seccionActiva,
  onNavegar,
  onCerrarSesion,
  usuarioEmail,
  menuAbierto,
  onCerrarMenu,
}) => {
  const handleNavegar = (seccion: SeccionActiva) => {
    onNavegar(seccion);
    onCerrarMenu();
  };

  return (
    <>
      {/* Overlay móvil */}
      {menuAbierto && (
        <div className="menu-overlay" onClick={onCerrarMenu} aria-hidden="true" />
      )}

      <aside
        className={`menu-lateral ${menuAbierto ? 'menu-lateral--abierto' : ''}`}
        role="navigation"
        aria-label="Menú principal"
      >
        {/* Logo / Marca */}
        <div className="menu-header">
          <div className="menu-logo">
            <div className="menu-logo-icon-wrap">
              <Briefcase size={20} strokeWidth={1.8} />
            </div>
            <div className="menu-logo-texto">
              <span className="menu-logo-nombre">PrestaMás</span>
              <span className="menu-logo-slogan">Gestión de préstamos</span>
            </div>
          </div>
          <button className="menu-cerrar-movil" onClick={onCerrarMenu} aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>

        {/* Navegación */}
        <nav className="menu-nav">
          <ul className="menu-lista" role="list">
            {items.map((item) => {
              const activo = seccionActiva === item.id;
              return (
                <li key={item.id}>
                  <button
                    id={`nav-${item.id}`}
                    className={`menu-item ${activo ? 'menu-item--activo' : ''}`}
                    onClick={() => handleNavegar(item.id)}
                    aria-current={activo ? 'page' : undefined}
                  >
                    <span className="menu-item-icono" aria-hidden="true">
                      <item.Icono size={18} strokeWidth={activo ? 2.2 : 1.8} />
                    </span>
                    <span className="menu-item-texto">{item.etiqueta}</span>
                    {activo && <span className="menu-item-indicador" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Pie del menú */}
        <div className="menu-footer">
          {usuarioEmail && (
            <div className="menu-usuario" title={usuarioEmail}>
              <div className="menu-usuario-avatar">
                <User size={14} strokeWidth={2} />
              </div>
              <span className="menu-usuario-email">{usuarioEmail}</span>
            </div>
          )}
          <button
            id="btn-cerrar-sesion"
            className="menu-cerrar-sesion"
            onClick={onCerrarSesion}
            title="Cerrar sesión"
          >
            <LogOut size={15} strokeWidth={1.8} />
            <span>Cerrar sesión</span>
          </button>
          <div className="menu-version">v3.0.0 — Supabase</div>
        </div>
      </aside>
    </>
  );
};

export default MenuLateral;

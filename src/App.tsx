import React, { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabaseClient';
import MenuLateral from './components/MenuLateral';
import type { SeccionActiva } from './components/MenuLateral';
import Inicio from './pages/Inicio';
import Clientes from './pages/Clientes';
import Prestamos from './pages/Prestamos';
import Cobros from './pages/Cobros';
import Reportes from './pages/Reportes';
import Login from './pages/Login';
import { Menu } from 'lucide-react';
import './App.css';

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [seccion, setSeccion] = useState<SeccionActiva>('inicio');
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Escuchar cambios de sesión (login / logout)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Cerrar menú al cambiar a pantalla grande
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setMenuAbierto(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleCerrarSesion = async () => {
    await supabase.auth.signOut();
  };

  // Cargando sesión inicial
  if (session === undefined) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0f1420',
          color: '#94a3b8',
          fontFamily: "'Inter', sans-serif",
          fontSize: '1.1rem',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '20px',
            height: '20px',
            border: '3px solid rgba(59,130,246,0.3)',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        Verificando sesión…
      </div>
    );
  }

  // Sin sesión → mostrar login
  if (!session) {
    return <Login />;
  }

  // Con sesión → mostrar la app
  const renderPagina = () => {
    switch (seccion) {
      case 'inicio':    return <Inicio />;
      case 'clientes':  return <Clientes />;
      case 'prestamos': return <Prestamos />;
      case 'cobros':    return <Cobros />;
      case 'reportes':  return <Reportes />;
    }
  };

  return (
    <div className="app-layout">
      <MenuLateral
        seccionActiva={seccion}
        onNavegar={setSeccion}
        onCerrarSesion={handleCerrarSesion}
        usuarioEmail={session.user.email ?? ''}
        menuAbierto={menuAbierto}
        onCerrarMenu={() => setMenuAbierto(false)}
      />
      <div className="app-content">
        {/* Topbar móvil */}
        <header className="app-topbar">
          <button
            className="app-hamburger"
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir menú"
          >
            <Menu size={22} />
          </button>
          <span className="app-topbar-titulo">PrestaMás</span>
        </header>
        <main className="app-main" id="contenido-principal">
          {renderPagina()}
        </main>
      </div>
    </div>
  );
};

export default App;

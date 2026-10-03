// ============================================================
// PANTALLA DE LOGIN — Supabase Auth
// Solo correo + contraseña. Sin opción de registro.
// ============================================================

import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Briefcase, AlertTriangle, Mail, Lock, LogIn } from 'lucide-react';
import './Login.css';

const Login: React.FC = () => {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!correo.trim()) {
      setError('Ingresa tu correo electrónico.');
      return;
    }
    if (!contrasena) {
      setError('Ingresa tu contraseña.');
      return;
    }

    setCargando(true);
    try {
      const { error: errAuth } = await supabase.auth.signInWithPassword({
        email: correo.trim(),
        password: contrasena,
      });

      if (errAuth) {
        if (
          errAuth.message.includes('Invalid login credentials') ||
          errAuth.message.includes('invalid_credentials')
        ) {
          setError('Correo o contraseña incorrectos. Verifica tus datos.');
        } else if (errAuth.message.includes('Email not confirmed')) {
          setError('Debes confirmar tu correo electrónico antes de ingresar.');
        } else {
          setError(`Error al iniciar sesión: ${errAuth.message}`);
        }
      }
    } catch (err: any) {
      setError(`Error inesperado: ${err.message ?? String(err)}`);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <Briefcase size={28} strokeWidth={1.8} />
          </div>
          <h1 className="login-titulo">PrestaMás</h1>
          <p className="login-subtitulo">Gestión de préstamos</p>
        </div>

        <form onSubmit={handleLogin} className="login-form" noValidate>
          <div className="login-campo">
            <label htmlFor="login-correo" className="login-label">
              Correo electrónico
            </label>
            <div className="login-input-wrap">
              <Mail size={16} className="login-input-icon" />
              <input
                id="login-correo"
                type="email"
                className="login-input"
                placeholder="usuario@ejemplo.com"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                autoComplete="email"
                autoFocus
                disabled={cargando}
              />
            </div>
          </div>

          <div className="login-campo">
            <label htmlFor="login-contrasena" className="login-label">
              Contraseña
            </label>
            <div className="login-input-wrap">
              <Lock size={16} className="login-input-icon" />
              <input
                id="login-contrasena"
                type="password"
                className="login-input"
                placeholder="••••••••"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                autoComplete="current-password"
                disabled={cargando}
              />
            </div>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button
            id="btn-ingresar"
            type="submit"
            className="login-btn"
            disabled={cargando}
          >
            {cargando ? (
              <>
                <span className="login-spinner" /> Ingresando…
              </>
            ) : (
              <><LogIn size={17} /> Ingresar</>
            )}
          </button>
        </form>

        <p className="login-nota">
          ¿Olvidaste tu contraseña? Contacta al administrador.
        </p>
      </div>
    </div>
  );
};

export default Login;

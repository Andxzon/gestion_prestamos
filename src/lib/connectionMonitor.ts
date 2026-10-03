// ============================================================
// MONITOR DE CONEXIÓN
// Detecta el estado real de conectividad con Supabase.
// Usa navigator.onLine + ping real para evitar falsos positivos.
// Dispara callbacks cuando cambia el estado.
// ============================================================

import { supabase } from './supabaseClient';

type ConnectionCallback = (online: boolean) => void;

class ConnectionMonitor {
  private _online: boolean;
  private _listeners: Set<ConnectionCallback> = new Set();
  private _pingIntervalId: ReturnType<typeof setInterval> | null = null;
  private _initialized = false;

  constructor() {
    this._online = navigator.onLine;
  }

  /** Inicializar el monitor (llamar una sola vez). */
  init(): void {
    if (this._initialized) return;
    this._initialized = true;

    // Escuchar eventos del navegador
    window.addEventListener('online', () => {
      this._handleBrowserEvent(true);
    });

    window.addEventListener('offline', () => {
      this._setOnline(false);
    });

    // Ping periódico cada 30 segundos para verificar conexión real
    this._pingIntervalId = setInterval(() => {
      this._pingSupabase();
    }, 30_000);

    // Ping inicial
    this._pingSupabase();
  }

  /** Estado actual de conexión. */
  get isOnline(): boolean {
    return this._online;
  }

  /** Registrar un callback para cambios de estado. Retorna función para desregistrar. */
  onChange(callback: ConnectionCallback): () => void {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /** Forzar verificación de conectividad. */
  async checkNow(): Promise<boolean> {
    return this._pingSupabase();
  }

  /** Destruir el monitor. */
  destroy(): void {
    if (this._pingIntervalId) {
      clearInterval(this._pingIntervalId);
      this._pingIntervalId = null;
    }
    this._listeners.clear();
    this._initialized = false;
  }

  // ── Privados ──────────────────────────────────────────────

  private _handleBrowserEvent(online: boolean): void {
    if (online) {
      // El navegador dice que estamos online, pero verificamos con un ping real
      this._pingSupabase();
    } else {
      this._setOnline(false);
    }
  }

  private async _pingSupabase(): Promise<boolean> {
    try {
      // Query liviana: solo verificar que Supabase responde
      const { error } = await supabase.from('cliente').select('id_cliente').limit(1);

      if (error) {
        // Error de Supabase (no es de red), seguimos online
        this._setOnline(true);
        return true;
      }

      this._setOnline(true);
      return true;
    } catch {
      // Error de red: no hay conexión
      this._setOnline(false);
      return false;
    }
  }

  private _setOnline(value: boolean): void {
    const changed = this._online !== value;
    this._online = value;

    if (changed) {
      console.log(`[ConnectionMonitor] Estado: ${value ? '🟢 ONLINE' : '🔴 OFFLINE'}`);

      // Notificar a todos los listeners
      for (const cb of this._listeners) {
        try {
          cb(value);
        } catch (err) {
          console.error('[ConnectionMonitor] Error en listener:', err);
        }
      }

      // Despachar evento global para componentes React
      window.dispatchEvent(
        new CustomEvent('connection-change', { detail: { online: value } }),
      );
    }
  }
}

// Singleton
export const connectionMonitor = new ConnectionMonitor();

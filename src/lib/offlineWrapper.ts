// ============================================================
// WRAPPER OFFLINE — Protección contra pérdida de datos
// 
// Envuelve cada operación de escritura para garantizar que:
// 1. Los datos se guardan en IndexedDB ANTES de intentar Supabase
// 2. Si Supabase falla por red, los datos quedan en la cola
// 3. Si Supabase tiene éxito, se marca como sincronizado
// 4. NUNCA se envían datos vacíos/nulos a la base de datos
// ============================================================

import {
  addToQueue,
  markSynced,
  removeFromQueue,
  type QueueEntry,
} from './offlineQueue';
import { getDeviceId } from './deviceId';
import { isReplaying } from './syncState';

// ── Error especial para operaciones encoladas ─────────────────

export class OfflineQueuedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineQueuedError';
  }
}

// ── Configuración del wrapper ─────────────────────────────────

export interface OfflineProtectionConfig<T> {
  /** Nombre único de la operación (ej: 'guardarCliente'). */
  operationKey: string;

  /** Tipo de operación SQL. */
  operationType: 'insert' | 'update' | 'delete';

  /** Datos/argumentos a guardar en la cola para replay. */
  payload: any;

  /** Función que ejecuta la operación real en Supabase. */
  execute: () => Promise<T>;

  /** Resultado a devolver si estamos offline (evita que el UI se rompa). */
  getFallbackResult?: () => T;

  /** Metadata para Last-Write-Wins en operaciones de update. */
  lww?: {
    table: string;
    keyField: string;
    keyValue: string;
  };
}

// ── Detección de errores de red ───────────────────────────────

export function isNetworkError(err: unknown): boolean {
  // Si el navegador reporta offline, es error de red
  if (!navigator.onLine) return true;

  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    if (msg.includes('fetch') || msg.includes('network')) return true;
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('network') ||
      msg.includes('net::') ||
      msg.includes('timeout') ||
      msg.includes('econnrefused') ||
      msg.includes('enotfound') ||
      msg.includes('err_internet') ||
      msg.includes('err_connection') ||
      msg.includes('load failed') ||
      msg.includes('networkerror')
    );
  }

  return false;
}

/** Verifica si un error es de clave duplicada (registro ya existe). */
export function isDuplicateKeyError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('23505') ||
      msg.includes('unique') ||
      msg.includes('duplicate') ||
      msg.includes('already exists')
    );
  }
  return false;
}

// ── Validación anti-datos vacíos ──────────────────────────────

function validatePayload(payload: any, operationKey: string): void {
  if (payload === null || payload === undefined) {
    throw new Error(
      `PROTECCIÓN DE DATOS: La operación "${operationKey}" tiene payload nulo. ` +
      `Esto podría vaciar registros. Operación BLOQUEADA.`
    );
  }

  if (typeof payload === 'object' && !Array.isArray(payload)) {
    const keys = Object.keys(payload);
    // Un objeto completamente vacío es sospechoso
    if (keys.length === 0) {
      throw new Error(
        `PROTECCIÓN DE DATOS: La operación "${operationKey}" tiene payload vacío ({}). ` +
        `Operación BLOQUEADA.`
      );
    }
  }
}

// ── Notificación de operaciones encoladas ─────────────────────

function notifyOfflineQueued(operationKey: string): void {
  console.warn(`[Offline] Operación "${operationKey}" guardada localmente. Se sincronizará al recuperar conexión.`);

  window.dispatchEvent(
    new CustomEvent('offline-operation-queued', {
      detail: {
        operationKey,
        message: 'Guardado localmente. Se sincronizará cuando haya conexión.',
        timestamp: new Date().toISOString(),
      },
    }),
  );
}

// ── Función principal ─────────────────────────────────────────

/**
 * Envuelve una operación de escritura con protección offline.
 * 
 * Flujo:
 *   1. Si estamos en modo replay → ejecutar directamente (sin encolar)
 *   2. Validar que el payload no sea vacío/nulo
 *   3. Guardar en IndexedDB (seguridad ante todo)
 *   4. Intentar ejecutar en Supabase
 *   5. Si éxito → marcar como sincronizado
 *   6. Si error de red → mantener en cola, retornar resultado fallback
 *   7. Si otro error → eliminar de cola, propagar error
 */
export async function withOfflineProtection<T>(
  config: OfflineProtectionConfig<T>,
): Promise<T> {
  // ── Modo replay: ejecutar directamente ──
  if (isReplaying()) {
    return config.execute();
  }

  // ── Validar datos ──
  validatePayload(config.payload, config.operationKey);

  // ── Crear entrada en la cola ──
  const entry: QueueEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    deviceId: getDeviceId(),
    operationKey: config.operationKey,
    operationType: config.operationType,
    payload: config.payload,
    lwwTable: config.lww?.table,
    lwwKeyField: config.lww?.keyField,
    lwwKeyValue: config.lww?.keyValue,
    status: 'pending',
    retryCount: 0,
  };

  // ── PASO CRÍTICO: Guardar en IndexedDB PRIMERO ──
  // Esto garantiza que los datos NUNCA se pierdan, incluso si
  // la pestaña se cierra o el dispositivo se apaga ahora mismo.
  try {
    await addToQueue(entry);
  } catch (queueError) {
    console.error('[Offline] Error al guardar en cola local:', queueError);
    // Aún así intentamos ejecutar en Supabase
  }

  // ── Intentar ejecutar en Supabase ──
  try {
    const result = await config.execute();

    // Éxito → marcar como sincronizado
    try {
      await markSynced(entry.id);
    } catch {
      // No es crítico si falla el marcado
    }

    return result;
  } catch (err) {
    if (isNetworkError(err)) {
      // Error de red → datos ya están seguros en IndexedDB
      notifyOfflineQueued(config.operationKey);

      if (config.getFallbackResult) {
        return config.getFallbackResult();
      }

      // Para funciones void, retornar undefined
      return undefined as T;
    }

    // Error NO de red (validación, constraint, etc.) →
    // eliminar de la cola porque es un error legítimo
    try {
      await removeFromQueue(entry.id);
    } catch {
      // No es crítico
    }

    throw err;
  }
}

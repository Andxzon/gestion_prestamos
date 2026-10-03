// ============================================================
// MOTOR DE SINCRONIZACIÓN
// Procesa la cola de operaciones pendientes cuando hay conexión.
// Implementa Last-Write-Wins para resolución de conflictos.
// ============================================================

import {
  getPendingOperations,
  markSynced,
  markFailed,
  markSyncing,
  markSkipped,
  removeFromQueue,
  type QueueEntry,
} from './offlineQueue';
import { connectionMonitor } from './connectionMonitor';
import { enterReplay, exitReplay } from './syncState';
import { getDeviceId } from './deviceId';
import { supabase } from './supabaseClient';
import { isDuplicateKeyError } from './offlineWrapper';

// ── Importar todas las funciones mutadoras ────────────────────
import * as clienteRepo from '../data/clienteRepository';
import * as prestamoRepo from '../data/prestamoRepository';
import * as pagoRepo from '../data/pagoRepository';
import * as cuotaRepo from '../data/cuotaRepository';

// Mapa de operaciones disponibles
const operationsMap: Record<string, Function> = {
  guardarCliente: clienteRepo.guardarCliente,
  actualizarCliente: clienteRepo.actualizarCliente,
  eliminarCliente: clienteRepo.eliminarCliente,

  guardarPrestamo: prestamoRepo.guardarPrestamo,
  actualizarEstadoPrestamo: prestamoRepo.actualizarEstadoPrestamo,
  actualizarPrestamo: prestamoRepo.actualizarPrestamo,
  eliminarPrestamo: prestamoRepo.eliminarPrestamo,

  registrarPago: pagoRepo.registrarPago,
  eliminarPago: pagoRepo.eliminarPago,

  actualizarCuota: cuotaRepo.actualizarCuota,
};

let _isSyncing = false;

/**
 * Verifica si una operación UPDATE es válida según Last-Write-Wins.
 * Retorna true si debemos aplicarla, false si debemos descartarla (remoto es más nuevo).
 */
async function checkLWW(entry: QueueEntry): Promise<boolean> {
  if (entry.operationType !== 'update' || !entry.lwwTable || !entry.lwwKeyField || !entry.lwwKeyValue) {
    return true; // No es update o no tiene config LWW → aplicar directo
  }

  try {
    const { data, error } = await supabase
      .from(entry.lwwTable)
      .select('updated_at')
      .eq(entry.lwwKeyField, entry.lwwKeyValue)
      .maybeSingle();

    if (error) {
      console.warn(`[Sync] Error al verificar LWW para ${entry.id}:`, error);
      return true; // Ante la duda, intentamos aplicar
    }

    if (!data || !data.updated_at) {
      return true; // El registro no existe o no tiene updated_at
    }

    const remoteTime = new Date(data.updated_at).getTime();
    const localTime = new Date(entry.timestamp).getTime();

    // Si el registro remoto fue modificado DESPUÉS de nuestra operación local,
    // significa que el remoto ganó el conflicto. Descartamos el local.
    if (remoteTime > localTime) {
      return false;
    }

    return true; // Nuestro cambio es más reciente (o igual)
  } catch (err) {
    console.warn(`[Sync] Excepción al verificar LWW para ${entry.id}:`, err);
    return true;
  }
}

/**
 * Inicia el proceso de sincronización.
 */
export async function syncNow(): Promise<void> {
  if (_isSyncing) return;
  
  if (!connectionMonitor.isOnline) {
    // Si creemos que estamos offline, forzar ping para confirmar
    const online = await connectionMonitor.checkNow();
    if (!online) return;
  }

  _isSyncing = true;
  window.dispatchEvent(new CustomEvent('sync-start'));

  try {
    const pending = await getPendingOperations();
    
    if (pending.length === 0) {
      return; // Nada que hacer
    }

    console.log(`[Sync] Iniciando sincronización de ${pending.length} operaciones...`);
    let successCount = 0;
    let errorCount = 0;

    // Activar modo replay para que las llamadas no se vuelvan a encolar
    enterReplay();

    for (const entry of pending) {
      // 1. Verificar si seguimos online (puede caerse en medio)
      if (!navigator.onLine) {
        console.warn('[Sync] Conexión perdida durante sincronización. Abortando.');
        break;
      }

      await markSyncing(entry.id);

      // 2. Obtener la función a ejecutar
      const fn = operationsMap[entry.operationKey];
      if (!fn) {
        console.error(`[Sync] Función no encontrada para operationKey: ${entry.operationKey}`);
        await markFailed(entry.id, `Función no encontrada: ${entry.operationKey}`);
        errorCount++;
        continue;
      }

      // 3. Resolución de conflictos LWW (Last-Write-Wins)
      const shouldApply = await checkLWW(entry);
      if (!shouldApply) {
        console.log(`[Sync] Conflicto LWW: Remoto es más reciente. Descartando op ${entry.operationKey}`);
        await markSkipped(entry.id, 'Descartado por Last-Write-Wins (remoto más reciente)');
        continue;
      }

      // 4. Ejecutar la operación
      try {
        // Extraemos los argumentos del payload.
        // Algunos repositorios esperan _offlineId para idempotencia
        let args: any[] = [];
        
        if (entry.operationKey === 'guardarCliente') {
          args = [entry.payload, entry.payload._offlineId];
        } else if (entry.operationKey === 'guardarPrestamo') {
          args = [entry.payload.datos, entry.payload.cuotas, entry.payload._offlineId];
        } else if (entry.operationKey === 'registrarPago') {
          args = [entry.payload, entry.payload._offlineId];
        } else if (entry.operationKey === 'actualizarEstadoPrestamo') {
          args = [entry.payload.id, entry.payload.estado];
        } else if (entry.operationKey === 'eliminarCliente' || entry.operationKey === 'eliminarPrestamo') {
          args = [entry.payload.id];
        } else if (entry.operationKey === 'eliminarPago') {
          args = [entry.payload.idPago];
        } else {
          // Para actualizaciones simples (actualizarCliente, actualizarCuota, etc)
          args = [entry.payload];
        }

        await fn(...args);

        // Éxito
        await markSynced(entry.id);
        successCount++;
        
      } catch (err: any) {
        // Manejar caso de duplicado (ej: intentó insertar algo que ya se subió)
        if (isDuplicateKeyError(err)) {
          console.log(`[Sync] Registro duplicado detectado. Asumiendo éxito previo para op ${entry.operationKey}`);
          await markSynced(entry.id);
          successCount++;
          continue;
        }

        console.error(`[Sync] Error al sincronizar op ${entry.operationKey}:`, err);
        
        // Si es un error de que el registro a actualizar/eliminar ya no existe
        if (err.message && err.message.includes('PGRST116')) {
           await markSkipped(entry.id, 'Registro ya no existe en el servidor');
           continue;
        }

        await markFailed(entry.id, err.message || 'Error desconocido');
        errorCount++;
      }
    } // fin for

    console.log(`[Sync] Finalizado. Éxitos: ${successCount}, Errores: ${errorCount}`);

  } catch (err) {
    console.error('[Sync] Error fatal en el motor de sincronización:', err);
  } finally {
    exitReplay();
    _isSyncing = false;
    window.dispatchEvent(new CustomEvent('sync-end'));
  }
}

// ── Inicializar listeners ─────────────────────────────────────

let _listenersInitialized = false;

export function initSyncManager() {
  if (_listenersInitialized) return;
  _listenersInitialized = true;

  // Escuchar cuando vuelve la conexión para sincronizar auto
  connectionMonitor.onChange((online) => {
    if (online) {
      // Pequeño delay para dejar que la red se estabilice
      setTimeout(() => {
        syncNow();
      }, 2000);
    }
  });

  // Escuchar cuando se encola una nueva operación
  // Si estamos online pero falló por un microcorte, intentamos syncNow pronto
  window.addEventListener('offline-operation-queued', () => {
    if (connectionMonitor.isOnline) {
      setTimeout(() => {
        syncNow();
      }, 5000);
    }
  });
}

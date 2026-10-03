// ============================================================
// COLA OFFLINE — IndexedDB
// Almacena operaciones pendientes de forma persistente.
// Los datos NUNCA se pierden: sobreviven recargas, cierres
// de pestaña y reinicios del dispositivo.
// ============================================================

const DB_NAME = 'prestamas_offline_queue';
const DB_VERSION = 1;
const STORE_NAME = 'operations';

// ── Tipos ─────────────────────────────────────────────────────

export interface QueueEntry {
  id: string;                       // UUID único de la operación
  timestamp: string;                // ISO 8601 con milisegundos — para LWW
  deviceId: string;                 // ID del dispositivo que originó la operación
  operationKey: string;             // Ej: 'guardarCliente', 'registrarPago'
  operationType: 'insert' | 'update' | 'delete';
  payload: any;                     // Argumentos originales de la función
  lwwTable?: string;                // Tabla para verificación LWW (solo updates)
  lwwKeyField?: string;             // Campo PK para LWW
  lwwKeyValue?: string;             // Valor PK para LWW
  status: 'pending' | 'syncing' | 'synced' | 'failed' | 'skipped';
  retryCount: number;
  lastError?: string;
  syncedAt?: string;
}

// ── Conexión a IndexedDB ──────────────────────────────────────

let _dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      _dbPromise = null;
      reject(new Error(`No se pudo abrir IndexedDB: ${request.error?.message}`));
    };

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_status', 'status', { unique: false });
        store.createIndex('by_timestamp', 'timestamp', { unique: false });
        store.createIndex('by_operation_key', 'operationKey', { unique: false });
      }
    };
  });

  return _dbPromise;
}

// ── Helpers internos ──────────────────────────────────────────

function wrapTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return getDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const req = operation(store);

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function wrapGetAll(
  operation: (store: IDBObjectStore) => IDBRequest<any[]>,
): Promise<QueueEntry[]> {
  return getDB().then(
    (db) =>
      new Promise<QueueEntry[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = operation(store);

        req.onsuccess = () => resolve(req.result as QueueEntry[]);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ── API Pública ───────────────────────────────────────────────

/** Agregar una operación a la cola. */
export async function addToQueue(entry: QueueEntry): Promise<void> {
  // Validación anti-datos vacíos: NUNCA guardar payloads nulos
  if (entry.payload === null || entry.payload === undefined) {
    throw new Error('PROTECCIÓN: Se intentó encolar una operación con payload nulo/vacío. Operación rechazada.');
  }

  await wrapTransaction('readwrite', (store) => store.put(entry));
}

/** Obtener TODAS las operaciones pendientes, ordenadas por timestamp. */
export async function getPendingOperations(): Promise<QueueEntry[]> {
  const all = await wrapGetAll((store) => {
    const index = store.index('by_status');
    return index.getAll('pending');
  });

  // Ordenar por timestamp (más antiguas primero)
  return all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** Obtener TODAS las operaciones (cualquier estado). */
export async function getAllOperations(): Promise<QueueEntry[]> {
  const all = await wrapGetAll((store) => store.getAll());
  return all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** Contar operaciones pendientes. */
export async function countPending(): Promise<number> {
  const pending = await getPendingOperations();
  return pending.length;
}

/** Marcar una operación como sincronizada. */
export async function markSynced(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result as QueueEntry | undefined;
      if (entry) {
        entry.status = 'synced';
        entry.syncedAt = new Date().toISOString();
        const putReq = store.put(entry);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      } else {
        resolve(); // Ya fue eliminada
      }
    };
    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

/** Marcar como fallida con mensaje de error. */
export async function markFailed(id: string, errorMessage: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result as QueueEntry | undefined;
      if (entry) {
        entry.status = 'failed';
        entry.lastError = errorMessage;
        entry.retryCount = (entry.retryCount || 0) + 1;
        const putReq = store.put(entry);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      } else {
        resolve();
      }
    };
    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

/** Marcar como 'syncing' (en proceso). */
export async function markSyncing(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result as QueueEntry | undefined;
      if (entry) {
        entry.status = 'syncing';
        const putReq = store.put(entry);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      } else {
        resolve();
      }
    };
    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

/** Marcar como 'skipped' (conflicto resuelto, el remoto era más reciente). */
export async function markSkipped(id: string, reason: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result as QueueEntry | undefined;
      if (entry) {
        entry.status = 'skipped';
        entry.lastError = reason;
        const putReq = store.put(entry);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      } else {
        resolve();
      }
    };
    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

/** Mover operaciones fallidas a pendientes para reintento. */
export async function retryFailedOperations(): Promise<number> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('by_status');

  return new Promise((resolve, reject) => {
    const req = index.getAll('failed');
    req.onsuccess = () => {
      const failed = req.result as QueueEntry[];
      let updated = 0;
      if (failed.length === 0) {
        resolve(0);
        return;
      }
      for (const entry of failed) {
        if (entry.retryCount < 10) { // Máximo 10 reintentos
          entry.status = 'pending';
          store.put(entry);
          updated++;
        }
      }
      tx.oncomplete = () => resolve(updated);
    };
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

/** Eliminar una operación de la cola. */
export async function removeFromQueue(id: string): Promise<void> {
  await wrapTransaction('readwrite', (store) => store.delete(id));
}

/** Limpiar operaciones ya sincronizadas (más de 24h). */
export async function cleanSyncedOperations(): Promise<number> {
  const all = await getAllOperations();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let cleaned = 0;

  for (const entry of all) {
    if (
      (entry.status === 'synced' || entry.status === 'skipped') &&
      entry.syncedAt &&
      entry.syncedAt < cutoff
    ) {
      await removeFromQueue(entry.id);
      cleaned++;
    }
  }

  return cleaned;
}

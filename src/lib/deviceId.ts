// ============================================================
// IDENTIFICADOR ÚNICO DE DISPOSITIVO
// Genera un UUID persistente por dispositivo/navegador.
// Se usa para rastrear el origen de las operaciones offline
// y resolver conflictos entre múltiples dispositivos.
// ============================================================

const STORAGE_KEY = 'prestamas_device_id';
let _cached: string | null = null;

/** Obtiene (o genera y persiste) el ID único de este dispositivo. */
export function getDeviceId(): string {
  if (_cached) return _cached;

  _cached = localStorage.getItem(STORAGE_KEY);

  if (!_cached) {
    _cached = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, _cached);
  }

  return _cached;
}

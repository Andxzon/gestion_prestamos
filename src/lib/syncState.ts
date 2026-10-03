// ============================================================
// ESTADO DE SINCRONIZACIÓN
// Controla si el motor de sincronización está re-ejecutando
// operaciones pendientes. Evita bucles infinitos:
//   replay → withOfflineProtection → encolar de nuevo → replay…
// ============================================================

let _replayDepth = 0;

/** ¿Estamos dentro de un replay del motor de sync? */
export function isReplaying(): boolean {
  return _replayDepth > 0;
}

/** Incrementar profundidad de replay (al iniciar replay). */
export function enterReplay(): void {
  _replayDepth++;
}

/** Decrementar profundidad de replay (al finalizar replay). */
export function exitReplay(): void {
  _replayDepth = Math.max(0, _replayDepth - 1);
}

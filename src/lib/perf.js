// ============================================================
// DIAGNOSTIC DE VITESSE — mesures gardées en mémoire (jamais envoyées),
// affichées dans Réglages → Diagnostic.
// ============================================================
const measures = { open: null, month: [], phrase: [] };

// Exécute cb après que le navigateur a réellement affiché l'écran.
export function afterPaint(cb) {
  requestAnimationFrame(() => setTimeout(cb, 0));
}

export function recordOpen() {
  if (measures.open !== null) return;
  afterPaint(() => { measures.open = Math.round(performance.now()); });
}

export function recordMonthChange(t0) {
  afterPaint(() => { push(measures.month, Math.round(performance.now() - t0)); });
}

// entry.networkMs = aller-retour serveur ; appMs = mise à jour de l'écran ensuite.
export function recordPhrase(entry, tNet) {
  if (tNet === undefined) { push(measures.phrase, entry); return; }
  afterPaint(() => { push(measures.phrase, { ...entry, appMs: Math.round(performance.now() - tNet) }); });
}

function push(arr, v) { arr.unshift(v); if (arr.length > 5) arr.pop(); }

export function getMeasures() { return measures; }

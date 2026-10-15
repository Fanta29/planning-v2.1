// ============================================================
// STOCKAGE — seul point de contact avec la persistance.
// Aujourd'hui : localStorage. En V3 : Supabase. Le reste de l'app
// ne doit jamais appeler localStorage directement.
// ============================================================
export const STORAGE_KEY = 'planning_state_v21';

export function loadState(defaultState) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultState, ...JSON.parse(raw) };
  } catch (e) {}
  return defaultState;
}

export function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

// ============================================================
// EXPORT / IMPORT (fichier JSON) — sauvegarde, et passage des données
// d'une adresse à une autre (production -> preview).
// ============================================================
const LISTS = ['categories', 'recurringRules', 'events', 'dayNotes', 'backgrounds'];

export function exportState(state, now = new Date()) {
  return JSON.stringify({
    app: 'planning',
    format: STORAGE_KEY,
    exportedAt: now.toISOString(),
    data: state,
  }, null, 2);
}

// Renvoie { state } si le fichier est valide, sinon { error } (message lisible).
// Accepte le format exporté ci-dessus, ou l'état brut tel que stocké.
export function parseImport(text, defaultState) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return { error: "Ce fichier n'est pas un fichier JSON valide." }; }
  const data = obj && obj.app === 'planning' && obj.data ? obj.data : obj;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: "Ce fichier ne contient pas de données Planning." };
  if (!LISTS.some(k => Array.isArray(data[k]))) return { error: "Ce fichier ne contient pas de données Planning." };
  for (const k of LISTS) {
    if (data[k] !== undefined && !Array.isArray(data[k])) return { error: `Fichier abîmé : « ${k} » devrait être une liste.` };
  }
  const state = { ...defaultState, ...data, settings: { ...defaultState.settings, ...(data.settings || {}) } };
  for (const k of LISTS) state[k] = Array.isArray(data[k]) ? data[k] : [];
  return { state };
}

// ============================================================
// JOURNAL — phrases passées par l'IA (pour enrichir le parser) et compteurs
// « compris sans IA ». Gardé sur l'appareil uniquement, séparé des données.
// ============================================================
const JOURNAL_KEY = 'planning_journal_v1';
const JOURNAL_MAX = 200;
export const EMPTY_JOURNAL = { stats: { parser: 0, missing: 0, ai: 0 }, entries: [] };

export function loadJournal() {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (raw) {
      const j = JSON.parse(raw);
      return { stats: { ...EMPTY_JOURNAL.stats, ...(j.stats || {}) }, entries: Array.isArray(j.entries) ? j.entries : [] };
    }
  } catch (e) {}
  return EMPTY_JOURNAL;
}

export function saveJournal(journal) {
  try { localStorage.setItem(JOURNAL_KEY, JSON.stringify({ ...journal, entries: journal.entries.slice(0, JOURNAL_MAX) })); } catch (e) {}
}

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

// ============================================================
// DATES — fonctions communes (dates locales, format AAAA-MM-JJ)
// ============================================================
export const pad = n => String(n).padStart(2, '0');
export function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function parseDate(s) { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); }
export function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
export const mondayIdx = d => (d.getDay() + 6) % 7;          // 0 = lundi … 6 = dimanche
export const uid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ============================================================
// PARSER NATIF — comprend une phrase sans IA, hors ligne.
//
// La phrase est découpée en « pièces » indépendantes de l'ordre des mots :
//   ACTION (ajouter, retirer, modifier), DATE (jour, plage, récurrence), HEURE,
//   COULEUR (teinte + nuance + cible), TYPE (travail / vacances / neutre), LIBELLÉ
//   (ce qui reste une fois les mots de remplissage retirés).
//
// interpret(texte, état, aujourdhui 'AAAA-MM-JJ') renvoie :
//   { status: 'ok',      intent, actions, summary }  → appliquer les actions
//   { status: 'missing', intent, message }           → dire ce qui manque, sans IA
//   { status: 'ai',      intent, reason }            → confier la phrase à l'IA
// ============================================================
import { fmtDate, parseDate, addDays, mondayIdx } from './dates.js';
import { daysBetween, ruleActiveOn } from './actions.js';

// ---------- normalisation ----------
export const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- vocabulaire ----------
const MONTHS = {
  janvier: 1, janv: 1, jan: 1, fevrier: 2, fevr: 2, fev: 2, mars: 3, avril: 4, avr: 4, mai: 5, juin: 6,
  juillet: 7, juil: 7, aout: 8, septembre: 9, sept: 9, sep: 9, octobre: 10, oct: 10,
  novembre: 11, nov: 11, decembre: 12, dec: 12,
};
const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const WEEKDAYS = { lundi: 0, mardi: 1, mercredi: 2, jeudi: 3, vendredi: 4, samedi: 5, dimanche: 6 };
const WEEKDAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

const VACATION_WORDS = ['vacances', 'vacance', 'vacs', 'vac', 'conges', 'conge', 'cp', 'repos'];

// Travail : exclusion automatique des fériés pour les récurrences.
// Garde et astreinte : du travail (comptées, masquées pendant les vacances) mais sous-type
// « garde » : les jours fériés ne sont PAS exclus (il y a des gardes les jours fériés).
// Permanence et rotation restent des événements ordinaires.
const GARDE_WORDS = ['garde', 'gardes', 'astreinte', 'astreintes'];
const WORK_WORDS = [
  'travail', 'travailler', 'taf', 'taffer', 'boulot', 'bosser', 'job', 'taffe', 'work', 'working',
  'stage', 'internat', 'externat', 'consultation', 'consult', 'rdv pro', 'rendez-vous pro',
  'reunion', 'meeting', 'briefing', 'presentation', 'formation', 'seminaire', 'conf', 'conference',
  'cours', 'td', 'tp', 'examen', 'partiel', 'oral', 'soutenance', 'mission', 'contrat', 'prestation',
  'mandat', 'deplacement pro', 'voyage pro', 'deplacement professionnel', 'business trip', 'had',
  'rcp', 'staff', 'visite', 'tournee', 'vacation pro', 'seance', 'atelier pro',
];
const STAGE_WORDS = ['stage', 'internat', 'externat'];
// « cours de sport » est un loisir, pas du travail
const LEISURE_WORDS = ['sport', 'foot', 'football', 'yoga', 'danse', 'musique', 'piano', 'guitare', 'tennis',
  'natation', 'piscine', 'gym', 'muscu', 'boxe', 'escalade', 'running', 'cuisine', 'theatre', 'dessin',
  'peinture', 'chant', 'equitation', 'pilates', 'judo', 'karate'];

// Couleurs vives (pastille). Nuances calculées : pastel, clair, foncé.
const COLORS = {
  rouge: '#FF3B30', vert: '#34C759', bleu: '#007AFF', jaune: '#FFCC00', orange: '#FF9500',
  violet: '#8B00FF', mauve: '#A29BFE', rose: '#FF69B4', turquoise: '#40E0D0', bordeaux: '#800020',
  kaki: '#728C00', beige: '#C8AD7F', gris: '#8E8E93', marron: '#8B4513', noir: '#000000', blanc: '#FFFFFF',
  cyan: '#00BFFF', indigo: '#4B0082', fuchsia: '#FF00FF', magenta: '#FF00FF', lilas: '#C8A2C8',
  prune: '#8E4585', corail: '#FF6F61', saumon: '#FA8072', olive: '#808000', emeraude: '#50C878',
  or: '#FFD700', dore: '#FFD700', moutarde: '#D4A017', ocre: '#CC7722', framboise: '#C72C48',
  cerise: '#DE3163', lavande: '#B57EDC', menthe: '#3EB489', chocolat: '#7B3F00', taupe: '#483C32',
  anthracite: '#383E42', ardoise: '#708090', peche: '#FFB07C', abricot: '#FBA055', citron: '#FFF44F',
  aubergine: '#614051', pourpre: '#800080', carmin: '#960018', brique: '#A03A2E', marine: '#000080',
  sable: '#E0C9A6', camel: '#C19A6B', argent: '#C0C0C0',
};
// « bleu marine », « vert pomme »… : teinte de base + précision
const COMPOUND = {
  'bleu marine': '#000080', 'bleu ciel': '#1E90FF', 'bleu nuit': '#191970', 'bleu roi': '#4169E1',
  'bleu canard': '#048B9A', 'bleu petrole': '#1D5C63', 'bleu electrique': '#2C75FF',
  'vert pomme': '#8DB600', 'vert sapin': '#0B6623', 'vert olive': '#808000', 'vert menthe': '#3EB489',
  'vert emeraude': '#50C878', 'vert kaki': '#728C00', 'vert foret': '#228B22',
  'rose fuchsia': '#FF00FF', 'rose bonbon': '#F9429E', 'rouge brique': '#A03A2E', 'rouge bordeaux': '#800020',
  'jaune moutarde': '#D4A017', 'jaune citron': '#FFF44F',
};
const COLOR_FORMS = { verte: 'vert', bleue: 'bleu', violette: 'violet', grise: 'gris', blanche: 'blanc', noire: 'noir', doree: 'dore' };
const SHADES = { pastel: 'pastel', pastels: 'pastel', clair: 'clair', claire: 'clair', clairs: 'clair', claires: 'clair',
  fonce: 'fonce', foncee: 'fonce', fonces: 'fonce', foncees: 'fonce' };

const REMOVE_VERBS = ['retire', 'retirer', 'retires', 'supprime', 'supprimer', 'supprimes', 'enleve', 'enlever',
  'enleves', 'efface', 'effacer', 'annule', 'annuler', 'vire', 'virer'];
const MOVE_VERBS = ['decale', 'decaler', 'deplace', 'deplacer', 'bouge', 'bouger'];
const RENAME_VERBS = ['renomme', 'renommer'];
const CHANGE_VERBS = ['change', 'changer', 'modifie', 'modifier', 'mets', 'met', 'mettre', 'passe', 'passer'];
const ADD_VERBS = ['ajoute', 'ajouter', 'rajoute', 'rajouter', 'cree', 'creer', 'programme', 'planifie', 'prevois'];

// Mots de remplissage retirés du libellé
const FILLERS = new Set(['je', "j'", "j'ai", 'ai', 'moi', 'me', "m'", 'mets-moi', 'met-moi', 'finalement', 'prevu',
  'prevue', 'prevus', 'prevues', 'le', 'la', 'les', "l'", 'un', 'une', 'des', 'du', 'de', "d'", 'au', 'aux', 'a',
  'en', 'pour', 'et', 'il', 'y', "y'a", 'svp', 'stp', 'aussi', 'encore', 'alors', 'bon', 'ok', 'donc', 'mon', 'ma',
  'mes', 'ce', 'cet', 'cette', 'couleur', 'case', 'cases', 'jai', 'tout', 'nouveau', 'nouvelle']);
// Mots toujours retirés, même au milieu du libellé
const ALWAYS_DROP = new Set(["j'ai", 'jai', 'finalement', 'prevu', 'prevue', 'prevus', 'prevues', 'svp', 'stp']);

// Mots qui changent le sens d'une manière que le parser ne gère pas → IA
const AI_WORDS = new Set(['paire', 'paires', 'pairs', 'impaire', 'impaires', 'impairs',
  'ou', 'puis', 'ensuite', 'entre', 'avant', 'apres', 'si', 'quand', 'lorsque', 'sinon', 'alternance', 'chaque']);

const NUMBER_WORDS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 };

// Mots qui peuvent être corrigés s'ils sont mal tapés (jamais ceux de 3 lettres ou moins)
const CORRECTABLE = [
  ...Object.keys(MONTHS).filter(w => w.length >= 4), ...Object.keys(WEEKDAYS), ...Object.keys(WEEKDAYS).map(w => w + 's'),
  'vacances', 'vacance', 'conges', ...REMOVE_VERBS, ...MOVE_VERBS, ...RENAME_VERBS, ...ADD_VERBS,
  ...Object.keys(COLORS).filter(w => w.length >= 4), 'pastel', 'demain', 'semaine', 'semaines', 'prochain', 'prochaine',
];
// Vrais mots courts proches d'un mot du vocabulaire : ne jamais les « corriger »
const NEVER_CORRECT = new Set(['vers', 'mais', 'sous', 'sans', 'avec', 'chez', 'dans', 'pour', 'tout', 'tous', 'mars',
  'roue', 'vert', 'vers', 'nord', 'mois', 'jour', 'jours', 'fois', 'gris', 'rose', 'mardi', 'lundi', 'moins', 'plus',
  'match', 'merci', 'demi', 'menu', 'mauvais', 'rouges', 'rousse', 'sauce', 'bleus', 'cours', 'court', 'avion']);

// ---------- outils ----------
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

function mix(hex, target, t) {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  const tg = target === 'white' ? 255 : 0;
  return '#' + c.map(v => Math.round(v + (tg - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function colorHex(base, shade, target) {
  if (target === 'cell') return shade === 'fonce' ? mix(base, 'white', 0.55) : mix(base, 'white', 0.8);
  if (shade === 'pastel') return mix(base, 'white', 0.65);
  if (shade === 'clair') return mix(base, 'white', 0.4);
  if (shade === 'fonce') return mix(base, 'black', 0.35);
  return base;
}

const dateOk = (y, m, d) => { const x = new Date(y, m - 1, d); return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d; };
const ymd = (y, m, d) => fmtDate(new Date(y, m - 1, d));

// ---------- découpage ----------
function tokenize(text) {
  const t = text.replace(/[’`]/g, "'")
    .replace(/\b([ljmdtsnc]|qu)'(?=\p{L})/giu, "$1' ")   // l'internat → l' internat
    .replace(/[,;!?]/g, ' ')
    .replace(/(\d)\s*-\s*(\d)/g, '$1-$2');
  return t.split(/\s+/).filter(Boolean).map(raw => {
    const clean = raw.replace(/^[("«]+|[)".»:]+$/g, '');
    return { raw: clean, n: norm(clean), used: false };
  }).filter(tok => tok.raw);
}

// ============================================================
// ANALYSE
// ============================================================
// « sauf » et ses équivalents : la phrase est coupée en deux, la partie après le mot
// donne les exceptions (dates, période, jours de la semaine, week-end).
const WEEKEND_WORDS = ['week-end', 'week-ends', 'weekend', 'weekends', 'we', 'w-e', 'wk', 'wkd'];
function findExceptWord(toks) {
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i].n, nx = toks[i + 1]?.n, nx2 = toks[i + 2]?.n;
    if (w === 'sauf' || w === 'hormis' || /^excepte[es]{0,2}$/.test(w)) return { at: i, len: 1 };
    if (w === 'mis' && nx === 'a' && nx2 === 'part') return { at: i, len: 3 };
    if (w === 'a' && nx === 'part') return { at: i, len: 2 };
    if (w === 'en' && nx === 'dehors' && ['de', 'du', "d'", 'des'].includes(nx2)) return { at: i, len: 2 };
  }
  return null;
}

export function parsePhrase(text, todayStr) {
  const toks = tokenize(text);
  const ex = findExceptWord(toks);
  if (!ex) return parseMain(text, todayStr);
  const main = toks.slice(0, ex.at).map(t => t.raw).join(' ');
  const rest = toks.slice(ex.at + ex.len).map(t => t.raw).join(' ');
  const intent = parseMain(main, todayStr);
  intent.except = parseExcept(rest, todayStr);
  return intent;
}

// Partie « sauf … » : jours de la semaine (« le mercredi », « le week-end ») et/ou dates
function parseExcept(text, todayStr) {
  const toks = tokenize(text);
  const weekdays = new Set();
  const rest = [];
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i].n;
    if (WEEKEND_WORDS.includes(w)) { weekdays.add(5); weekdays.add(6); continue; }
    const base = w.endsWith('s') && w.slice(0, -1) in WEEKDAYS ? w.slice(0, -1) : w;
    if (base in WEEKDAYS) { weekdays.add(WEEKDAYS[base]); continue; }
    rest.push(toks[i].raw);
  }
  const r = rest.length ? parseMain(rest.join(' '), todayStr) : null;
  const items = !r || !r.date ? [] : r.date.type === 'multiple' ? r.date.items : [r.date];
  const dates = [];
  for (const it of items) {
    if (it.type === 'single') dates.push(it.date);
    else if (it.type === 'range') {
      for (let d = parseDate(it.start); fmtDate(d) <= it.end; d = addDays(d, 1)) dates.push(fmtDate(d));
    }
  }
  return { weekdays: [...weekdays].sort(), dates: [...new Set(dates)].sort(), empty: !weekdays.size && !dates.length };
}

function parseMain(text, todayStr) {
  const today = parseDate(todayStr);
  const toks = tokenize(text);
  const intent = {
    action: 'add', date: null, time: null, color: null, label: null, kind: 'neutral', subkind: null,
    confidence: 'high', missing: [], change: null, vacationOf: null, aiReason: null,
  };
  const at = i => toks[i] && !toks[i].used ? toks[i].n : null;
  const use = (...idx) => idx.forEach(i => { if (toks[i]) toks[i].used = true; });
  const dateSpecs = [];

  // --- 0. fautes de frappe (mots de 4 lettres ou plus, vocabulaire connu uniquement) ---
  for (const tok of toks) {
    const w = tok.n;
    if (w.length < 4 || NEVER_CORRECT.has(w) || /\d/.test(w)) continue;
    if (CORRECTABLE.includes(w) || COLORS[w] || COLOR_FORMS[w] || SHADES[w] || FILLERS.has(w)) continue;
    const max = w.length >= 8 ? 2 : 1;
    let best = null, bestD = max + 1;
    for (const v of CORRECTABLE) {
      const dd = editDistance(w, v, max);
      if (dd < bestD) { best = v; bestD = dd; }
    }
    if (best && bestD <= max) { tok.n = best; tok.corrected = true; intent.confidence = 'medium'; }
  }

  // --- 1. heures ---
  const timeOf = w => {
    let m = /^(\d{1,2})(?:h|:)(\d{2})?$/.exec(w);
    if (!m) m = /^(\d{1,2})h(\d{2})?$/.exec(w);
    if (!m) return null;
    const h = +m[1], mi = m[2] ? +m[2] : 0;
    if (h > 23 || mi > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  };
  for (let i = 0; i < toks.length; i++) {
    const w = at(i);
    if (!w) continue;
    let m = /^(\d{1,2}h\d{0,2})-(\d{1,2}h\d{0,2})$/.exec(w);
    if (m && timeOf(m[1]) && timeOf(m[2])) { intent.time = { start: timeOf(m[1]), end: timeOf(m[2]) }; use(i); continue; }
    const t = timeOf(w);
    if (!t) continue;
    use(i);
    intent.time = { start: t };
    if ((at(i - 1) === 'a' || at(i - 1) === 'vers' || at(i - 1) === 'de' || at(i - 1) === 'des')) use(i - 1);
    // « de 9h à 12h », « 9h - 12h »
    if ((at(i + 1) === 'a' || at(i + 1) === '-' || at(i + 1) === 'jusqu\'a') && at(i + 2) && timeOf(at(i + 2))) {
      intent.time.end = timeOf(at(i + 2)); use(i + 1, i + 2);
    }
  }

  // --- 2. dates ---
  // Lit une date à la position i : 07/10, 07/10/2027, 7 juillet, 1er août 2027. Renvoie {d,m,y,len}.
  const readDate = (i, allowBareDay = false) => {
    const w = at(i);
    if (!w) return null;
    let m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(w);
    if (m) {
      let y = m[3] ? +m[3] : null;
      if (y !== null && y < 100) y += 2000;
      return { d: +m[1], m: +m[2], y, len: 1 };
    }
    m = /^(\d{1,2})(er)?$/.exec(w);
    if (m && +m[1] >= 1 && +m[1] <= 31) {
      const mon = at(i + 1) && MONTHS[at(i + 1)];
      if (mon) {
        const yr = at(i + 2) && /^\d{4}$/.test(at(i + 2)) ? +at(i + 2) : null;
        return { d: +m[1], m: mon, y: yr, len: yr ? 3 : 2 };
      }
      if (allowBareDay) return { d: +m[1], m: null, y: null, len: 1 };
    }
    return null;
  };

  // 2a. plages « du X au Y »
  for (let i = 0; i < toks.length; i++) {
    if (at(i) !== 'du' && at(i) !== 'depuis') continue;
    const a = readDate(i + 1, true);
    if (!a) continue;
    const j = i + 1 + a.len;
    const sep = at(j);
    if (!['au', 'u', 'a', "jusqu'au", 'jusqua', '-'].includes(sep)) continue;
    const b = readDate(j + 1);
    if (!b) continue;
    if (a.m === null) a.m = b.m;
    if (sep === 'u') intent.confidence = 'medium';
    use(i, ...Array.from({ length: a.len }, (_, k) => i + 1 + k), j, ...Array.from({ length: b.len }, (_, k) => j + 1 + k));
    dateSpecs.push({ type: 'range', a, b, pos: i });
  }

  // 2b. jours de la semaine
  const weekdayOf = w => {
    if (!w) return null;
    if (w in WEEKDAYS) return { wd: WEEKDAYS[w], plural: false };
    if (w.endsWith('s') && w.slice(0, -1) in WEEKDAYS) return { wd: WEEKDAYS[w.slice(0, -1)], plural: true };
    return null;
  };
  const recurringDays = [];
  for (let i = 0; i < toks.length; i++) {
    const w = at(i);
    if (!w) continue;
    // « tous les jours », « chaque jour »
    if ((w === 'jours' && at(i - 1) === 'les' && at(i - 2) === 'tous') || (w === 'jour' && at(i - 1) === 'chaque')) {
      recurringDays.push(0, 1, 2, 3, 4, 5, 6);
      use(i, i - 1); if (w === 'jours') use(i - 2);
      continue;
    }
    // « en semaine »
    if (w === 'semaine' && at(i - 1) === 'en' && at(i + 1) !== 'prochaine') { recurringDays.push(0, 1, 2, 3, 4); use(i, i - 1); continue; }
    // « tous les week-ends », « les week-ends », « chaque week-end »
    if (WEEKEND_WORDS.includes(w) && (/s$/.test(w) || at(i - 1) === 'chaque' || (at(i - 1) === 'les'))) {
      recurringDays.push(5, 6);
      use(i); if (at(i - 1) === 'les' || at(i - 1) === 'chaque') use(i - 1); if (at(i - 2) === 'tous') use(i - 2);
      continue;
    }
    // « du lundi au vendredi », « de lundi à vendredi »
    if ((w === 'du' || w === 'de') && weekdayOf(at(i + 1)) && ['au', 'a'].includes(at(i + 2)) && weekdayOf(at(i + 3))) {
      const a = weekdayOf(at(i + 1)).wd, b = weekdayOf(at(i + 3)).wd;
      for (let d = a; ; d = (d + 1) % 7) { recurringDays.push(d); if (d === b) break; }
      use(i, i + 1, i + 2, i + 3);
      if (at(i - 1) === 'jours' && at(i - 2) === 'les' && at(i - 3) === 'tous') use(i - 1, i - 2, i - 3);
      continue;
    }
  }
  for (let i = 0; i < toks.length; i++) {
    const wk = weekdayOf(at(i));
    if (!wk) continue;
    const before = at(i - 1), before2 = at(i - 2);
    const isRec = wk.plural || before === 'chaque' || (before === 'les' && before2 === 'tous') || before === 'les';
    if (isRec) {
      recurringDays.push(wk.wd);
      use(i);
      if (before === 'les' || before === 'chaque') use(i - 1);
      if (before === 'les' && before2 === 'tous') use(i - 2);
      if (before === 'et' && recurringDays.length > 1) use(i - 1);
      continue;
    }
    // jour seul : un seul événement, le prochain (aujourd'hui inclus) ; « lundi prochain » : strictement après
    const next = at(i + 1) === 'prochain' || at(i + 1) === 'prochaine';
    let delta = (wk.wd - mondayIdx(today) + 7) % 7;
    if (next && delta === 0) delta = 7;
    use(i);
    if (next) use(i + 1);
    if (before === 'ce') use(i - 1);
    // « décale le foot au jeudi » : on garde aussi le jour visé
    dateSpecs.push({ type: 'single', date: fmtDate(addDays(today, delta)), weekday: wk.wd, pos: i });
  }
  // « les lundis et jeudis » : « et » entre deux jours récurrents
  if (recurringDays.length) {
    toks.forEach((t, i) => { if (!t.used && t.n === 'et' && toks[i - 1]?.used && weekdayOf(toks[i + 1]?.n)?.plural) t.used = true; });
  }

  // 2c. dates relatives
  for (let i = 0; i < toks.length; i++) {
    const w = at(i);
    if (!w) continue;
    if (w === "aujourd'hui" || w === 'aujourdhui' || w === 'auj' || w === 'ajd') { use(i); dateSpecs.push({ type: 'single', date: todayStr }); continue; }
    if (w === 'demain') { use(i); dateSpecs.push({ type: 'single', date: fmtDate(addDays(today, 1)) }); continue; }
    if (w === 'apres-demain' || (w === 'apres' && at(i + 1) === 'demain')) {
      use(i); if (w === 'apres') use(i + 1);
      dateSpecs.push({ type: 'single', date: fmtDate(addDays(today, 2)) }); continue;
    }
    if (['week-end', 'weekend', 'we', 'w-e'].includes(w)) {
      const wd = mondayIdx(today);
      const sat = wd === 6 ? today : addDays(today, (5 - wd + 7) % 7);
      use(i); if (at(i - 1) === 'ce') use(i - 1);
      dateSpecs.push({ type: 'range', start: fmtDate(sat), end: fmtDate(wd === 6 ? today : addDays(sat, 1)) }); continue;
    }
    if (w === 'semaine' && (at(i + 1) === 'prochaine')) {
      const mon = addDays(today, 7 - mondayIdx(today));
      use(i, i + 1); if (at(i - 1) === 'la') use(i - 1);
      dateSpecs.push({ type: 'range', start: fmtDate(mon), end: fmtDate(addDays(mon, 6)) }); continue;
    }
    if (w === 'dans') {
      const nRaw = at(i + 1);
      const n = nRaw && (/^\d+$/.test(nRaw) ? +nRaw : NUMBER_WORDS[nRaw]);
      const unit = at(i + 2);
      if (n && unit) {
        let d = null;
        if (/^jours?$/.test(unit)) d = addDays(today, n);
        else if (/^semaines?$/.test(unit)) d = addDays(today, 7 * n);
        else if (unit === 'mois') { d = new Date(today); d.setMonth(d.getMonth() + n); }
        if (d) { use(i, i + 1, i + 2); dateSpecs.push({ type: 'single', date: fmtDate(d) }); continue; }
      }
    }
  }

  // 2d. dates simples restantes (« le 07/10 », « 10 août », « 09/10/2027 »)
  for (let i = 0; i < toks.length; i++) {
    const dt = readDate(i);
    if (!dt) continue;
    use(...Array.from({ length: dt.len }, (_, k) => i + k));
    if (at(i - 1) === 'le' || at(i - 1) === 'pour') use(i - 1);
    dateSpecs.push({ type: 'single', raw: dt, pos: i });
  }
  // Jours sans mois dans une énumération : « les 28 mai, 4, 10 et 11 juin », « le 12 et le 13 »
  for (let i = 0; i < toks.length; i++) {
    const w = at(i);
    const m = w && /^(\d{1,2})(er)?$/.exec(w);
    if (!m || +m[1] < 1 || +m[1] > 31) continue;
    const prev = toks[i - 1];
    const prevOk = prev && (['le', 'les', 'et'].includes(prev.n) || (prev.used && (/^\d/.test(prev.n) || MONTHS[prev.n])));
    if (!prevOk) continue;
    use(i);
    if (prev && !prev.used && (prev.n === 'le' || prev.n === 'les')) prev.used = true;
    // mois : celui de la date explicite suivante, sinon de la précédente, sinon aucun
    const withMonth = dateSpecs.filter(sp => sp.raw && sp.raw.m);
    const nextSp = withMonth.filter(sp => sp.pos > i).sort((a, b) => a.pos - b.pos)[0];
    const prevSp = withMonth.filter(sp => sp.pos < i).sort((a, b) => b.pos - a.pos)[0];
    const ref = nextSp || prevSp;
    dateSpecs.push({ type: 'single', raw: { d: +m[1], m: ref ? ref.raw.m : null, y: ref ? ref.raw.y : null }, pos: i });
  }
  // « inscription le » : un « le » final sans date
  if (at(toks.length - 1) === 'le') use(toks.length - 1);

  // --- 3. couleur ---
  const colors = [];
  for (let i = 0; i < toks.length; i++) {
    let w = at(i);
    if (!w) continue;
    let base = COLORS[w] ? w : COLOR_FORMS[w] || (w.endsWith('s') && (COLORS[w.slice(0, -1)] ? w.slice(0, -1) : COLOR_FORMS[w.slice(0, -1)])) || null;
    if (!base || !COLORS[base]) continue;
    // « or » est un mot courant : seulement après « en »
    if (base === 'or' && at(i - 1) !== 'en') continue;
    let hex = COLORS[base], len = 1;
    const comp = at(i + 1) && COMPOUND[`${base} ${at(i + 1)}`];
    if (comp) { hex = comp; len = 2; }
    let shade = null;
    const after = at(i + len);
    if (after && SHADES[after]) { shade = SHADES[after]; len++; }
    use(...Array.from({ length: len }, (_, k) => i + k));
    // cible : « fond », « en fond », « fond de case », « cases vertes »
    let target = 'pill';
    for (let k = Math.max(0, i - 4); k <= Math.min(toks.length - 1, i + len + 2); k++) {
      if (!toks[k].used && ['fond', 'case', 'cases'].includes(toks[k].n)) { target = 'cell'; toks[k].used = true; }
    }
    if (target === 'cell') toks.forEach((t, k) => { if (!t.used && t.n === 'de' && ['fond', 'case'].includes(toks[k - 1]?.n) ) t.used = true; });
    if (at(i - 1) === 'en') use(i - 1);
    colors.push({ name: base, shade, target, hex: colorHex(hex, shade, target) });
  }
  if (colors.length > 1) {
    const targets = new Set(colors.map(c => c.target));
    if (targets.size < colors.length) intent.aiReason = 'deux couleurs';
  }
  // garde la pastille comme couleur principale, le fond en complément
  intent.color = colors.find(c => c.target === 'pill') || colors[0] || null;
  intent.cellColor = colors.length > 1 ? colors.find(c => c.target === 'cell') : null;

  // --- 4. verbes d'action ---
  let verb = null;
  for (let i = 0; i < toks.length; i++) {
    const w = at(i);
    if (!w) continue;
    const base = w.replace(/-moi$/, '');
    if (REMOVE_VERBS.includes(base)) verb = verb && verb !== 'remove' ? 'conflict' : 'remove';
    else if (MOVE_VERBS.includes(base)) verb = verb && verb !== 'move' ? 'conflict' : 'move';
    else if (RENAME_VERBS.includes(base)) verb = 'rename';
    else if (CHANGE_VERBS.includes(base)) { if (!verb) verb = 'change'; }
    else if (ADD_VERBS.includes(base)) { if (!verb) verb = 'add'; }
    else continue;
    use(i);
  }
  // « pas de foot le 23/10 », « pas d'astreinte samedi » : retirer cette occurrence
  for (let i = 0; i < toks.length; i++) {
    if (at(i) === 'pas' && (at(i + 1) === 'de' || at(i + 1) === "d'")) { verb = verb && verb !== 'remove' ? 'conflict' : 'remove'; use(i, i + 1); }
  }
  if (verb === 'conflict') intent.aiReason = 'actions contradictoires';

  // --- 5. vacances, « X en vacances », moi ---
  let vacationIdx = -1, enVacances = false;
  for (let i = 0; i < toks.length; i++) {
    if (at(i) && VACATION_WORDS.includes(at(i))) {
      vacationIdx = i; use(i);
      if (at(i - 1) === 'en') { use(i - 1); enVacances = true; }   // « X en vacances »
    }
  }
  // « vas » (3 lettres) jamais corrigé seul ; mais « retire les vas … du X au Y » : contexte = vacances
  const hasMoi = toks.some(t => t.n === 'moi' || /-moi$/.test(t.n));

  // --- 6. libellé : ce qui reste, sans les mots de remplissage ---
  const segments = [];
  let cur = [];
  for (const t of toks) {
    if (t.used) { if (cur.length) segments.push(cur); cur = []; continue; }
    cur.push(t);
  }
  if (cur.length) segments.push(cur);
  const words = [];
  for (let seg of segments) {
    seg = seg.filter(t => !ALWAYS_DROP.has(t.n) && t.n !== 'moi' && !/-moi$/.test(t.n));
    while (seg.length && FILLERS.has(seg[0].n)) seg = seg.slice(1);
    while (seg.length && FILLERS.has(seg[seg.length - 1].n)) seg = seg.slice(0, -1);
    words.push(...seg);
  }
  intent.label = words.length ? words.map(t => t.raw).join(' ') : null;
  const leftover = words.map(t => t.n);

  // --- 7. type ---
  if (vacationIdx >= 0) intent.kind = 'vacation';
  const labelN = ` ${leftover.join(' ')} `;
  if (intent.kind !== 'vacation' && intent.label) {
    const isWork = WORK_WORDS.some(w => labelN.includes(` ${w} `));
    const isLeisure = LEISURE_WORDS.some(w => labelN.includes(` ${w} `));
    if (GARDE_WORDS.some(w => labelN.includes(` ${w} `))) {
      intent.kind = 'work';
      intent.subkind = 'garde';
    } else if (isWork && !isLeisure) {
      intent.kind = 'work';
      intent.subkind = STAGE_WORDS.some(w => labelN.includes(` ${w} `)) ? 'stage' : 'regular';
    }
  }
  if (intent.kind === 'vacation' && intent.label && enVacances && !hasMoi) {
    // « Montalvo en vacances » : la personne / catégorie nommée est suspendue
    intent.vacationOf = intent.label;
  }

  // --- 8. mots non gérés qui changent le sens → IA ---
  const aiWord = leftover.find(w => AI_WORDS.has(w));
  if (aiWord) intent.aiReason = `mot « ${aiWord} »`;
  if (/\bsur (deux|2|trois|3)\b/.test(leftover.join(' ')) || toks.some((t, i) => t.n === 'sur' && /^(deux|2|trois|3)$/.test(toks[i + 1]?.n || ''))) intent.aiReason = 'fréquence (un sur deux)';
  if (words.length > 8) intent.aiReason = 'phrase longue';

  // --- 9. résolution des dates (années) ---
  const resolved = resolveDates(dateSpecs, recurringDays, today, verb === 'remove');
  if (resolved.error) intent.aiReason = resolved.error;
  intent.date = resolved.date;
  intent._candidates = resolved.candidates;
  intent._weekday = dateSpecs.find(s => s.weekday !== undefined)?.weekday;

  // --- 10. action ---
  if (verb === 'remove') intent.action = 'remove';
  else if (verb === 'move') { intent.action = 'modify'; intent.change = { type: 'move' }; }
  else if (verb === 'rename') { intent.action = 'modify'; intent.change = { type: 'rename' }; }
  else if (intent.color && !intent.date && (verb === 'change' || leftover.length === 0 || toks.some(t => t.n === 'couleur'))) {
    if (verb === 'change' || toks.some(t => t.n === 'couleur')) { intent.action = 'modify'; intent.change = { type: 'color' }; }
  }
  intent._verb = verb;
  intent._hasMoi = hasMoi;
  return intent;
}

// Années : date sans année = prochaine occurrence (aujourd'hui inclus). Plage : celle dont
// la fin n'est pas encore passée. Pour une suppression, toutes les années proches sont
// proposées (l'événement existant tranchera).
function resolveDates(specs, recurringDays, today, isRemove) {
  const todayStr = fmtDate(today);
  const y0 = today.getFullYear();
  const singleOf = (raw, y) => (dateOk(y, raw.m, raw.d) ? ymd(y, raw.m, raw.d) : null);
  const nextSingle = raw => {
    if (raw.y) return { date: singleOf(raw, raw.y), candidates: [singleOf(raw, raw.y)] };
    const cands = [y0, y0 + 1, y0 - 1].map(y => singleOf(raw, y)).filter(Boolean);
    const next = cands.slice(0, 2).find(d => d >= todayStr) || cands[0];
    return { date: next, candidates: cands };
  };
  const rangeOf = (a, b) => {
    const build = y => {
      const ya = a.y || y;
      let yb = b.y || ya;
      if (!b.y && (b.m < a.m || (b.m === a.m && b.d < a.d))) yb = ya + 1;
      const s = dateOk(ya, a.m, a.d) ? ymd(ya, a.m, a.d) : null;
      const e = dateOk(yb, b.m, b.d) ? ymd(yb, b.m, b.d) : null;
      return s && e ? { start: s, end: e } : null;
    };
    if (a.y || b.y) { const r = build(a.y || b.y); return { range: r, candidates: [r] }; }
    const cands = [y0, y0 + 1, y0 - 1].map(build).filter(Boolean);
    const next = cands.slice(0, 2).find(r => r.end >= todayStr) || cands[0];
    return { range: next, candidates: cands };
  };

  // Jour sans mois (« le 12 ») : prochaine occurrence de ce jour du mois, aujourd'hui inclus
  const nextDayOfMonth = d => {
    for (let k = 0; k < 13; k++) {
      const x = new Date(y0, today.getMonth() + k, 1);
      if (dateOk(x.getFullYear(), x.getMonth() + 1, d)) {
        const s = ymd(x.getFullYear(), x.getMonth() + 1, d);
        if (s >= todayStr) return s;
      }
    }
    return null;
  };
  const singles = specs.filter(s => s.type === 'single').sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
  const ranges = specs.filter(s => s.type === 'range');
  if (!recurringDays.length && singles.length + ranges.length > 1) {
    const items = [...singles, ...ranges].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0)).map(sp => {
      if (sp.type === 'range') return sp.start ? { type: 'range', start: sp.start, end: sp.end } : (r => r && { type: 'range', ...r })(rangeOf(sp.a, sp.b).range);
      if (sp.date) return { type: 'single', date: sp.date };
      const d = sp.raw.m ? nextSingle(sp.raw).date : nextDayOfMonth(sp.raw.d);
      return d && { type: 'single', date: d };
    });
    if (items.some(x => !x)) return { error: 'date invalide', date: null };
    return { date: { type: 'multiple', items } };
  }

  if (recurringDays.length) {
    const date = { type: 'recurring', weekdays: [...new Set(recurringDays)].sort() };
    if (ranges[0]) {
      const r = ranges[0].a ? rangeOf(ranges[0].a, ranges[0].b).range : ranges[0];
      if (r) { date.start = r.start; date.end = r.end; }
    }
    if (singles.length) return { error: 'récurrence et date', date };
    return { date };
  }
  if (ranges[0]) {
    if (ranges[0].start) return { date: { type: 'range', start: ranges[0].start, end: ranges[0].end } };
    const r = rangeOf(ranges[0].a, ranges[0].b);
    if (!r.range) return { error: 'date invalide', date: null };
    return { date: { type: 'range', ...r.range }, candidates: isRemove ? r.candidates.map(c => ({ type: 'range', ...c })) : null };
  }
  if (singles[0]) {
    if (singles[0].date) return { date: { type: 'single', date: singles[0].date } };
    if (!singles[0].raw.m) {
      const d = nextDayOfMonth(singles[0].raw.d);
      return d ? { date: { type: 'single', date: d } } : { error: 'date invalide', date: null };
    }
    const s = nextSingle(singles[0].raw);
    if (!s.date) return { error: 'date invalide', date: null };
    return { date: { type: 'single', date: s.date }, candidates: isRemove ? s.candidates.map(d => ({ type: 'single', date: d })) : null };
  }
  return { date: null };
}

// ============================================================
// INTERPRÉTATION : intention + état → actions, ou message
// ============================================================
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
function frDate(s) {
  const d = parseDate(s);
  return `${WEEKDAY_NAMES[mondayIdx(d)]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
}
export function describeDate(date) {
  if (!date) return '';
  if (date.type === 'single') return frDate(date.date);
  if (date.type === 'range') return `du ${frDate(date.start)} au ${frDate(date.end)}`;
  if (date.type === 'multiple') return date.items.map(describeDate).join(', ').replace(/, ([^,]*)$/, ' et $1');
  const w = date.weekdays.join(',');
  const days = w === '0,1,2,3,4,5,6' ? 'tous les jours' : w === '0,1,2,3,4' ? 'en semaine (du lundi au vendredi)'
    : w === '5,6' ? 'chaque week-end'
    : 'chaque ' + date.weekdays.map(x => WEEKDAY_NAMES[x]).join(', ').replace(/, ([^,]*)$/, ' et $1');
  return days + (date.start ? ` du ${frDate(date.start)} au ${frDate(date.end)}` : '');
}
const colorLabel = c => c ? `${c.target === 'cell' ? 'fond ' : ''}${c.name}${c.shade ? ' ' + ({ fonce: 'foncé' }[c.shade] || c.shade) : ''}` : '';

// « Foot garde sa couleur verte » : nom de la couleur la plus proche, accordé au féminin
const FEMININE = { vert: 'verte', bleu: 'bleue', violet: 'violette', gris: 'grise', blanc: 'blanche', noir: 'noire', dore: 'dorée' };
// Pastels déjà utilisés par l'IA dans les données existantes (ancien prompt)
const KNOWN_PASTELS = {
  '#FFE5E5': 'rouge pastel', '#FFE5C5': 'orange pastel', '#FFD8C7': 'saumon pastel', '#FFD5C5': 'pêche pastel',
  '#FFF9C5': 'jaune pastel', '#FFFFC5': 'citron pastel', '#FFF5D5': 'crème', '#F5F0DC': 'vanille',
  '#D5F5D5': 'vert pastel', '#C5F5D5': 'menthe pastel', '#C5E5D5': "vert d'eau", '#C5F5F5': 'turquoise pastel',
  '#D5E5FF': 'bleu pastel', '#C5DEFF': 'bleu ciel pastel', '#E5DEFF': 'lavande pastel', '#E5D5FF': 'violet pastel',
  '#DCC5FF': 'mauve pastel', '#E5D8F5': 'lilas pastel', '#FFD5E5': 'rose pastel', '#F8D5DC': 'rose poudré',
  '#FFCCDD': 'rose bonbon pastel', '#E5E5EA': 'gris pastel', '#F0E5D0': 'beige pastel',
};
export function colorName(hex) {
  if (!hex) return null;
  if (KNOWN_PASTELS[hex.toUpperCase()]) return KNOWN_PASTELS[hex.toUpperCase()];
  const rgb = h => [0, 2, 4].map(i => parseInt(h.replace('#', '').slice(i, i + 2), 16));
  const [r, g, b] = rgb(hex);
  let best = null, bestD = Infinity;
  for (const [name, h] of Object.entries(COLORS)) {
    if (name === 'magenta' || name === 'dore') continue;
    const [r2, g2, b2] = rgb(h);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bestD) { best = name; bestD = d; }
  }
  // couleur très claire (fond pastel) : on cherche la teinte d'origine
  if (Math.min(r, g, b) > 190 && bestD > 0) {
    for (const [name, h] of Object.entries(COLORS)) {
      if (name === 'blanc') continue;
      const p = rgb(mix(h, 'white', 0.8));
      const d = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
      if (d < bestD) { best = name + ' pastel'; bestD = d; }
    }
  }
  const [base, extra] = best.split(' ');
  return (FEMININE[base] || base) + (extra ? ' ' + extra : '');
}
function keepsColor(cat) {
  if (cat.pillColor) return `garde sa couleur ${colorName(cat.pillColor)}`;
  if (cat.cellColor) return `garde sa couleur de fond ${colorName(cat.cellColor)}`;
  return 'garde sa couleur actuelle';
}

function findCategory(state, label) {
  if (!label) return null;
  const n = norm(label).trim();
  const cats = state.categories || [];
  return cats.find(c => norm(c.name).trim() === n)
    || cats.find(c => norm(c.name).startsWith(n + ' ') || n.startsWith(norm(c.name) + ' '))
    || null;
}
const overlaps = (e, start, end) => (e.endDate || e.startDate) >= start && e.startDate <= end;
const itemsOf = date => !date ? [] : date.type === 'multiple' ? date.items : [date];
const startOf = d => d.start || d.date;
const endOf = d => d.end || d.date;
// Le type (catégorie) a-t-il une occurrence sur la période : événement ou règle ?
function occurs(state, ids, start, end) {
  if ((state.events || []).some(e => ids.includes(e.categoryId) && overlaps(e, start, end))) return true;
  const rules = (state.recurringRules || []).filter(r => ids.includes(r.categoryId));
  if (!rules.length) return false;
  return daysBetween(start, end).some(ds => rules.some(r => ruleActiveOn(r, ds) && !(r.exceptions || []).includes(ds)));
}
// Période moins des jours exclus → sous-périodes
function splitRange(start, end, excluded) {
  const out = [];
  let cur = null;
  for (const ds of daysBetween(start, end)) {
    if (excluded(ds)) { if (cur) { out.push(cur); cur = null; } continue; }
    if (!cur) cur = { start: ds, end: ds }; else cur.end = ds;
  }
  if (cur) out.push(cur);
  return out;
}
const sameDays = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export function interpret(text, state, todayStr) {
  const intent = parsePhrase(text || '', todayStr);
  const out = (status, extra) => ({ status, intent, ...extra });
  if (intent.aiReason) return out('ai', { reason: intent.aiReason });

  // Note : « note pour le 10 juin : appeler le secrétariat »
  const noteM = /^\s*(?:ajoute\s+(?:une\s+)?)?note\s+(?:pour\s+)?(.+?)\s*:\s*(.+)$/i.exec(text || '');
  if (noteM) {
    const d = parsePhrase(noteM[1], todayStr).date;
    if (d && d.type === 'single') {
      intent.action = 'note';
      return out('ok', { actions: [{ type: 'add_note', date: d.date, text: noteM[2].trim() }], summary: `Note ajoutée : ${frDate(d.date)}` });
    }
  }

  // « sauf » sans rien derrière : on demande
  if (intent.except && intent.except.empty) return out('missing', { message: 'Sauf quand ?' });

  const { color, label, kind } = intent;
  const vacCat = (state.categories || []).find(c => c.kind === 'vacation');

  // ---------- SUPPRESSION (dont « pas de foot le 23/10 ») ----------
  if (intent.action === 'remove') {
    let target = null, targetKind = null;
    const date = intent.date;
    if (kind === 'vacation') targetKind = 'vacation';
    else {
      target = findCategory(state, label);
      // « retire les vas prévues du … au … » : mot court inconnu + vacances existantes sur la période
      if (!target && label && date && date.type !== 'recurring' && vacCat) {
        const short = norm(label).split(' ').find(w => w.length <= 3 && VACATION_WORDS.some(v => editDistance(w, v, 1) <= 1));
        const cands = intent._candidates || [date];
        const hit = cands.find(c => (state.events || []).some(e => e.categoryId === vacCat.id && overlaps(e, startOf(c), endOf(c))));
        if (short && hit) { targetKind = 'vacation'; intent.kind = 'vacation'; intent.confidence = 'medium'; if (hit !== date) intent.date = hit; }
      }
    }
    if (!target && !targetKind) {
      if (!label) return out('missing', { message: 'Que faut-il retirer ?' });
      return out('ai', { reason: 'cible de suppression inconnue' });
    }
    const ids = targetKind ? (state.categories || []).filter(c => c.kind === targetKind).map(c => c.id) : [target.id];
    const name = targetKind ? 'vacances' : target.name;
    if (!intent.date) {
      if (target) return out('ok', { actions: [{ type: 'delete_category', name: target.name }], summary: `Supprimé : ${target.name} (tout)` });
      return out('missing', { message: 'Quelles dates retirer ?' });
    }
    if (intent.date.type === 'recurring') return out('ai', { reason: 'suppression récurrente' });
    // année : celle où une occurrence existe (événement ou règle)
    let items;
    if (intent.date.type === 'multiple') items = intent.date.items;
    else {
      // Autre année seulement pour retrouver un événement existant ; une règle : prochaine occurrence
      const cands = intent._candidates || [intent.date];
      const evHit = cands.find(c => (state.events || []).some(e => ids.includes(e.categoryId) && overlaps(e, startOf(c), endOf(c))));
      items = [evHit || intent.date];
      intent.date = items[0];
    }
    const found = items.filter(it => occurs(state, ids, startOf(it), endOf(it)));
    if (!found.length) {
      const d = items.length === 1 ? describeDate(items[0]) : describeDate(intent.date);
      return out('missing', { message: `Il n'y a pas de ${name} ${d.startsWith('du ') ? d : 'le ' + d} : rien n'a été retiré.` });
    }
    const actions = found.map(it => targetKind
      ? { type: 'remove_range', kind: targetKind, start: startOf(it), end: endOf(it) }
      : { type: 'remove_range', categoryName: target.name, start: startOf(it), end: endOf(it) });
    return out('ok', { actions, summary: `Retiré : ${name}, ${describeDate(found.length === 1 ? found[0] : { type: 'multiple', items: found })}` });
  }

  // ---------- MODIFICATION ----------
  if (intent.action === 'modify') {
    const date = intent.date;
    const cat = findCategory(state, label);
    if (!label) return out('missing', { message: 'Quel événement modifier ?' });
    if (!cat) return out('missing', { message: `Je ne trouve pas « ${label} ».` });
    if (intent.change.type === 'color') {
      // Pas de changement de couleur d'un type pour l'instant (idée pour plus tard)
      return out('missing', { message: `Changer une couleur n'est pas encore possible : ${cat.name} ${keepsColor(cat)}.` });
    }
    if (intent.change.type === 'move') {
      if (!date || date.type !== 'single') return out('missing', { message: `Quand déplacer « ${cat.name} » ?` });
      const rules = (state.recurringRules || []).filter(r => r.categoryId === cat.id);
      if (rules.length === 1 && intent._weekday !== undefined) {
        return out('ok', { actions: [{ type: 'move_rule', ruleId: rules[0].id, weekdays: [intent._weekday] }], summary: `Déplacé : ${cat.name}, chaque ${WEEKDAY_NAMES[intent._weekday]}` });
      }
      const nextEv = (state.events || []).filter(e => e.categoryId === cat.id && (e.endDate || e.startDate) >= todayStr)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
      if (nextEv) return out('ok', { actions: [{ type: 'move_event', eventId: nextEv.id, date: date.date }], summary: `Déplacé : ${cat.name} au ${frDate(date.date)}` });
      return out('ai', { reason: 'déplacement ambigu' });
    }
    return out('ai', { reason: 'renommage' });
  }

  // ---------- « X en vacances » : exceptions à la règle de X ----------
  if (intent.vacationOf) {
    const date = intent.date;
    const cat = findCategory(state, intent.vacationOf);
    if (!cat) {
      return out('missing', { message: `Je ne connais pas « ${intent.vacationOf} ». S'il s'agit de vos vacances, écrivez « vacances ${date ? describeDate(date) : 'du … au …'} ».` });
    }
    const hasRules = (state.recurringRules || []).some(r => r.categoryId === cat.id);
    if (!hasRules) {
      return out('missing', { message: `« ${cat.name} » n'a pas de jours récurrents à suspendre : rien n'a été retiré. Pour retirer ses événements, écrivez « retire ${cat.name} ${date ? describeDate(date) : 'du … au …'} ».` });
    }
    if (!date) return out('missing', { message: `Quelles dates pour « ${cat.name} » en vacances ?` });
    const actions = itemsOf(date).map(it => ({ type: 'add_exceptions_to_category', categoryName: cat.name, start: startOf(it), end: endOf(it) }));
    return out('ok', { actions, summary: `${cat.name} suspendu ${describeDate(date)}` });
  }

  // ---------- AJOUT ----------
  let date = intent.date;
  // Fond de case seul (« en fond vert les lundis ») : ni catégorie, ni pastille
  const backgroundOnly = !label && kind !== 'vacation' && color && color.target === 'cell';
  // Libellé optionnel : vacances, ou fond de case
  const labelOptional = kind === 'vacation' || backgroundOnly;
  if (!label && !labelOptional) intent.missing.push('evenement');
  if (!date) intent.missing.push('date');
  if (intent.missing.length) {
    let message;
    if (intent.missing.length === 2) message = 'Quel événement et quelle date ?';
    else if (intent.missing[0] === 'evenement') message = `Quel événement ${describeDate(date)} ?`;
    else message = kind === 'vacation' ? 'Quelles dates pour les vacances ?' : `Quelle date pour « ${label} » ?`;
    return out('missing', { message });
  }

  // Exceptions (« sauf … ») appliquées à la date
  const ex = intent.except;
  let ruleExceptions = [];
  if (ex) {
    if (date.type === 'recurring') {
      const weekdays = date.weekdays.filter(w => !ex.weekdays.includes(w));
      if (!weekdays.length) return out('missing', { message: 'Plus aucun jour ne reste : quels jours garder ?' });
      date = { ...date, weekdays };
      ruleExceptions = ex.dates;
    } else if (date.type === 'range') {
      const parts = splitRange(date.start, date.end, ds => ex.dates.includes(ds) || ex.weekdays.includes((parseDate(ds).getDay() + 6) % 7));
      if (!parts.length) return out('missing', { message: 'Il ne reste aucun jour : quelles dates garder ?' });
      date = parts.length === 1 ? { type: 'range', ...parts[0] } : { type: 'multiple', items: parts.map(p => ({ type: 'range', ...p })) };
    } else {
      return out('ai', { reason: 'exception sur une date simple' });
    }
    intent.date = date;
  }

  if (backgroundOnly) {
    const a = { type: 'add_background', color: color.hex };
    if (date.type === 'recurring') {
      a.weekdays = date.weekdays;
      if (date.start) { a.startDate = date.start; a.endDate = date.end; }
      if (ruleExceptions.length) a.exceptions = ruleExceptions;
      return out('ok', { actions: [a], summary: `Fond ${color.name}${color.shade ? ' ' + color.shade : ''} : ${describeDate(date)}` });
    }
    const actions = itemsOf(date).map(it => ({ type: 'add_background', color: color.hex, startDate: startOf(it), endDate: endOf(it) }));
    return out('ok', { actions, summary: `Fond ${color.name}${color.shade ? ' ' + color.shade : ''} : ${describeDate(date)}` });
  }

  const actions = [];
  let catName;
  // Type existant : il garde sa couleur d'origine ; une couleur donnée ne vaut que pour cet événement
  const existingCat = kind === 'vacation' ? vacCat : findCategory(state, label);
  const own = {};
  if (existingCat) {
    catName = existingCat.name;
    if (color) own[color.target === 'cell' ? 'cellColor' : 'pillColor'] = color.hex;
  } else if (kind === 'vacation') {
    catName = 'vacances';
    const cell = color && color.target === 'cell' ? color.hex : (color ? null : '#FFE5E5');
    const pill = color && color.target === 'pill' ? color.hex : null;
    actions.push({ type: 'create_category', name: catName, pillColor: pill, cellColor: cell, kind: 'vacation', subkind: null });
  } else {
    catName = label;
    const pill = color && color.target === 'pill' ? color.hex : (color ? null : '#007AFF');
    const cell = color && color.target === 'cell' ? color.hex : (intent.cellColor ? intent.cellColor.hex : null);
    actions.push({ type: 'create_category', name: catName, pillColor: pill, cellColor: cell, kind, subkind: intent.subkind });
  }

  // Heure : pas encore de champ dédié dans les données → ajoutée au libellé des événements ponctuels
  const hm = t => t.replace(/^0(\d)/, '$1').replace(':00', 'h').replace(':', 'h');   // 09:00 → 9h, 14:30 → 14h30
  const timeTxt = intent.time ? ' ' + hm(intent.time.start) + (intent.time.end ? '-' + hm(intent.time.end) : '') : '';
  const evLabel = (kind === 'vacation' ? (label || 'Vacances') : (label || catName)) + timeTxt;

  if (date.type === 'recurring') {
    // « foot tous les vendredis sauf le 23/10 » alors que la règle existe : on lui ajoute l'exception
    const sameRule = existingCat && ruleExceptions.length && !color && (state.recurringRules || []).find(r =>
      r.categoryId === existingCat.id && sameDays([...(r.weekdays || [])].sort(), date.weekdays) &&
      (r.startDate || null) === (date.start || null) && (r.endDate || null) === (date.end || null));
    if (sameRule) {
      return out('ok', { actions: [{ type: 'add_rule_exceptions', ruleId: sameRule.id, dates: ruleExceptions }],
        summary: `Exception ajoutée : ${catName}, ${ruleExceptions.length === 1 ? 'le ' + frDate(ruleExceptions[0]) : ruleExceptions.length + ' jours'}` });
    }
    const a = { type: 'add_recurring', categoryName: catName, weekdays: date.weekdays };
    if (date.start) { a.startDate = date.start; a.endDate = date.end; }
    if (ruleExceptions.length) a.exceptions = ruleExceptions;
    Object.assign(a, own);
    actions.push(a);
  } else {
    for (const it of itemsOf(date)) {
      actions.push({ type: 'add_event', categoryName: catName, label: evLabel, startDate: startOf(it), endDate: endOf(it), ...own });
    }
  }
  const parts = [kind === 'vacation' ? (label ? `vacances (${label})` : 'vacances') : label, describeDate(date)];
  if (intent.time) parts.push(timeTxt.trim());
  if (color) parts.push(existingCat ? `${colorLabel(color)} (cet événement seulement)` : colorLabel(color));
  if (ruleExceptions.length) parts.push(`sauf ${ruleExceptions.length === 1 ? 'le ' + frDate(ruleExceptions[0]) : ruleExceptions.length + ' jours'}`);
  return out('ok', { actions, summary: `Ajouté : ${parts.join(', ')}` });
}

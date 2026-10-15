// ============================================================
// APPLICATION DES ACTIONS — fonction pure : (état, actions) → nouvel état.
// Utilisée pour les actions du parser natif comme pour celles de l'IA.
// ============================================================
import { fmtDate, parseDate, addDays, uid } from './dates.js';

// Tous les jours entre deux dates incluses (plafonné à 2 ans)
export function daysBetween(start, end) {
  const out = [];
  const it = parseDate(start), last = parseDate(end);
  while (it <= last && out.length < 731) { out.push(fmtDate(it)); it.setDate(it.getDate() + 1); }
  return out;
}
// La règle tombe-t-elle ce jour-là (jours de semaine, bornes) ?
export function ruleActiveOn(r, ds) {
  if (r.startDate && ds < r.startDate) return false;
  if (r.endDate && ds > r.endDate) return false;
  if (r.weekdays && !r.weekdays.includes((parseDate(ds).getDay() + 6) % 7)) return false;
  return true;
}

export function applyActions(state, actions) {
  let s = {
    ...state,
    categories: state.categories.map(c => ({ ...c })),   // copies : « Annuler » doit retrouver l'ancien état intact
    recurringRules: state.recurringRules.map(r => ({ ...r, exceptions: [...(r.exceptions || [])] })),
    events: state.events.map(e => ({ ...e })),
    backgrounds: (state.backgrounds || []).map(b => ({ ...b })),
    dayNotes: [...state.dayNotes],
  };
  let changed = false;
  const norm = str => (str || '').toLowerCase().trim();
  const findCat = (name) => s.categories.find(c => norm(c.name) === norm(name));

  for (const a of actions || []) {
    switch (a.type) {
      case 'create_category': {
        const existing = findCat(a.name);
        // Décision : la couleur d'une catégorie existante ne change jamais
        if (existing) {
          if (a.kind !== undefined) existing.kind = a.kind;
          if (a.subkind !== undefined) existing.subkind = a.subkind;
        } else {
          s.categories.push({
            id: uid('cat'),
            name: a.name,
            pillColor: a.pillColor || null,
            cellColor: a.cellColor || null,
            kind: a.kind || 'neutral',
            subkind: a.subkind || null,
          });
        }
        changed = true;
        break;
      }
      case 'update_category': {
        const cat = findCat(a.name);
        if (cat) {   // couleurs ignorées : pas de changement de couleur pour l'instant
          if (a.kind !== undefined) cat.kind = a.kind;
          if (a.subkind !== undefined) cat.subkind = a.subkind;
          if (a.newName !== undefined) cat.name = a.newName;
          changed = true;
        }
        break;
      }
      case 'delete_category': {
        const cat = findCat(a.name);
        if (cat) {
          s.categories = s.categories.filter(c => c.id !== cat.id);
          s.recurringRules = s.recurringRules.filter(r => r.categoryId !== cat.id);
          s.events = s.events.filter(e => e.categoryId !== cat.id);
          changed = true;
        }
        break;
      }
      case 'add_recurring': {
        const cat = findCat(a.categoryName);
        if (cat) {
          const rule = {
            id: uid('rule'),
            categoryId: cat.id,
            weekdays: a.weekdays || [],
            startDate: a.startDate || null,
            endDate: a.endDate || null,
            exceptions: a.exceptions || [],
          };
          // Couleur propre à cette règle (le type garde sa couleur d'origine)
          if (a.pillColor) rule.pillColor = a.pillColor;
          if (a.cellColor) rule.cellColor = a.cellColor;
          s.recurringRules.push(rule);
          changed = true;
        }
        break;
      }
      case 'add_exceptions_to_category': {
        const cat = findCat(a.categoryName);
        if (cat) {
          const start = parseDate(a.start);
          const end = parseDate(a.end);
          const exceptions = [];
          const it = new Date(start);
          while (it <= end) { exceptions.push(fmtDate(it)); it.setDate(it.getDate() + 1); }
          const rules = s.recurringRules.filter(r => r.categoryId === cat.id);
          for (const r of rules) {
            for (const ex of exceptions) {
              if (!r.exceptions.includes(ex)) r.exceptions.push(ex);
            }
          }
          if (rules.length > 0) changed = true;
        }
        break;
      }
      case 'remove_recurring': {
        const cat = findCat(a.categoryName);
        if (cat) {
          const before = s.recurringRules.length;
          s.recurringRules = s.recurringRules.filter(r => r.categoryId !== cat.id);
          if (s.recurringRules.length !== before) changed = true;
        }
        break;
      }
      case 'add_event': {
        let cat = findCat(a.categoryName);
        if (!cat) {
          cat = {
            id: uid('cat'),
            name: a.categoryName || 'Sans catégorie',
            pillColor: '#007AFF',
            cellColor: null,
            kind: 'neutral',
            subkind: null,
          };
          s.categories.push(cat);
        }
        const ev = {
          id: uid('evt'),
          categoryId: cat.id,
          label: a.label || a.categoryName,
          startDate: a.startDate,
          endDate: a.endDate || a.startDate,
        };
        // Couleur propre à cet événement (le type garde sa couleur d'origine)
        if (a.pillColor) ev.pillColor = a.pillColor;
        if (a.cellColor) ev.cellColor = a.cellColor;
        s.events.push(ev);
        changed = true;
        break;
      }
      case 'remove_event': {
        const before = s.events.length;
        if (a.date) {
          s.events = s.events.filter(e => !(
            norm(e.label).includes(norm(a.label)) &&
            a.date >= e.startDate && a.date <= (e.endDate || e.startDate)
          ));
        } else {
          s.events = s.events.filter(e => !norm(e.label).includes(norm(a.label)));
        }
        if (s.events.length !== before) changed = true;
        break;
      }
      case 'add_note': {
        s.dayNotes.push({ id: uid('note'), date: a.date, text: a.text });
        changed = true;
        break;
      }
      case 'remove_note': {
        const before = s.dayNotes.length;
        s.dayNotes = s.dayNotes.filter(n => n.date !== a.date);
        if (s.dayNotes.length !== before) changed = true;
        break;
      }
      // Retire les jours [start, end] des événements visés (catégorie nommée, ou toutes les
      // catégories d'un type, ex. vacances) : événement inclus supprimé, débordant raccourci,
      // englobant coupé en deux.
      case 'remove_range': {
        const targetIds = new Set(s.categories
          .filter(c => (a.categoryName ? norm(c.name) === norm(a.categoryName) : c.kind === a.kind))
          .map(c => c.id));
        const out = [];
        for (const e of s.events) {
          const eEnd = e.endDate || e.startDate;
          if (!targetIds.has(e.categoryId) || eEnd < a.start || e.startDate > a.end) { out.push(e); continue; }
          changed = true;
          if (e.startDate < a.start) out.push({ ...e, endDate: fmtDate(addDays(parseDate(a.start), -1)) });
          if (eEnd > a.end) out.push({ ...e, id: e.startDate < a.start ? uid('evt') : e.id, startDate: fmtDate(addDays(parseDate(a.end), 1)), endDate: eEnd });
        }
        s.events = out;
        // Règles récurrentes du même type : les jours concernés deviennent des exceptions
        // (« pas de foot le 23/10 » retire cette seule occurrence, la règle reste)
        for (const r of s.recurringRules) {
          if (!targetIds.has(r.categoryId)) continue;
          for (const ds of daysBetween(a.start, a.end)) {
            if (ruleActiveOn(r, ds) && !r.exceptions.includes(ds)) { r.exceptions.push(ds); changed = true; }
          }
        }
        break;
      }
      // Ajoute des dates d'exception à une règle existante (« … sauf le 23/10 »)
      case 'add_rule_exceptions': {
        const r = s.recurringRules.find(x => x.id === a.ruleId);
        if (r) {
          for (const ds of a.dates || []) if (!r.exceptions.includes(ds)) { r.exceptions.push(ds); changed = true; }
          r.exceptions.sort();
        }
        break;
      }
      // Change les jours d'une règle récurrente (ex. « décale le foot au jeudi »)
      case 'move_rule': {
        const r = s.recurringRules.find(x => x.id === a.ruleId);
        if (r) { r.weekdays = a.weekdays; changed = true; }
        break;
      }
      // Déplace un événement ponctuel à une autre date (même durée)
      case 'move_event': {
        const e = s.events.find(x => x.id === a.eventId);
        if (e) {
          const len = Math.round((parseDate(e.endDate || e.startDate) - parseDate(e.startDate)) / 864e5);
          e.startDate = a.date;
          e.endDate = fmtDate(addDays(parseDate(a.date), len));
          changed = true;
        }
        break;
      }
      // Fond de case (ni catégorie, ni pastille) : jours de semaine et/ou période
      case 'add_background': {
        s.backgrounds.push({
          id: uid('bg'), color: a.color, weekdays: a.weekdays || null,
          startDate: a.startDate || null, endDate: a.endDate || null, exceptions: [],
        });
        changed = true;
        break;
      }
      case 'update_settings': {
        s.settings = { ...s.settings };
        if (a.vacationPeriod !== undefined) s.settings.vacationPeriod = a.vacationPeriod;
        if (a.theme !== undefined) s.settings.theme = a.theme;
        changed = true;
        break;
      }
    }
  }
  return { newState: s, changed };
}


// Tests du parser natif, écrits à partir des phrases réelles de l'utilisateur.
// Date de référence FIXE : jeudi 15 octobre 2026. Les dates relatives et les dates
// sans année donnent donc toujours le même résultat attendu.
import { describe, it, expect } from 'vitest';
import { interpret } from './parser.js';
import { applyActions } from './actions.js';

const TODAY = '2026-10-15'; // jeudi

const VIDE = { categories: [], recurringRules: [], events: [], dayNotes: [], settings: { vacationPeriod: 'civil', theme: 'auto' } };

// État « habituel » : foot (vert, vendredis), vacances (20 → 25/10), Montalvo (stage, lun-ven), stage
const ETAT = {
  categories: [
    { id: 'c_foot', name: 'foot', pillColor: '#34C759', cellColor: null, kind: 'neutral', subkind: null },
    { id: 'c_vac', name: 'vacances', pillColor: null, cellColor: '#FFE5E5', kind: 'vacation', subkind: null },
    { id: 'c_mont', name: 'Montalvo', pillColor: '#A29BFE', cellColor: null, kind: 'work', subkind: 'stage' },
    { id: 'c_stage', name: 'stage', pillColor: '#FF3B30', cellColor: null, kind: 'work', subkind: 'stage' },
  ],
  recurringRules: [
    { id: 'r_foot', categoryId: 'c_foot', weekdays: [4], startDate: null, endDate: null, exceptions: [] },
    { id: 'r_mont', categoryId: 'c_mont', weekdays: [0, 1, 2, 3, 4], startDate: '2026-09-01', endDate: null, exceptions: [] },
  ],
  events: [
    { id: 'e_vac', categoryId: 'c_vac', label: 'Vacances', startDate: '2026-10-20', endDate: '2026-10-25' },
  ],
  dayNotes: [],
  settings: { vacationPeriod: 'civil', theme: 'auto' },
};

const run = (text, state = VIDE) => interpret(text, state, TODAY);

// ------------------------------------------------------------
describe('date seule : il manque l\'événement (pas d\'IA)', () => {
  const cas = [
    ['le 10 aout', '2027-08-10'],
    ['le 10 août', '2027-08-10'],
    ['le 07/01', '2027-01-07'],
    ['10 juillet', '2027-07-10'],
    ['Le 10 juillet', '2027-07-10'],
    ['07 juillet', '2027-07-07'],
    ['09/10/2027', '2027-10-09'],
  ];
  for (const [phrase, date] of cas) {
    it(phrase, () => {
      const r = run(phrase);
      expect(r.status).toBe('missing');
      expect(r.intent.date).toEqual({ type: 'single', date });
      expect(r.intent.missing).toEqual(['evenement']);
      expect(r.message).toMatch(/Quel événement/);
    });
  }
  it('du 01/11 au 03/11', () => {
    const r = run('du 01/11 au 03/11');
    expect(r.status).toBe('missing');
    expect(r.intent.date).toEqual({ type: 'range', start: '2026-11-01', end: '2026-11-03' });
    expect(r.intent.missing).toEqual(['evenement']);
  });
});

// ------------------------------------------------------------
describe('mot seul ou couleur seule : message de ce qui manque (pas d\'IA)', () => {
  for (const phrase of ['vacance', 'VACANCES', 'VACS', 'congés']) {
    it(phrase, () => {
      const r = run(phrase);
      expect(r.status).toBe('missing');
      expect(r.intent.kind).toBe('vacation');
      expect(r.intent.missing).toEqual(['date']);
      expect(r.message).toMatch(/Quelles dates/);
    });
  }
  for (const phrase of ['rouge', 'en rouge']) {
    it(phrase, () => {
      const r = run(phrase);
      expect(r.status).toBe('missing');
      expect(r.intent.color).toMatchObject({ hex: '#FF3B30', target: 'pill' });
      expect(r.intent.missing).toEqual(['evenement', 'date']);
    });
  }
  it('inscription le', () => {
    const r = run('inscription le');
    expect(r.status).toBe('missing');
    expect(r.intent.label).toBe('inscription');
    expect(r.intent.missing).toEqual(['date']);
    expect(r.message).toMatch(/Quelle date/);
  });
  it('stage chez X en vert (pas de catégorie « stage chez X »)', () => {
    const r = run('stage chez X en vert');
    expect(r.status).toBe('missing');
    expect(r.intent.label).toBe('stage chez X');
    expect(r.intent.color).toMatchObject({ hex: '#34C759', target: 'pill' });
    expect(r.intent.missing).toEqual(['date']);
  });
  it('vert pastel', () => {
    const r = run('vert pastel');
    expect(r.status).toBe('missing');
    expect(r.intent.color).toMatchObject({ name: 'vert', shade: 'pastel', target: 'pill' });
  });
  it('jaune pastel', () => {
    const r = run('jaune pastel');
    expect(r.intent.color).toMatchObject({ name: 'jaune', shade: 'pastel', target: 'pill' });
  });
  it('fond orange', () => {
    const r = run('fond orange');
    expect(r.status).toBe('missing');
    expect(r.intent.color).toMatchObject({ name: 'orange', target: 'cell' });
  });
});

// ------------------------------------------------------------
describe('ajouts complets', () => {
  it('Rouge 07/10 stage chez X → 07/10/2027 (le 07/10/2026 est passé), rouge, travail', () => {
    const r = run('Rouge 07/10 stage chez X');
    expect(r.status).toBe('ok');
    expect(r.intent).toMatchObject({
      action: 'add', date: { type: 'single', date: '2027-10-07' },
      color: { hex: '#FF3B30', target: 'pill' }, label: 'stage chez X', kind: 'work',
    });
  });

  it('VERT les mercredis du 7 juillet u 09/09 cours de sport → bornes respectées, neutre', () => {
    const r = run('VERT les mercredis du 7 juillet u 09/09 cours de sport');
    expect(r.status).toBe('ok');
    expect(r.intent).toMatchObject({
      action: 'add',
      date: { type: 'recurring', weekdays: [2], start: '2027-07-07', end: '2027-09-09' },
      color: { hex: '#34C759', target: 'pill' }, label: 'cours de sport', kind: 'neutral',
    });
    expect(r.intent.confidence).toBe('medium'); // « u » corrigé en « au »
  });

  for (const phrase of ['tous les vendredis j\'ai foot', 'foot tous les vendredis']) {
    it(`${phrase} → chaque vendredi sans fin, couleur existante de foot`, () => {
      const r = run(phrase, ETAT);
      expect(r.status).toBe('ok');
      expect(r.intent).toMatchObject({ action: 'add', label: 'foot', kind: 'neutral', date: { type: 'recurring', weekdays: [4] } });
      expect(r.intent.date.end).toBeUndefined();
      expect(r.actions).toEqual([{ type: 'add_recurring', categoryName: 'foot', weekdays: [4] }]);
    });
  }
  it('foot tous les vendredis (catégorie inexistante) → couleur par défaut', () => {
    const r = run('foot tous les vendredis');
    expect(r.actions[0]).toMatchObject({ type: 'create_category', name: 'foot', pillColor: '#007AFF', kind: 'neutral' });
  });

  it('vacances du 07/10 au 06/11 → plage en cours (fin pas encore passée)', () => {
    const r = run('vacances du 07/10 au 06/11');
    expect(r.status).toBe('ok');
    expect(r.intent).toMatchObject({ action: 'add', kind: 'vacation', date: { type: 'range', start: '2026-10-07', end: '2026-11-06' } });
  });
  it('vacs du 20/12 au 05/01 → fin l\'année suivante', () => {
    const r = run('vacs du 20/12 au 05/01');
    expect(r.intent).toMatchObject({ kind: 'vacation', date: { type: 'range', start: '2026-12-20', end: '2027-01-05' } });
  });
  it('du 20/12 au 05/01 vacances', () => {
    const r = run('du 20/12 au 05/01 vacances');
    expect(r.intent).toMatchObject({ kind: 'vacation', date: { type: 'range', start: '2026-12-20', end: '2027-01-05' } });
  });
  it('vacances été du 1 au 15 août → vacances avec libellé « été »', () => {
    const r = run('vacances été du 1 au 15 août');
    expect(r.status).toBe('ok');
    expect(r.intent).toMatchObject({ kind: 'vacation', label: 'été', date: { type: 'range', start: '2027-08-01', end: '2027-08-15' } });
  });
  it('vacanes du 02/11 au 06/11 → faute tolérée', () => {
    const r = run('vacanes du 02/11 au 06/11');
    expect(r.status).toBe('ok');
    expect(r.intent).toMatchObject({ kind: 'vacation', confidence: 'medium' });
  });

  it('en bleu finale LDC le 10/06', () => {
    const r = run('en bleu finale LDC le 10/06');
    expect(r.status).toBe('ok');
    expect(r.intent).toMatchObject({
      action: 'add', date: { type: 'single', date: '2027-06-10' },
      color: { hex: '#007AFF', target: 'pill' }, label: 'finale LDC', kind: 'neutral',
    });
  });

  it('mets moi en vacances du 02/11 au 06/11', () => {
    const r = run('mets moi en vacances du 02/11 au 06/11', ETAT);
    expect(r.status).toBe('ok');
    expect(r.intent).toMatchObject({ action: 'add', kind: 'vacation', date: { type: 'range', start: '2026-11-02', end: '2026-11-06' } });
    expect(r.actions.find(a => a.type === 'add_event')).toMatchObject({ categoryName: 'vacances', startDate: '2026-11-02', endDate: '2026-11-06' });
  });
  it('mets moi en vacs le 30/10', () => {
    const r = run('mets moi en vacs le 30/10');
    expect(r.intent).toMatchObject({ kind: 'vacation', date: { type: 'single', date: '2026-10-30' } });
  });

  // Décision : un fond de case n'est ni une catégorie ni une pastille
  it('en fond vert les lundis → fond des cases du lundi en vert, sans catégorie ni pastille', () => {
    const r = run('en fond vert les lundis');
    expect(r.status).toBe('ok');
    expect(r.intent).toMatchObject({ action: 'add', label: null, date: { type: 'recurring', weekdays: [0] } });
    expect(r.intent.color).toMatchObject({ name: 'vert', target: 'cell' });
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]).toMatchObject({ type: 'add_background', weekdays: [0] });
    expect(r.actions[0].color).toMatch(/^#[0-9A-F]{6}$/);
    const { newState } = applyActions(VIDE, r.actions);
    expect(newState.categories).toHaveLength(0);
    expect(newState.backgrounds).toHaveLength(1);
  });
  it('fond orange du 02/11 au 06/11 → fond des cases sur la période', () => {
    const r = run('fond orange du 02/11 au 06/11');
    expect(r.actions[0]).toMatchObject({ type: 'add_background', startDate: '2026-11-02', endDate: '2026-11-06' });
  });

  it('garde le 12/11 → travail (garde : jours fériés non exclus)', () => {
    const r = run('garde le 12/11');
    expect(r.status).toBe('ok');
    expect(r.intent).toMatchObject({ action: 'add', label: 'garde', kind: 'work', subkind: 'garde', date: { type: 'single', date: '2026-11-12' } });
  });
});

// ------------------------------------------------------------
describe('jour de la semaine seul = un seul événement, le prochain, aujourd\'hui inclus', () => {
  it('en vert dimanche nfl → dimanche 18/10', () => {
    const r = run('en vert dimanche nfl');
    expect(r.status).toBe('ok');
    expect(r.intent).toMatchObject({
      action: 'add', date: { type: 'single', date: '2026-10-18' },
      color: { hex: '#34C759', target: 'pill' }, label: 'nfl',
    });
  });
  it('mercredi en rouge foot → mercredi 21/10, un seul événement', () => {
    const r = run('mercredi en rouge foot');
    expect(r.status).toBe('ok');
    expect(r.intent).toMatchObject({ date: { type: 'single', date: '2026-10-21' }, color: { hex: '#FF3B30' }, label: 'foot' });
    expect(r.actions.some(a => a.type === 'add_recurring')).toBe(false);
  });
  it('jeudi foot → aujourd\'hui (jeudi 15/10)', () => {
    expect(run('jeudi foot').intent.date).toEqual({ type: 'single', date: '2026-10-15' });
  });
  it('tous les mercredis reste une règle récurrente', () => {
    expect(run('tous les mercredis foot').intent.date).toMatchObject({ type: 'recurring', weekdays: [2] });
  });
});

// ------------------------------------------------------------
describe('dates relatives', () => {
  it('demain foot', () => {
    expect(run('demain foot').intent).toMatchObject({ date: { type: 'single', date: '2026-10-16' }, label: 'foot' });
  });
  it('lundi prochain réunion → travail', () => {
    expect(run('lundi prochain réunion').intent).toMatchObject({ date: { type: 'single', date: '2026-10-19' }, label: 'réunion', kind: 'work' });
  });
  it('ce week-end vacs → samedi + dimanche', () => {
    expect(run('ce week-end vacs').intent).toMatchObject({ kind: 'vacation', date: { type: 'range', start: '2026-10-17', end: '2026-10-18' } });
  });
  it('dans 2 semaines RCP → travail', () => {
    expect(run('dans 2 semaines RCP').intent).toMatchObject({ date: { type: 'single', date: '2026-10-29' }, label: 'RCP', kind: 'work' });
  });
  it('après-demain foot', () => {
    expect(run('après-demain foot').intent.date).toEqual({ type: 'single', date: '2026-10-17' });
  });
});

// ------------------------------------------------------------
describe('heures', () => {
  it('foot tous les vendredis à 19h', () => {
    const r = run('foot tous les vendredis à 19h');
    expect(r.intent).toMatchObject({ label: 'foot', time: { start: '19:00' }, date: { type: 'recurring', weekdays: [4] } });
  });
  it('RDV dentiste le 12/11 à 14h30', () => {
    const r = run('RDV dentiste le 12/11 à 14h30');
    expect(r.intent).toMatchObject({ label: 'RDV dentiste', kind: 'neutral', time: { start: '14:30' }, date: { type: 'single', date: '2026-11-12' } });
  });
  it('réunion 9h-12h le 03/12', () => {
    const r = run('réunion 9h-12h le 03/12');
    expect(r.intent).toMatchObject({ label: 'réunion', kind: 'work', time: { start: '09:00', end: '12:00' }, date: { type: 'single', date: '2026-12-03' } });
  });
  it('l\'heure est lisible dans le résumé (9h-12h, pas 09h-12h)', () => {
    expect(run('réunion 9h-12h le 03/12').summary).toMatch(/ 9h-12h/);
  });
  it('de 9h à 12h formation le 03/12', () => {
    expect(run('de 9h à 12h formation le 03/12').intent.time).toEqual({ start: '09:00', end: '12:00' });
  });
});

// ------------------------------------------------------------
describe('suppressions', () => {
  it('retire les vacances du 20/10 au 25/10', () => {
    const r = run('retire les vacances du 20/10 au 25/10', ETAT);
    expect(r.status).toBe('ok');
    expect(r.intent).toMatchObject({ action: 'remove', kind: 'vacation', date: { type: 'range', start: '2026-10-20', end: '2026-10-25' } });
    const { newState, changed } = applyActions(ETAT, r.actions);
    expect(changed).toBe(true);
    expect(newState.events).toHaveLength(0);
  });
  it('finalement je retire les vas prévues du 20/10 au 25/10 → vacances, par le contexte', () => {
    const r = run('finalement je retire les vas prévues du 20/10 au 25/10', ETAT);
    expect(r.status).toBe('ok');
    expect(r.intent).toMatchObject({ action: 'remove', kind: 'vacation' });
    expect(applyActions(ETAT, r.actions).newState.events).toHaveLength(0);
  });
  it('retire les vacances du 22/10 au 23/10 → coupe la période en deux', () => {
    const r = run('retire les vacances du 22/10 au 23/10', ETAT);
    const ev = applyActions(ETAT, r.actions).newState.events.map(e => [e.startDate, e.endDate]);
    expect(ev).toEqual([['2026-10-20', '2026-10-21'], ['2026-10-24', '2026-10-25']]);
  });
  it('suppression d\'une date sans année passée : vise l\'événement existant', () => {
    const passe = { ...ETAT, events: [{ id: 'e1', categoryId: 'c_foot', label: 'foot', startDate: '2026-10-07', endDate: '2026-10-07' }] };
    const r = run('supprime foot le 07/10', passe);
    expect(r.intent.date).toEqual({ type: 'single', date: '2026-10-07' });
    expect(applyActions(passe, r.actions).newState.events).toHaveLength(0);
  });
});

// ------------------------------------------------------------
describe('modifications', () => {
  it('décale le foot au jeudi → la règle passe au jeudi', () => {
    const r = run('décale le foot au jeudi', ETAT);
    expect(r.status).toBe('ok');
    expect(r.intent).toMatchObject({ action: 'modify', change: { type: 'move' }, label: 'foot' });
    const { newState } = applyActions(ETAT, r.actions);
    expect(newState.recurringRules.find(x => x.id === 'r_foot').weekdays).toEqual([3]);
  });
  // Décision : pas de changement de couleur pour l'instant → on le dit, sans IA
  for (const phrase of ['mets le stage en bleu', 'change la couleur du foot en vert pastel']) {
    it(`${phrase} → pas encore possible, rien ne change`, () => {
      const r = run(phrase, ETAT);
      expect(r.status).toBe('missing');
      expect(r.intent).toMatchObject({ action: 'modify', change: { type: 'color' } });
      expect(r.message).toMatch(/couleur/);
    });
  }
  it('les actions de l\'IA ne changent pas non plus la couleur d\'une catégorie existante', () => {
    const { newState } = applyActions(ETAT, [
      { type: 'create_category', name: 'foot', pillColor: '#FF0000', cellColor: '#00FF00', kind: 'neutral' },
      { type: 'update_category', name: 'stage', pillColor: '#000000' },
    ]);
    expect(newState.categories.find(c => c.id === 'c_foot')).toMatchObject({ pillColor: '#34C759', cellColor: null });
    expect(newState.categories.find(c => c.id === 'c_stage').pillColor).toBe('#FF3B30');
  });
});

// ------------------------------------------------------------
describe('régression : « X en vacances » ajoute des exceptions, pas des vacances perso', () => {
  it('Montalvo en vacances du 02/11 au 06/11', () => {
    const r = run('Montalvo en vacances du 02/11 au 06/11', ETAT);
    expect(r.status).toBe('ok');
    expect(r.actions).toEqual([{ type: 'add_exceptions_to_category', categoryName: 'Montalvo', start: '2026-11-02', end: '2026-11-06' }]);
    const { newState } = applyActions(ETAT, r.actions);
    expect(newState.events).toHaveLength(1); // aucune vacance perso ajoutée
    expect(newState.recurringRules.find(x => x.id === 'r_mont').exceptions).toEqual(
      ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
  });
});

// ------------------------------------------------------------
describe('synonymes et types', () => {
  it('« garde » et « astreinte » sont du travail (sous-type garde : fériés non exclus)', () => {
    for (const w of ['garde', 'gardes', 'astreinte']) expect(run(`${w} le 12/11`).intent).toMatchObject({ kind: 'work', subkind: 'garde' });
  });
  it('« permanence » et « rotation » restent neutres', () => {
    for (const w of ['permanence', 'rotation']) expect(run(`${w} le 12/11`).intent.kind).toBe('neutral');
  });
  it('« vacation pro » est du travail, pas des vacances', () => {
    expect(run('vacation pro le 12/11').intent.kind).toBe('work');
  });
  it('« tu vas » : « vas » (3 lettres) n\'est pas corrigé en vacances', () => {
    expect(run('tu vas au cinéma le 12/11').intent.kind).toBe('neutral');
  });
  it('« HAD » et « staff » sont du travail', () => {
    expect(run('HAD le 12/11').intent.kind).toBe('work');
    expect(run('staff le 12/11').intent.kind).toBe('work');
  });
});

// ------------------------------------------------------------
describe('phrases confiées à l\'IA', () => {
  it('un vendredi sur deux', () => {
    expect(run('foot un vendredi sur deux').status).toBe('ai');
  });
  it('semaines paires', () => {
    expect(run('foot les semaines paires').status).toBe('ai');
  });
});

// ============================================================
// Couleurs (règle définitive) : chaque type garde sa couleur d'origine ; une couleur donnée
// pour un type existant ne vaut que pour cet événement-là.
// ============================================================
const ETAT_DRX = { ...ETAT, categories: [...ETAT.categories,
  { id: 'c_drx', name: 'stage chez Dr X', pillColor: '#007AFF', cellColor: null, kind: 'work', subkind: 'stage' }] };

describe('couleurs : propres à l\'événement pour un type existant', () => {
  it('mercredi en rouge foot (foot existe, vert) → cet événement en rouge, foot reste vert', () => {
    const r = run('mercredi en rouge foot', ETAT);
    expect(r.status).toBe('ok');
    expect(r.actions).toEqual([{ type: 'add_event', categoryName: 'foot', label: 'foot', startDate: '2026-10-21', endDate: '2026-10-21', pillColor: '#FF3B30' }]);
    const { newState } = applyActions(ETAT, r.actions);
    expect(newState.categories.find(c => c.id === 'c_foot').pillColor).toBe('#34C759');
    expect(newState.events.find(e => e.startDate === '2026-10-21').pillColor).toBe('#FF3B30');
    expect(newState.recurringRules.find(x => x.id === 'r_foot')).toEqual(ETAT.recurringRules[0]);
  });
  it('le 01/01 stage chez Dr X (sans couleur) → reprend le bleu d\'origine', () => {
    const r = run('le 01/01 stage chez Dr X', ETAT_DRX);
    expect(r.actions).toEqual([{ type: 'add_event', categoryName: 'stage chez Dr X', label: 'stage chez Dr X', startDate: '2027-01-01', endDate: '2027-01-01' }]);
  });
  it('stage chez Dr X en vert le 05/01 → cet événement en vert seulement', () => {
    const r = run('stage chez Dr X en vert le 05/01', ETAT_DRX);
    expect(r.actions).toEqual([{ type: 'add_event', categoryName: 'stage chez Dr X', label: 'stage chez Dr X', startDate: '2027-01-05', endDate: '2027-01-05', pillColor: '#34C759' }]);
    expect(applyActions(ETAT_DRX, r.actions).newState.categories.find(c => c.id === 'c_drx').pillColor).toBe('#007AFF');
  });
  it('foot en rouge tous les mardis → nouvelle règle en rouge, l\'ancienne règle ne change pas', () => {
    const r = run('foot en rouge tous les mardis', ETAT);
    expect(r.actions).toEqual([{ type: 'add_recurring', categoryName: 'foot', weekdays: [1], pillColor: '#FF3B30' }]);
    const { newState } = applyActions(ETAT, r.actions);
    expect(newState.recurringRules.find(x => x.id === 'r_foot').pillColor).toBeUndefined();
    expect(newState.recurringRules.find(x => x.weekdays[0] === 1).pillColor).toBe('#FF3B30');
  });
  it('vacances en fond orange du 02/11 au 06/11 (vacances existent) → fond orange pour ces vacances-là', () => {
    const r = run('vacances en fond orange du 02/11 au 06/11', ETAT);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]).toMatchObject({ type: 'add_event', categoryName: 'vacances', startDate: '2026-11-02', endDate: '2026-11-06' });
    expect(r.actions[0].cellColor).toMatch(/^#[0-9A-F]{6}$/);
  });
  it('le résumé indique que la couleur ne vaut que pour cet événement', () => {
    expect(run('mercredi en rouge foot', ETAT).summary).toMatch(/rouge \(cet événement seulement\)/);
  });
  it('nouveau type avec couleur → couleur d\'origine du type', () => {
    expect(run('tennis en violet le 12/11').actions[0]).toMatchObject({ type: 'create_category', name: 'tennis', pillColor: '#8B00FF' });
  });
});

// ============================================================
// « sauf » et ses équivalents
// ============================================================
describe('sauf : exceptions', () => {
  it('foot tous les vendredis sauf le 23/10 (règle existante) → exception ajoutée, pas de 2e règle', () => {
    const r = run('foot tous les vendredis sauf le 23/10', ETAT);
    expect(r.status).toBe('ok');
    expect(r.actions).toEqual([{ type: 'add_rule_exceptions', ruleId: 'r_foot', dates: ['2026-10-23'] }]);
    const { newState } = applyActions(ETAT, r.actions);
    expect(newState.recurringRules).toHaveLength(2);
    expect(newState.recurringRules.find(x => x.id === 'r_foot').exceptions).toEqual(['2026-10-23']);
  });
  it('foot tous les vendredis sauf le 23/10 (pas de règle) → nouvelle règle avec exception', () => {
    const r = run('foot tous les vendredis sauf le 23/10');
    expect(r.actions.find(a => a.type === 'add_recurring')).toEqual({ type: 'add_recurring', categoryName: 'foot', weekdays: [4], exceptions: ['2026-10-23'] });
  });
  for (const mot of ['à part', 'a part', 'excepté', 'hormis', 'mis à part', 'Sauf', 'SAUF']) {
    it(`équivalent : « ${mot} »`, () => {
      expect(run(`foot tous les vendredis ${mot} le 23/10`, ETAT).actions).toEqual([{ type: 'add_rule_exceptions', ruleId: 'r_foot', dates: ['2026-10-23'] }]);
    });
  }
  it('sauf le 23/10 et le 06/11 → 2 exceptions', () => {
    expect(run('foot tous les vendredis sauf le 23/10 et le 06/11', ETAT).actions[0].dates).toEqual(['2026-10-23', '2026-11-06']);
  });
  it('sauf du 20/12 au 05/01 → tous les jours de la période', () => {
    const d = run('foot tous les vendredis sauf du 20/12 au 05/01', ETAT).actions[0].dates;
    expect(d[0]).toBe('2026-12-20');
    expect(d[d.length - 1]).toBe('2027-01-05');
    expect(d).toHaveLength(17);
  });
  it('vacances du 20/12 au 05/01 sauf le 25/12 → deux périodes', () => {
    const r = run('vacances du 20/12 au 05/01 sauf le 25/12', ETAT);
    expect(r.status).toBe('ok');
    expect(r.actions.filter(a => a.type === 'add_event').map(a => [a.startDate, a.endDate]))
      .toEqual([['2026-12-20', '2026-12-24'], ['2026-12-26', '2027-01-05']]);
  });
  it('foot tous les vendredis sauf (rien après) → question', () => {
    const r = run('foot tous les vendredis sauf', ETAT);
    expect(r.status).toBe('missing');
    expect(r.message).toMatch(/Sauf quand/);
  });
});

describe('jours : tous les jours, en semaine, week-ends', () => {
  const W = (p) => run(p).intent.date;
  it('tous les jours = 7 jours', () => expect(W('foot tous les jours')).toMatchObject({ type: 'recurring', weekdays: [0, 1, 2, 3, 4, 5, 6] }));
  it('chaque jour = 7 jours', () => expect(W('foot chaque jour')).toMatchObject({ type: 'recurring', weekdays: [0, 1, 2, 3, 4, 5, 6] }));
  it('en semaine = lundi → vendredi', () => expect(W('Montalvo en semaine')).toMatchObject({ type: 'recurring', weekdays: [0, 1, 2, 3, 4] }));
  it('du lundi au vendredi = règle', () => expect(W('Montalvo du lundi au vendredi')).toMatchObject({ type: 'recurring', weekdays: [0, 1, 2, 3, 4] }));
  it('tous les week-ends = samedi + dimanche', () => expect(W('foot tous les week-ends')).toMatchObject({ type: 'recurring', weekdays: [5, 6] }));
  for (const p of ['tous les jours sauf le week-end', 'tous les jours sauf le weekend', 'tous les jours sauf les week-ends',
    'tous les jours sauf les samedis et dimanches', 'tous les jours sauf le WE', 'tous les jours sauf le w-e']) {
    it(`foot ${p} → lundi → vendredi`, () => expect(W(`foot ${p}`)).toMatchObject({ type: 'recurring', weekdays: [0, 1, 2, 3, 4] }));
  }
  it('Montalvo en semaine sauf le mercredi', () => {
    const r = run('Montalvo en semaine sauf le mercredi');
    expect(r.status).toBe('ok');
    expect(r.actions.find(a => a.type === 'add_recurring')).toEqual({ type: 'add_recurring', categoryName: 'Montalvo', weekdays: [0, 1, 3, 4] });
  });
});

// ============================================================
// « pas de X le … » : retire uniquement cette occurrence
// ============================================================
describe('pas de … : une seule occurrence', () => {
  it('pas de foot le 23/10 → exception sur la règle, la règle reste', () => {
    const r = run('pas de foot le 23/10', ETAT);
    expect(r.status).toBe('ok');
    const { newState } = applyActions(ETAT, r.actions);
    expect(newState.recurringRules.find(x => x.id === 'r_foot')).toMatchObject({ weekdays: [4], exceptions: ['2026-10-23'] });
  });
  it('pas de foot vendredi → vendredi 16/10', () => {
    const { newState } = applyActions(ETAT, run('pas de foot vendredi', ETAT).actions);
    expect(newState.recurringRules.find(x => x.id === 'r_foot').exceptions).toEqual(['2026-10-16']);
  });
  it('pas de foot le 22/10 (un jeudi, pas de foot ce jour-là) → message, rien ne change', () => {
    const r = run('pas de foot le 22/10', ETAT);
    expect(r.status).toBe('missing');
    expect(r.message).toMatch(/pas de foot/i);
  });
  it('pas de garde le 12/11 (événement ponctuel) → seul cet événement est retiré', () => {
    const st = { ...VIDE, categories: [{ id: 'g', name: 'garde', pillColor: '#FF3B30', cellColor: null, kind: 'work', subkind: 'garde' }],
      events: [{ id: 'g1', categoryId: 'g', label: 'garde', startDate: '2026-11-12', endDate: '2026-11-12' },
        { id: 'g2', categoryId: 'g', label: 'garde', startDate: '2026-11-26', endDate: '2026-11-26' }] };
    const { newState } = applyActions(st, run('pas de garde le 12/11', st).actions);
    expect(newState.events.map(e => e.id)).toEqual(['g2']);
  });
});

// ============================================================
// Plusieurs dates dans une phrase
// ============================================================
describe('plusieurs dates', () => {
  const dates = (p, st = VIDE) => run(p, st).actions.filter(a => a.type === 'add_event').map(a => a.startDate === a.endDate ? a.startDate : `${a.startDate}→${a.endDate}`);
  it('Andro les 28 mai, 4, 10 et 11 juin → 4 événements', () => {
    expect(dates('Andro les 28 mai, 4, 10 et 11 juin')).toEqual(['2027-05-28', '2027-06-04', '2027-06-10', '2027-06-11']);
  });
  it('garde le 12/11 et le 26/11', () => expect(dates('garde le 12/11 et le 26/11')).toEqual(['2026-11-12', '2026-11-26']));
  it('RCP les 3, 10 et 17 novembre', () => expect(dates('RCP les 3, 10 et 17 novembre')).toEqual(['2026-11-03', '2026-11-10', '2026-11-17']));
  it('stage chez X du 02/11 au 06/11 et du 16/11 au 20/11', () => {
    expect(dates('stage chez X du 02/11 au 06/11 et du 16/11 au 20/11')).toEqual(['2026-11-02→2026-11-06', '2026-11-16→2026-11-20']);
  });
  it('foot mardi et le 12/11', () => expect(dates('foot mardi et le 12/11')).toEqual(['2026-10-20', '2026-11-12']));
  it('foot le 12 et le 13 → prochaine occurrence : 12 et 13 novembre', () => expect(dates('foot le 12 et le 13')).toEqual(['2026-11-12', '2026-11-13']));
  it('foot le 15 et le 16 → aujourd\'hui inclus', () => expect(dates('foot le 15 et le 16')).toEqual(['2026-10-15', '2026-10-16']));
  it('une seule catégorie créée', () => {
    expect(run('garde le 12/11 et le 26/11').actions.filter(a => a.type === 'create_category')).toHaveLength(1);
  });
});

// ============================================================
// « X en vacances » : X inconnu, ou sans jours récurrents → question, rien n'est retiré
// ============================================================
describe('en vacances : cas particuliers', () => {
  const ETAT_ANDRO = { ...ETAT,
    categories: [...ETAT.categories, { id: 'c_andro', name: 'Andro', pillColor: '#FF69B4', cellColor: null, kind: 'work', subkind: 'stage' }],
    events: [...ETAT.events, { id: 'e_andro', categoryId: 'c_andro', label: 'Andro', startDate: '2026-11-04', endDate: '2026-11-04' }] };
  it('Dupont en vacances (inconnu) → question', () => {
    const r = run('Dupont en vacances du 02/11 au 06/11', ETAT);
    expect(r.status).toBe('missing');
    expect(r.message).toMatch(/Je ne connais pas « Dupont »/);
  });
  it('montalvo en vacs du 02/11 au 06/11 → exceptions (majuscules, synonyme)', () => {
    expect(run('montalvo en vacs du 02/11 au 06/11', ETAT).actions)
      .toEqual([{ type: 'add_exceptions_to_category', categoryName: 'Montalvo', start: '2026-11-02', end: '2026-11-06' }]);
  });
  it('Montalvo en vacances le 03/11 → un seul jour', () => {
    expect(run('Montalvo en vacances le 03/11', ETAT).actions)
      .toEqual([{ type: 'add_exceptions_to_category', categoryName: 'Montalvo', start: '2026-11-03', end: '2026-11-03' }]);
  });
  it('Andro en vacances (aucune règle) → question, rien n\'est supprimé', () => {
    const r = run('Andro en vacances du 02/11 au 06/11', ETAT_ANDRO);
    expect(r.status).toBe('missing');
    expect(r.message).toMatch(/Andro/);
    expect(r.actions).toBeUndefined();
  });
});

// ------------------------------------------------------------
describe('notes', () => {
  it('note pour le 10 juin : appeler le secrétariat', () => {
    const r = run('note pour le 10 juin : appeler le secrétariat');
    expect(r.status).toBe('ok');
    expect(r.actions).toEqual([{ type: 'add_note', date: '2027-06-10', text: 'appeler le secrétariat' }]);
  });
});

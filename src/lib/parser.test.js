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
  it('X inconnu « en vacances » → IA (personne ou catégorie introuvable)', () => {
    expect(run('Dupont en vacances du 02/11 au 06/11').status).toBe('ai');
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
  // Décision : une couleur donnée ne modifie jamais une catégorie existante
  it('mercredi en rouge foot (foot existe, vert) → ajouté en vert, l\'app le signale', () => {
    const r = run('mercredi en rouge foot', ETAT);
    expect(r.status).toBe('ok');
    expect(r.actions).toEqual([{ type: 'add_event', categoryName: 'foot', label: 'foot', startDate: '2026-10-21', endDate: '2026-10-21' }]);
    expect(r.summary).toMatch(/Foot garde sa couleur verte/);
    expect(applyActions(ETAT, r.actions).newState.categories.find(c => c.id === 'c_foot').pillColor).toBe('#34C759');
  });
  it('vacances en orange du 02/11 au 06/11 (vacances existent) → couleur inchangée, signalée', () => {
    const r = run('vacances en orange du 02/11 au 06/11', ETAT);
    expect(r.actions.some(a => a.type === 'update_category' || a.type === 'create_category')).toBe(false);
    expect(r.summary).toMatch(/garde sa couleur/);
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
  it('exception dans la phrase (« sauf »)', () => {
    expect(run('foot tous les vendredis sauf le 03/07').status).toBe('ai');
  });
  it('plusieurs dates séparées', () => {
    expect(run('Andro les 28 mai, 4, 10 et 11 juin').status).toBe('ai');
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

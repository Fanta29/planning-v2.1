# CLAUDE.md — Planning (PWA de calendrier personnel)

Lis ce fichier en entier avant toute modification.

## Contexte

- App « Planning » : calendrier personnel piloté en langage naturel. React 18 + Vite 5, PWA
  (vite-plugin-pwa), déployée sur Vercel depuis GitHub (`Fanta29/planning-v2.1`).
- Version en production : V2.1.1. Version en cours : **V2.2**.
- L'utilisateur est interne en médecine, peu expérimenté en code : expliquer simplement,
  sans jargon, et donner les manipulations hors code (Vercel, GitHub, AI Studio, iPhone)
  étape par étape, avec l'endroit exact où cliquer, puis attendre sa confirmation.
- Vision produit : l'app démarre vide ; chaque utilisateur définit tout en langage naturel
  (catégories, couleurs, règles récurrentes).
- **Principe central : le code comprend d'abord, l'IA (Gemini) n'est appelée qu'en dernier recours.**

## Règles de travail

1. Ne jamais pousser sur `main`. Travailler sur la branche de développement (session
   actuelle : `claude/planning-v2.2-lznwhf`). Vercel crée une URL de preview à chaque push ;
   l'utilisateur teste sur iPhone. Fusion sur `main` uniquement sur demande explicite.
2. Commits petits, un sujet par commit.
3. Ne jamais casser les données existantes (clé localStorage `planning_state_v21`). Tout
   changement de format = migration qui conserve catégories, règles, exceptions, notes.
4. S'arrêter après chaque étape : dire ce qui a été fait, l'URL de preview, quoi vérifier.

## Architecture (état V2.2 en cours)

```
api/parse.js        Vercel Function : appelle Gemini avec GEMINI_API_KEY (clé côté serveur uniquement)
src/main.jsx        point d'entrée React
src/App.jsx         toute l'interface + logique calendrier + application des actions
src/lib/storage.js  SEUL point de contact avec la persistance (localStorage aujourd'hui)
src/lib/perf.js     mesures de vitesse en mémoire (Réglages → Diagnostic de vitesse)
vite.config.js      PWA : precache de l'app shell, AUCUN runtimeCaching
```

Flux d'une phrase : saisie (footer) → `handleSubmit` → `callAI` (POST `/api/parse` avec la
phrase, les catégories, la date du jour) → Gemini renvoie `{ actions[], feedback }` →
`applyActions(state, actions)` produit le nouvel état → `setState` → sauvegarde
(`saveState`) → la grille (`MonthGrid`) recalcule les cases du mois via `getDayContent`.

Modèle de données (`planning_state_v21`) :
- `categories[]` : `{ id, name, pillColor, cellColor, kind: work|vacation|neutral, subkind: stage|regular|null }`
- `recurringRules[]` : `{ id, categoryId, weekdays[0=lundi..6], startDate, endDate, exceptions[] }`
- `events[]` : `{ id, categoryId, label, startDate, endDate }` (dates `AAAA-MM-JJ`, pas d'heure)
- `dayNotes[]` : `{ id, date, text }`
- `settings` : `{ vacationPeriod: 'civil'|'university'|{startMonth,startDay,endMonth,endDay}, theme }`

## Décisions prises (ne pas rouvrir)

- Pas de sélecteur de modèle IA dans l'interface.
- Pas de `runtimeCaching` dans le Service Worker (il rejouait des appels API et brûlait le
  quota). Ne jamais mettre en cache les appels `/api/*`.
- Pas de LLM local (WebLLM, Transformers.js) : trop lourd, WebGPU insuffisant, qualité faible.
- Décompte des vacances : année civile par défaut, configurable dans les réglages.
- La couleur est toujours choisie par l'utilisateur. Le comportement (travail / vacances /
  neutre) est déduit des mots, jamais de la couleur.
- Comportements à préserver : badges travail masqués pendant les vacances ; « X en vacances »
  sur une catégorie existante ajoute des exceptions à sa règle récurrente (pas de vacances
  perso) ; message « Rien trouvé » si une action échoue.
- « garde », « astreinte », « permanence », « rotation » ne sont PAS du travail (pas
  d'exclusion des fériés). « vacation pro » ≠ « vacances ».

## Avancement V2.2

- [x] Étape 1 — Diagnostic de lenteur (voir ci-dessous).
- [ ] Étape 2 — Modèle Gemini (principal `gemini-3.8-flash`, secours 429
      `gemini-3.5-flash-lite` — identifiants à vérifier sur la doc officielle avant de coder),
      sortie structurée JSON avec schéma, réflexion (« thinking ») minimale, indicateur
      « ⚡ mode éco » conservé.
- [ ] Étape 3 + 4 — Parser natif (actions, dates, heures, couleurs, types, fautes de frappe,
      hors ligne) + tests Vitest écrits en premier, date de référence fixe.
- [ ] Étape 5 — Interface : décompte global limité aux vacances, sélecteur de mois visiblement
      cliquable, résumé « ce que l'app a compris » + Annuler, journal local des phrases non
      comprises / passées par l'IA.

### Étape 1 — mesures (Chromium, profil iPhone, processeur ralenti ×4)

| Moment                          | Avant          | Après         |
|---------------------------------|----------------|---------------|
| Ouverture (calendrier affiché)  | 384 ms, 2 rendus (ordinateur puis mobile) | 163 ms, 1 rendu |
| Changement de mois              | ~170 ms (délai fixe de 120 ms + 3 rendus) | ~90 ms (immédiat) |
| Compteurs annuels (données lourdes, CPU normal) | 14,4 ms | 2,3 ms |
| Après envoi, partie app (API simulée) | ~140 ms | ~105 ms |

Conclusion : pas de calcul lourd commun ; la lenteur côté app venait du double rendu à
l'ouverture, du délai artificiel au changement de mois et de rendus inutiles (toute la
grille redessinée à chaque lettre tapée). L'envoi de phrase est dominé par Gemini (à
confirmer sur iPhone via Réglages → Diagnostic de vitesse, qui affiche la durée Gemini, les
jetons de réflexion et les démarrages à froid).

## Roadmap après la V2.2 (NE PAS implémenter sans demande)

V3 — multi-comptes :
- comptes utilisateurs avec Supabase (authentification), région UE ;
- synchronisation Mac ↔ iPhone (aujourd'hui tout est en localStorage, rien n'est synchronisé) ;
- chaque nouvel utilisateur part d'un calendrier vide.

Conséquence dès maintenant : tout accès aux données passe par `src/lib/storage.js`, pour
pouvoir remplacer localStorage par Supabase sans réécrire le reste.

## Développement local

```bash
npm install
npm run dev        # http://localhost:5173 (l'API /api/parse n'existe qu'avec `vercel dev`)
npm run build && npm run preview
```

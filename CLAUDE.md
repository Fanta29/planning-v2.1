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
   actuelle : `claude/planning-v2.2-lznwhf`). Vercel crée une preview à chaque push ;
   l'utilisateur teste sur iPhone.
2. **Rien ne va en production sans que l'utilisateur dise « fusionne ».** On ne fusionne pas
   étape par étape : une seule fusion, quand toute la V2.2 lui convient.
3. Commits petits, un sujet par commit.
4. Ne jamais casser les données existantes (clé localStorage `planning_state_v21`). Tout
   changement de format = migration qui conserve catégories, règles, exceptions, notes.
5. S'arrêter après chaque étape : dire ce qui a été fait et quoi vérifier.
6. **Vercel : faire soi-même toutes les vérifications et manipulations via le connecteur
   Vercel** (variables d'environnement, déploiements, protection, logs). Ne demander à
   l'utilisateur d'agir que pour ce qui se fait sur son iPhone.
7. **Pour faire tester : donner directement un lien de partage de la preview** (outil
   `get_access_to_vercel_url`, valable ~23 h ; les previews sont protégées par Vercel
   Authentication). Adresse stable de la branche :
   `planning-v2-1-git-claude-planning-v22-lznwhf-fanta29-s-projects.vercel.app`.
   Projet Vercel : `planning-v2-1` (`prj_uI9E3wkpDEDsykDv48uKQQzbAHRC`). Ne pas passer
   `teamId` aux outils Vercel : les appels sans `teamId` fonctionnent.
8. La preview a une autre adresse que la production : elle ne voit pas les données de
   l'utilisateur. Pour tester sur ses vraies données : export JSON depuis l'app habituelle,
   import sur la preview (Réglages → Données).

### Checklist avant fusion (à dérouler quand la V2.2 semble prête)

1. Prévenir l'utilisateur que la V2.2 paraît prête.
2. Confirmer, preuves à l'appui (tests), que ses données de production — catégories,
   règles (avec exceptions), vacances, événements, notes, réglages — seront conservées.
3. Lui faire tester la migration sur la preview avec ses vraies données importées.
4. Lui rappeler de faire un **export de sauvegarde depuis son app habituelle juste avant
   de fusionner**.
5. Fusionner uniquement après son « fusionne ».

## Architecture (état V2.2 en cours)

```
api/parse.js        Vercel Function : appelle Gemini avec GEMINI_API_KEY (clé côté serveur uniquement)
src/main.jsx        point d'entrée React
src/App.jsx         toute l'interface + logique calendrier + application des actions
src/lib/storage.js  SEUL point de contact avec la persistance (localStorage aujourd'hui)
src/lib/perf.js     mesures de vitesse en mémoire (Réglages → Diagnostic de vitesse)
vercel.json         région des fonctions : cdg1 (Paris)
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

- [x] Étape 1 — Diagnostic de lenteur (voir ci-dessous). Fondu du changement de mois rétabli
      en CSS (180 ms, sans délai, respecte « Réduire les animations »).
- [x] Export / import JSON (Réglages → Données), logique dans `src/lib/storage.js`.
- [x] Étape 2 — `gemini-3.8-flash` (thinkingLevel `low` : `minimal` n'existe pas sur ce
      modèle), secours sur 429/503 `gemini-3.5-flash-lite` (thinkingLevel `minimal`),
      `responseJsonSchema`, clé en en-tête, fonction en région `cdg1` (Paris).
      Identifiants vérifiés le 2026-10-15 (ai.google.dev : models, pricing, thinking).
      Quotas du free tier non publiés par modèle : à lire dans AI Studio.
- [ ] Étape 3 + 4 — Parser natif dans **son propre fichier `src/lib/parser.js`** (séparé
      d'App.jsx, testable seul) : actions, dates, heures, couleurs, types, fautes de frappe,
      hors ligne. Tests Vitest écrits en premier, date de référence fixe.
- [ ] Étape 5 — Interface : décompte global limité aux vacances, sélecteur de mois visiblement
      cliquable, résumé « ce que l'app a compris » + Annuler, journal local des phrases non
      comprises / passées par l'IA.

Mesure iPhone avant étape 2 (gemini-2.5-flash, iad1) : 2,5 à 3,4 s par phrase, dont
2,3 à 2,8 s dans Gemini (220 à 340 jetons de réflexion) ; ouverture 498 ms ; changement de
mois 16 à 19 ms.

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

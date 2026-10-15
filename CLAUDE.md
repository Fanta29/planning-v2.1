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
src/App.jsx         toute l'interface + logique calendrier
src/lib/parser.js   parser natif (sans IA) — tests : src/lib/parser.test.js (npm test)
src/lib/actions.js  application des actions (parser et IA), fonction pure
src/lib/dates.js    fonctions de dates
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
- `categories[]` : `{ id, name, pillColor, cellColor, kind: work|vacation|neutral, subkind: stage|regular|garde|null }`
- `recurringRules[]` : `{ id, categoryId, weekdays[0=lundi..6], startDate, endDate, exceptions[], pillColor?, cellColor? }`
- `events[]` : `{ id, categoryId, label, startDate, endDate, pillColor?, cellColor? }` (dates
  `AAAA-MM-JJ`, pas d'heure ; couleur facultative propre à l'événement)
- `dayNotes[]` : `{ id, date, text }`
- `backgrounds[]` : `{ id, color, weekdays[]|null, startDate, endDate, exceptions[] }` (fonds de
  case ; absent des anciennes données → liste vide)
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
- **Le parser ne devine jamais** : s'il hésite ou s'il manque une pièce, il pose une question
  courte (« Quel événement et quelle date ? », « Quelle date pour « inscription » ? »,
  « Quelles dates pour les vacances ? »). Ce principe vaut partout.
- **Objectif** : le parser comprend tout ; l'IA ne sert qu'en tout dernier recours. Pour
  chaque nouveau type de phrase complexe : proposer d'abord les phrases et le résultat
  attendu sous forme de tests, les faire valider par l'utilisateur, puis coder.
- **Couleurs (règle définitive, pour toutes les catégories)** : chaque type d'événement garde
  la couleur avec laquelle il a été créé ; sans couleur, un nouvel événement reprend cette
  couleur. Une couleur donnée pour un type existant (« mercredi en rouge foot ») s'applique
  uniquement à cet événement-là (champ `pillColor`/`cellColor` de l'événement ou de la règle) ;
  elle ne modifie jamais le type, ni les événements déjà créés, ni les règles existantes.
  Changer la couleur d'un type pour de bon (« mets le stage en bleu ») : message « Changer une
  couleur n'est pas encore possible » (voir « Idées pour plus tard »). Vaut pour le parser
  et pour l'IA.
- **Le parser comprend toutes les façons naturelles de dire une même chose** : majuscules,
  accents ou non, abréviations, tirets ou non (week-end / weekend / WE / w-e…).
- **« sauf »** et équivalents (à part, a part, excepté, hormis, mis à part, en dehors de) :
  dates, périodes, jours ou week-end exclus. Sur une règle existante identique, on ajoute
  l'exception au lieu de créer une 2e règle.
- **Jours** : « tous les jours » / « chaque jour » = 7 jours ; « en semaine » = lundi →
  vendredi ; « tous les week-ends » = samedi + dimanche ; « sauf le week-end » (et variantes)
  retire samedi et dimanche ; « du lundi au vendredi » = règle.
- **« pas de foot le 23/10 »** : retire uniquement cette occurrence (exception sur la règle,
  ou suppression de l'événement ponctuel) ; si rien ce jour-là, message.
- **Plusieurs dates dans une phrase** : un événement par date ; « le 12 et le 13 » sans mois
  = prochaine occurrence de ces jours (aujourd'hui inclus).
- **« X en vacances »** : X inconnu, ou catégorie sans règle récurrente → question, rien
  n'est retiré.
- **Fond de case** : « en fond vert les lundis » colore le fond des cases des jours concernés
  (liste `backgrounds`), comme les vacances perso. Ce n'est ni une catégorie ni une pastille.
- **Garde, astreinte** : travail (décomptées), sous-type `garde`, mais ce sont des
  exceptions : les vacances ne les suppriment pas et ne les masquent pas (elles restent
  visibles et comptées), et elles ne sont pas exclues des jours fériés. Permanence et rotation
  restent neutres. « vacation pro » ≠ « vacances ».
- **Plage sans année** = période dont la fin n'est pas encore passée (validé).
- **Mots du travail** (liste complète, identique dans `parser.js` et `api/parse.js`) :
  travail, travailler, taf, taffer, taffe, boulot, bosser, job, work, working, stage, internat,
  externat, consultation, consult, RDV pro, rendez-vous pro, réunion, meeting, briefing,
  présentation, formation, séminaire, conf, conférence, cours, td, tp, examen, partiel, oral,
  soutenance, mission, contrat, prestation, mandat, déplacement pro, voyage pro, déplacement
  professionnel, business trip, HAD, RCP, staff, visite, tournée, vacation pro, séance,
  atelier pro ; sous-type garde : garde, gardes, astreinte, astreintes. Sous-type stage :
  stage, internat, externat. « cours de sport / piano… » = loisir (neutre).
- **Mots des vacances** : vacances, vacance, vacs, vac, congés, congé, CP, repos (casse et
  accents ignorés). Mots de 3 lettres ou moins jamais corrigés à l'aveugle (« vas »).

## Avancement V2.2

- [x] Étape 1 — Diagnostic de lenteur (voir ci-dessous). Fondu du changement de mois rétabli
      en CSS (180 ms, sans délai, respecte « Réduire les animations »).
- [x] Export / import JSON (Réglages → Données), logique dans `src/lib/storage.js`.
- [x] Étape 2 — **Ordre décidé par l'utilisateur après mesure (choix 1b) : principal
      `gemini-3.5-flash-lite` (thinkingLevel `minimal`), secours `gemini-3.8-flash`
      (thinkingLevel `low` : `minimal` n'existe pas sur ce modèle)** sur 429/503/délai,
      `responseJsonSchema`, clé en en-tête, fonction en région `cdg1` (Paris).
      Identifiants vérifiés le 2026-10-15 (ai.google.dev : models, pricing, thinking).
      Quotas du free tier non publiés par modèle : à lire dans AI Studio.
      Délai max de 5 s sur le principal, puis secours (504 interne).
      Test réel sur la preview le 2026-10-15 (12 phrases) : gemini-3.8-flash a répondu 1 fois
      sur 12 (« 503 forte demande » ou délai dépassé, puis 429 quota après ~10 appels) ;
      Flash-Lite répond en 1,0 à 2,5 s avec 0 jeton de réflexion. Qualité Flash-Lite : correct
      sur foot/vendredis, cours de sport (bornes), vacances (plage), stage chez X, Montalvo en
      vacances ; faux sur « retire les vas du … au … » (exceptions au lieu de supprimer les
      vacances), « en fond vert les lundis » (demande une catégorie), « vert pastel » (mis en
      fond au lieu de la pastille), « décale le foot au jeudi », « garde le 12/11 » (rien).
      Dates sans année : l'IA met l'année courante même si la date est passée (07/10 → 2026).
- [x] Étape 3 + 4 — Parser natif `src/lib/parser.js` (`interpret(texte, état, 'AAAA-MM-JJ')`
      → ok / missing / ai), application des actions `src/lib/actions.js`, dates
      `src/lib/dates.js`. Tests : `npm test` (Vitest, `src/lib/parser.test.js`, date fixe
      jeudi 15/10/2026). **Lancer les tests à chaque modification du parser.**
      Règles de dates : date sans année = prochaine occurrence (aujourd'hui inclus), sauf
      suppression (vise l'événement existant) ; plage = celle dont la fin n'est pas passée ;
      jour de semaine seul = un seul événement, le prochain, aujourd'hui inclus ; « tous les
      / les mercredis » = règle. Les mêmes règles sont données à l'IA dans le prompt.
      Hors ligne vérifié (ouverture + parser). Heures : rien pour l'instant (voir « Idées
      pour plus tard ») ; l'heure reste ajoutée au libellé des événements ponctuels.
- [x] IA en échec : principal, secours, puis principal retenté ; message simple côté app
      (« Le service est surchargé… »), phrase gardée ; indicateur « ⚡ secours ».
- [x] « Aujourd'hui : JJ/MM » cliquable (retour au mois en cours, jour sélectionné).
- [x] Mises à jour : `src/main.jsx` enregistre le service worker via `virtual:pwa-register`
      → la page se recharge seule sur la nouvelle version (vérif. à chaque retour dans l'app
      et toutes les heures). Avant, l'iPhone gardait l'ancienne version en cache.
- [x] Réglages : « Comprises sans IA : X % » et journal local des phrases passées par l'IA
      (clé `planning_journal_v1`, 200 max) avec « Copier la liste » : l'utilisateur l'envoie
      pour enrichir le parser.
- [x] Phrases complexes (tests validés par l'utilisateur, puis codés) : « sauf » et
      équivalents, plusieurs dates, « pas de … le … », « X en vacances » inconnu ou sans
      règle, tous les jours / en semaine / week-ends. Couleur par événement. 114 tests.
      Encore confiés à l'IA : « un vendredi sur deux », « semaines paires », exception sur une
      date simple, suppression d'une récurrence entière par dates.
- [ ] Branche `claude/export-production` (partie de `main`, bouton d'export seul, lecture
      seule) : **exception validée par l'utilisateur à la règle « une seule fusion »**.
      Ne la fusionner sur `main` qu'après son « fusionne l'export ».
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

## Idées pour plus tard (non décidées, ne pas implémenter)

- **Heures** : ajouter un champ « heure » facultatif aux événements et aux règles
  (« 19:00 » ou « 09:00-12:00 »), affiché devant le nom (« 19h foot »). Le parser reconnaît
  déjà « à 19h », « 19h30 », « 9h-12h », « de 9h à 12h ».
- **Changement de couleur** d'une catégorie (« mets le stage en bleu »).

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

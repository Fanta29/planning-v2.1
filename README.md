# 📅 Planning V2 — Guide de mise à jour

Tu as déjà ta V1 en ligne. Pour passer à la V2, tu vas simplement **remplacer les fichiers sur GitHub** par ceux de ce ZIP. Vercel redéploiera automatiquement.

**Compte 5 minutes.**

---

## ÉTAPE 1 — Sauvegarder tes données actuelles (optionnel)

La V2 a un nouveau format de données. **Tes données de la V1 ne seront pas reprises automatiquement.** Le calendrier sera vide au premier lancement de la V2, et tu recréeras tes catégories en parlant à l'app (c'est exactement le but de la V2).

Si tu veux quand même garder une trace de la V1, prends 30 secondes pour faire des screenshots des mois importants. Sinon, tout est jetable.

---

## ÉTAPE 2 — Décompresser le ZIP

Décompresse `planning-v2.zip`. Tu obtiens un dossier `planning-v2` contenant :

- `api/` (avec `parse.js`)
- `public/` (icônes)
- `src/` (avec `App.jsx` et `main.jsx`)
- `index.html`, `package.json`, `vercel.json`, `vite.config.js`, `.gitignore`, `README.md`

---

## ÉTAPE 3 — Remplacer les fichiers sur GitHub

### 3a. Vider l'ancien repo (manière simple)

1. Va sur `https://github.com/Fanta29/planning`
2. Clique sur l'onglet **Settings**
3. Tout en bas, **Danger Zone** → **Delete this repository**
4. Tape `Fanta29/planning` pour confirmer

### 3b. Recréer le repo

1. Va sur `https://github.com/new`
2. Repository name : `planning` (en minuscules)
3. Public, **rien de coché**, clique **Create repository**

### 3c. Uploader la V2

1. Sur la page Quick setup, clique sur **uploading an existing file**
2. Dans le dossier `planning-v2` décompressé, **sélectionne tout** (Cmd+A)
3. **Glisse-dépose dans la zone GitHub**
4. **VÉRIFIE** que tu vois bien :
   - `api/parse.js`
   - `public/icon-*.png`
   - `src/App.jsx`
   - `src/main.jsx`
   - Les autres fichiers à la racine
5. En bas : commit message `V2 — catégories personnalisables`, puis **Commit changes**

> ⚠️ Si tu utilises Safari et que les sous-dossiers se "perdent" (tu vois `App.jsx` directement au lieu de `src/App.jsx`), utilise **Chrome** pour cette étape.

---

## ÉTAPE 4 — Vercel se reconnecte automatiquement

Comme tu as supprimé le repo précédent, Vercel a peut-être perdu le lien. Vérifie :

1. Va sur ton dashboard Vercel
2. Si ton projet **planning** est toujours là et lié au repo, attends 1-2 min : un nouveau déploiement va se lancer automatiquement
3. **Si le projet a disparu** : refais l'étape 6 du guide V1 (Add New > Project > Import depuis Fanta29/planning > ajoute la variable `GEMINI_API_KEY` avec ta clé)

---

## ÉTAPE 5 — Tester

Va sur `https://planning-ashen-chi.vercel.app/` (ou ta nouvelle URL).

Le calendrier doit être **complètement vide** sauf les jours fériés.

Tape par exemple : `HAD en mauve les lundis`

Tu devrais voir une pilule mauve "HAD" apparaître tous les lundis.

---

## Nouvelles fonctionnalités V2

- 🎨 **Catégories 100% personnalisables** : couleur, fond de case, comportement (travail/vacances/neutre)
- 🌙 **Mode sombre** (Réglages → Thème → Sombre)
- 📱 **Swipe gauche/droite** sur iPhone pour changer de mois
- ♾️ **Calendrier infini** : navigation libre dans toutes les années
- 📅 **Mois actuel** au démarrage
- 📝 **Notes libres** par jour
- ⚙️ **Page Réglages** (thème, année civile/universitaire, modèle IA)
- 🧮 **Décompte des vacances par mois + total**
- 🤖 **Gemini Pro par défaut** (qualité maximale)
- ✅ **Vrai message succès/échec** ("Rien trouvé" si la commande n'a rien matché)
- 🔄 **Suppression unifiée** (la même formulation marche pour événements et vacances)

---

## En cas de problème

Screenshot et envoie-moi. On débug ensemble.

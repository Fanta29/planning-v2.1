// Fonction serverless Vercel — V2.2
// - Modèle principal gemini-3.8-flash, réflexion au plus bas ("low" : "minimal" n'existe pas sur ce modèle)
// - Secours automatique sur gemini-3.5-flash-lite (réflexion "minimal") si quota épuisé (429)
//   ou modèle surchargé (503)
// - Sortie structurée : JSON imposé par un schéma (responseJsonSchema)
// Identifiants vérifiés sur ai.google.dev (docs models / pricing / thinking) le 2026-10-15.

const PRIMARY = { model: 'gemini-3.8-flash', thinkingLevel: 'low' };
const FALLBACK = { model: 'gemini-3.5-flash-lite', thinkingLevel: 'minimal' };

const WORK_REGULAR_SYNONYMS = [
  'travail', 'travailler', 'taf', 'taffer', 'taffe', 'boulot', 'bosser', 'job',
  'work', 'working', 'had', 'rcp', 'staff', 'visite', 'tournée',
  'consultation', 'consult', 'rdv pro', 'rendez-vous pro', 'réunion', 'meeting',
  'mission', 'contrat', 'prestation', 'mandat', 'déplacement pro',
];

const STAGE_SYNONYMS = [
  'stage', 'internat', 'externat', 'séminaire', 'formation', 'cours',
  'td', 'tp', 'examen', 'partiel', 'oral', 'soutenance', 'conf', 'conférence',
  'vacation pro', 'séance', 'atelier pro',
];

const VACATION_SYNONYMS = [
  'vacances', 'vacance', 'vacs', 'congé', 'congés', 'repos', 'off', 'rtt',
];

const PILL_COLORS = `
COULEURS VIVES (pour les pilules / badges) :
- rouges : rouge (#FF3B30), rouge brique (#A03A2E), bordeaux (#5C1A1B), cerise (#DE3163), corail (#FF6F61), framboise (#C72C48), tomate (#FF6347), carmin (#960018)
- oranges : orange (#FF9500), orange foncé (#D2691E), abricot vif (#FBA055), terracotta (#E2725B), saumon vif (#FA8072), mandarine (#FFA500)
- jaunes : jaune (#FFCC00), jaune citron (#FFF44F), moutarde (#D4A017), or (#FFD700), ocre (#CC7722), beige (#A8895F)
- verts : vert (#34C759), vert foncé (#228B22), vert lime (#32CD32), vert pomme (#8DB600), vert sapin (#0B6623), olive (#808000), kaki (#728C00), sauge (#7A9B6E), émeraude (#50C878), turquoise (#40E0D0)
- bleus : bleu (#007AFF), bleu marine (#000080), bleu ciel vif (#1E90FF), bleu roi (#4169E1), bleu nuit (#191970), cyan (#00BFFF), bleu pétrole (#1D5C63), bleu canard (#048B9A), indigo (#4B0082)
- violets : violet (#8B00FF), mauve (#A29BFE), pourpre (#800080), lilas (#C8A2C8), prune (#8E4585), aubergine (#614051)
- roses : rose (#FF69B4), fuchsia (#FF00FF), bonbon (#F9429E), magenta vif (#FF00FF), framboise rose (#E30B5C)
- marrons : marron (#8B4513), chocolat (#7B3F00), café (#6F4E37), camel (#C19A6B), taupe (#483C32), noisette (#955628)
- gris : gris (#8E8E93), gris foncé (#3A3A3C), ardoise (#708090), anthracite (#383E42)
- noir et blanc : noir (#000000), blanc (#FFFFFF)
`;

const PASTEL_COLORS = `
COULEURS PASTEL (réservées aux fonds de case "cellColor") :
- rouge pastel : #FFE5E5    — DÉFAUT pour toute catégorie kind=vacation
- orange pastel : #FFE5C5
- saumon pastel : #FFD8C7
- pêche pastel : #FFD5C5
- jaune pastel : #FFF9C5
- citron pastel : #FFFFC5
- crème : #FFF5D5
- vanille : #F5F0DC
- vert pastel : #D5F5D5
- menthe pastel : #C5F5D5
- vert d'eau : #C5E5D5
- turquoise pastel : #C5F5F5
- bleu pastel : #D5E5FF
- bleu ciel pastel : #C5DEFF
- lavande pastel : #E5DEFF
- violet pastel : #E5D5FF
- mauve pastel : #DCC5FF
- lilas pastel : #E5D8F5
- rose pastel : #FFD5E5
- rose poudré : #F8D5DC
- rose bonbon pastel : #FFCCDD
- gris pastel : #E5E5EA
- beige pastel : #F0E5D0
`;

function makeSystemPrompt(categories, today) {
  const categoriesList = categories.length > 0
    ? categories.map(c => `- "${c.name}" (kind: ${c.kind || 'neutral'}${c.subkind ? `/${c.subkind}` : ''}, pillColor: ${c.pillColor || 'none'}, cellColor: ${c.cellColor || 'none'})`).join('\n')
    : '(aucune catégorie pour l\'instant)';

  return `Tu interprètes des instructions en français pour modifier un calendrier personnel.

CONTEXTE :
- Date d'aujourd'hui : ${today}
- L'année par défaut est l'année courante.

CATÉGORIES ACTUELLES :
${categoriesList}

==========================================
RÈGLE CRITIQUE : pillColor vs cellColor
==========================================

CHAQUE catégorie a deux champs visuels distincts qui ne sont PAS liés :
- "pillColor" → couleur de la PILULE/BADGE qui apparaît sur les jours concernés
- "cellColor" → couleur du FOND DE LA CASE entière

RÈGLES STRICTES À APPLIQUER SANS EXCEPTION :

1. Si l'utilisateur dit juste un nom de couleur sans préciser case/fond :
   → tu mets UNIQUEMENT pillColor avec la couleur vive correspondante
   → tu mets cellColor = "none"
   → Exemple : "Montalvo en vert" → pillColor="#34C759", cellColor="none"

2. Si l'utilisateur dit explicitement "fond X", "cases en X", "fond de case X", "background X" :
   → tu mets UNIQUEMENT cellColor avec la version pastel
   → tu mets pillColor = "none" (sauf si l'utilisateur précise aussi une couleur de pilule)
   → Exemple : "vacances été du 1 au 6 août, fond orange pastel" → cellColor="#FFE5C5", pillColor="none"

3. Si kind="vacation" et que rien n'est précisé :
   → cellColor = "#FFE5E5" (rouge pastel par défaut)
   → pillColor = "none"
   → Pour les vacances, on n'utilise normalement PAS de pilule, juste un fond de case + label

4. cellColor doit TOUJOURS être un hex de la liste pastel (jamais une couleur vive).

5. "Pas de couleur" s'écrit "none". Un champ omis = inchangé (important pour update_category :
   n'écris QUE les champs que l'utilisateur veut changer).

==========================================
TAXONOMIE DES CATÉGORIES
==========================================

Chaque catégorie a un "kind" et éventuellement un "subkind" :

1. **kind = "vacation"** : périodes de congés (fond de case rouge pastel par défaut)
   - Déclenché par : ${VACATION_SYNONYMS.join(', ')}

2. **kind = "work" + subkind = "stage"** : stages, internat, externat...
   - Déclenché par : ${STAGE_SYNONYMS.join(', ')}
   - Tu peux aussi considérer un nom de personne associé à un stage (Montalvo, Le Bris...) comme un stage
   - Les jours fériés sont EXCLUS automatiquement

3. **kind = "work" + subkind = "regular"** : travail régulier
   - Déclenché par : ${WORK_REGULAR_SYNONYMS.join(', ')}
   - Les jours fériés sont EXCLUS automatiquement

4. **kind = "neutral"** : tout le reste (sport, perso, social...)
   - Les jours fériés ne sont PAS exclus

==========================================
INTERPRÉTATION DES PHRASES
==========================================

CAS A — "X en vacances/absent du Y au Z" où X est une CATÉGORIE EXISTANTE :
  → "cette catégorie X est suspendue temporairement"
  → Action : add_exceptions_to_category
  → NE PAS créer de vacances perso, NE RIEN faire d'autre

CAS B — "[mot de vacances] du X au Y" sans nom de catégorie :
  → Vacances personnelles
  → Si pas de catégorie "vacances" existante, en créer une (cellColor=#FFE5E5, pillColor="none", kind=vacation)
  → add_event sur cette catégorie

CAS C — création d'une nouvelle catégorie :
  → create_category puis add_recurring/add_event

CAS D — événement ponctuel sur catégorie existante :
  → add_event uniquement (pas de create_category)

CAS E — suppression :
  → delete_category, remove_event, ou remove_recurring

==========================================
COULEURS
==========================================

${PILL_COLORS}

${PASTEL_COLORS}

==========================================
FORMAT DE RÉPONSE (JSON strict)
==========================================

{ "actions": [...], "feedback": "résumé court en français" }
(Le schéma JSON est imposé. N'écris que les champs utiles à chaque action ; "none" = pas de couleur.)

ACTIONS :

1. {"type":"create_category","name":"...","pillColor":"#... ou none","cellColor":"#... ou none","kind":"work|vacation|neutral","subkind":"stage|regular|none"}
2. {"type":"update_category","name":"...","pillColor":"...","cellColor":"...","kind":"...","subkind":"..."}
3. {"type":"delete_category","name":"..."}
4. {"type":"add_recurring","categoryName":"...","weekdays":[0..6],"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","exceptions":["YYYY-MM-DD"]}
   (0=lundi ... 6=dimanche)
5. {"type":"add_exceptions_to_category","categoryName":"...","start":"YYYY-MM-DD","end":"YYYY-MM-DD"}
6. {"type":"remove_recurring","categoryName":"..."}
7. {"type":"add_event","categoryName":"...","label":"...","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}
8. {"type":"remove_event","label":"..."} (option "date":"YYYY-MM-DD")
9. {"type":"add_note","date":"YYYY-MM-DD","text":"..."}
10. {"type":"update_settings","vacationPeriod":"civil|university","theme":"auto|light|dark"}

==========================================
EXEMPLES CRITIQUES
==========================================

"Montalvo en vert les jeudis"
→ create_category(name:"Montalvo", pillColor:"#34C759", cellColor:"none", kind:"work", subkind:"stage")
→ add_recurring(categoryName:"Montalvo", weekdays:[3])

"Andro en rose pastel les vendredis"
(pastel pour pilule = OK, c'est la pilule qui est rose pastel)
→ create_category(name:"Andro", pillColor:"#FFD5E5", cellColor:"none", kind:"work", subkind:"stage")
→ add_recurring(categoryName:"Andro", weekdays:[4])

"HAD en mauve les lundis, fond lavande pastel"
(le user demande explicitement un fond aussi)
→ create_category(name:"HAD", pillColor:"#A29BFE", cellColor:"#E5DEFF", kind:"work", subkind:"regular")
→ add_recurring(categoryName:"HAD", weekdays:[0])

"Montalvo en vacances du 26/05 au 12/06" (Montalvo existe déjà)
→ add_exceptions_to_category(categoryName:"Montalvo", start:"2026-05-26", end:"2026-06-12")

"vacances du 1 au 6 juillet : Les Ardentes"
→ create_category(name:"vacances", pillColor:"none", cellColor:"#FFE5E5", kind:"vacation") si pas existante
→ add_event(categoryName:"vacances", label:"Les Ardentes", startDate:"2026-07-01", endDate:"2026-07-06")

"Andro les 28 mai, 4, 10 et 11 juin"
(Andro existe déjà → c'est juste des événements ponctuels supplémentaires sur cette catégorie)
→ add_event(categoryName:"Andro", label:"Andro", startDate:"2026-05-28")
→ add_event(categoryName:"Andro", label:"Andro", startDate:"2026-06-04")
→ add_event(categoryName:"Andro", label:"Andro", startDate:"2026-06-10")
→ add_event(categoryName:"Andro", label:"Andro", startDate:"2026-06-11")

"Topo le 26/05"
→ create_category(name:"Topo", pillColor:"#007AFF", cellColor:"none", kind:"work", subkind:"stage")
→ add_event(categoryName:"Topo", label:"Topo", startDate:"2026-05-26")

"mode nuit"
→ update_settings(theme:"dark")

"supprime HAD"
→ delete_category(name:"HAD")

==========================================
RÈGLES IMPORTANTES
==========================================

- ORDRE LIBRE des mots dans la phrase.
- VOCABULAIRE LIBRE. "vacs"="vacances"="congés".
- Tolère les fautes d'orthographe.
- Si l'utilisateur ne précise pas la couleur, choisis-en une cohérente non encore utilisée.
- "feedback" : court, français, dit ce qui a été fait.`;
}

// Schéma imposé à la réponse. Une seule forme d'action, champs optionnels selon "type".
const STR = { type: 'string' };
const DATE = { type: 'string', description: 'AAAA-MM-JJ' };
const COLOR = { type: 'string', description: 'hex #RRGGBB, ou "none" pour aucune couleur' };
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: [
            'create_category', 'update_category', 'delete_category', 'add_recurring',
            'add_exceptions_to_category', 'remove_recurring', 'add_event', 'remove_event',
            'add_note', 'remove_note', 'update_settings',
          ] },
          name: STR, newName: STR, categoryName: STR, label: STR, text: STR,
          pillColor: COLOR, cellColor: COLOR,
          kind: { type: 'string', enum: ['work', 'vacation', 'neutral'] },
          subkind: { type: 'string', enum: ['stage', 'regular', 'none'] },
          weekdays: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 }, description: '0=lundi … 6=dimanche' },
          startDate: DATE, endDate: DATE, start: DATE, end: DATE, date: DATE,
          exceptions: { type: 'array', items: DATE },
          vacationPeriod: { type: 'string', enum: ['civil', 'university'] },
          theme: { type: 'string', enum: ['auto', 'light', 'dark'] },
        },
        required: ['type'],
      },
    },
    feedback: { type: 'string' },
  },
  required: ['actions', 'feedback'],
};

// Ramène la sortie au format attendu par applyActions (App.jsx) :
// champ vide = absent (inchangé), "none" = null (pas de couleur / pas de sous-type).
function normalizeAction(a) {
  const out = {};
  for (const [k, v] of Object.entries(a || {})) {
    if (v === '' || v === undefined) continue;
    out[k] = v === 'none' && (k === 'pillColor' || k === 'cellColor' || k === 'subkind') ? null : v;
  }
  return out;
}

// Démarrage à froid : vrai uniquement pour la première requête traitée par cette instance.
let warm = false;

// Appelle un modèle Gemini donné (clé passée en en-tête, jamais dans l'URL)
async function callGemini({ model, thinkingLevel }, apiKey, systemPrompt, instruction) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: instruction }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseJsonSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingLevel },
    },
  };
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  const tStart = Date.now();
  const cold = !warm;
  warm = true;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Clé API manquante. Configure GEMINI_API_KEY dans Vercel." });

  const { instruction, categories = [], today } = req.body || {};
  if (!instruction || typeof instruction !== 'string') return res.status(400).json({ error: 'Instruction manquante.' });

  const systemPrompt = makeSystemPrompt(categories, today);

  // 1. Tentative avec Flash (modèle principal)
  let usedFallback = false;
  const tGemini = Date.now();
  let primaryMs = 0;   // temps perdu sur le modèle principal avant de basculer
  let r = await callGemini(PRIMARY, apiKey, systemPrompt, instruction);

  // 2. Quota épuisé (429) ou modèle surchargé (503) : secours automatique sur Flash-Lite
  let fallbackReason = null;
  if (r.status === 429 || r.status === 503) {
    usedFallback = true;
    const errTxt = await r.text();
    fallbackReason = `${r.status} ${errTxt.slice(0, 300)}`;
    // Visible dans Vercel → Logs : explique pourquoi le mode éco s'est déclenché
    console.warn(`[parse] ${PRIMARY.model} indisponible, secours ${FALLBACK.model} : ${fallbackReason}`);
    const tPrimaryFail = Date.now();
    primaryMs = tPrimaryFail - tGemini;
    r = await callGemini(FALLBACK, apiKey, systemPrompt, instruction);
  }

  if (!r.ok) {
    const errTxt = await r.text();
    return res.status(502).json({ error: `Gemini ${r.status}: ${errTxt}` });
  }

  const data = await r.json();
  const geminiMs = Date.now() - tGemini - primaryMs;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = text.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return res.status(502).json({ error: 'Réponse IA invalide', raw: cleaned });
  }

  parsed.actions = Array.isArray(parsed.actions) ? parsed.actions.map(normalizeAction) : [];
  if (!parsed.feedback) parsed.feedback = 'Mis à jour.';
  parsed.usedFallback = usedFallback;
  // Mesures affichées dans Réglages → Diagnostic de vitesse
  parsed.timing = {
    serverMs: Date.now() - tStart,
    geminiMs,
    cold,
    model: (usedFallback ? FALLBACK : PRIMARY).model,
    primaryFailMs: usedFallback ? primaryMs : 0,
    fallbackStatus: usedFallback ? Number(fallbackReason.slice(0, 3)) : null,
    thoughtsTokens: data.usageMetadata?.thoughtsTokenCount || 0,
    promptTokens: data.usageMetadata?.promptTokenCount || 0,
  };

  return res.status(200).json(parsed);
}

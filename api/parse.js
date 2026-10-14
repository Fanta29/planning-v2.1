// Fonction serverless Vercel — V2.1.1
// Améliorations :
// - Distinction pillColor vs cellColor strictement clarifiée dans le prompt
// - Fallback automatique gemini-2.5-flash → gemini-2.5-flash-lite si quota 429

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
   → tu mets cellColor = null
   → Exemple : "Montalvo en vert" → pillColor="#34C759", cellColor=null

2. Si l'utilisateur dit explicitement "fond X", "cases en X", "fond de case X", "background X" :
   → tu mets UNIQUEMENT cellColor avec la version pastel
   → tu mets pillColor = null (sauf si l'utilisateur précise aussi une couleur de pilule)
   → Exemple : "vacances été du 1 au 6 août, fond orange pastel" → cellColor="#FFE5C5", pillColor=null

3. Si kind="vacation" et que rien n'est précisé :
   → cellColor = "#FFE5E5" (rouge pastel par défaut)
   → pillColor = null
   → Pour les vacances, on n'utilise normalement PAS de pilule, juste un fond de case + label

4. cellColor doit TOUJOURS être un hex de la liste pastel (jamais une couleur vive).

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
  → Si pas de catégorie "vacances" existante, en créer une (cellColor=#FFE5E5, pillColor=null, kind=vacation)
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

ACTIONS :

1. {"type":"create_category","name":"...","pillColor":"#... ou null","cellColor":"#... ou null","kind":"work|vacation|neutral","subkind":"stage|regular|null"}
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
→ create_category(name:"Montalvo", pillColor:"#34C759", cellColor:null, kind:"work", subkind:"stage")
→ add_recurring(categoryName:"Montalvo", weekdays:[3])

"Andro en rose pastel les vendredis"
(pastel pour pilule = OK, c'est la pilule qui est rose pastel)
→ create_category(name:"Andro", pillColor:"#FFD5E5", cellColor:null, kind:"work", subkind:"stage")
→ add_recurring(categoryName:"Andro", weekdays:[4])

"HAD en mauve les lundis, fond lavande pastel"
(le user demande explicitement un fond aussi)
→ create_category(name:"HAD", pillColor:"#A29BFE", cellColor:"#E5DEFF", kind:"work", subkind:"regular")
→ add_recurring(categoryName:"HAD", weekdays:[0])

"Montalvo en vacances du 26/05 au 12/06" (Montalvo existe déjà)
→ add_exceptions_to_category(categoryName:"Montalvo", start:"2026-05-26", end:"2026-06-12")

"vacances du 1 au 6 juillet : Les Ardentes"
→ create_category(name:"vacances", pillColor:null, cellColor:"#FFE5E5", kind:"vacation") si pas existante
→ add_event(categoryName:"vacances", label:"Les Ardentes", startDate:"2026-07-01", endDate:"2026-07-06")

"Andro les 28 mai, 4, 10 et 11 juin"
(Andro existe déjà → c'est juste des événements ponctuels supplémentaires sur cette catégorie)
→ add_event(categoryName:"Andro", label:"Andro", startDate:"2026-05-28")
→ add_event(categoryName:"Andro", label:"Andro", startDate:"2026-06-04")
→ add_event(categoryName:"Andro", label:"Andro", startDate:"2026-06-10")
→ add_event(categoryName:"Andro", label:"Andro", startDate:"2026-06-11")

"Topo le 26/05"
→ create_category(name:"Topo", pillColor:"#007AFF", cellColor:null, kind:"work", subkind:"stage")
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

// Démarrage à froid : vrai uniquement pour la première requête traitée par cette instance.
let warm = false;

// Fonction qui appelle un modèle Gemini donné
async function callGemini(modelName, apiKey, systemPrompt, instruction) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: instruction }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  };
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  let r = await callGemini('gemini-2.5-flash', apiKey, systemPrompt, instruction);

  // 2. Si quota 429, fallback automatique sur Lite
  if (r.status === 429) {
    usedFallback = true;
    r = await callGemini('gemini-2.5-flash-lite', apiKey, systemPrompt, instruction);
  }

  if (!r.ok) {
    const errTxt = await r.text();
    return res.status(502).json({ error: `Gemini ${r.status}: ${errTxt}` });
  }

  const data = await r.json();
  const geminiMs = Date.now() - tGemini;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = text.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return res.status(502).json({ error: 'Réponse IA invalide', raw: cleaned });
  }

  if (!parsed.actions) parsed.actions = [];
  if (!parsed.feedback) parsed.feedback = 'Mis à jour.';
  parsed.usedFallback = usedFallback;
  // Mesures affichées dans Réglages → Diagnostic de vitesse
  parsed.timing = {
    serverMs: Date.now() - tStart,
    geminiMs,
    cold,
    model: usedFallback ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash',
    thoughtsTokens: data.usageMetadata?.thoughtsTokenCount || 0,
    promptTokens: data.usageMetadata?.promptTokenCount || 0,
  };

  return res.status(200).json(parsed);
}

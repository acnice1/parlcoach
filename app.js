// ParlFR — app.js
// Local-first IndexedDB (Dexie); drills first.
// Dataset-first conjugation (top200_french_verbs_conjugations.json) with rule fallbacks.

// =========================== Dexie (IndexedDB) ===============================
if (!window.Dexie) {
  alert('Dexie failed to load. Check your connection or CDN.');
  throw new Error('Dexie missing');
}

const db = new Dexie('parlcoach');
const USE_TOP200_ONLY = true;

/*
 v1 -> initial
 v2 -> adds drill prefs, plan, etc.
 v3 -> add verbs.conj (top-200 integration), translator in settings
*/
db.version(3).stores({
  vocab: '++id,front,back,due,ease,reps,interval,last',
  qa: '++id,createdAt',
  audio: '++id,name,createdAt,size,storage,urlHint',
  verbs: '++id,infinitive,english,*tags',
  settings: 'key',
  plan: 'key',
  drill: 'key'
});

// ============================== OPFS helpers =================================
const opfs = {
  supported: !!(navigator.storage && navigator.storage.getDirectory),
  root: null,
  async ensure(){ if(!this.supported) return null; if(!this.root) this.root = await navigator.storage.getDirectory(); return this.root; },
  async dir(name){ const root = await this.ensure(); if(!root) return null; return await root.getDirectoryHandle(name, { create:true }); },
  async saveFile(path, blob){
    const [dirName, fileName] = path.split('/');
    const dir = await this.dir(dirName); if(!dir) return null;
    const fh = await dir.getFileHandle(fileName, { create:true });
    const w = await fh.createWritable(); await w.write(blob); await w.close(); return fh;
  },
  async readURL(path){
    const [d,f] = path.split('/'); const dir = await this.dir(d); if(!dir) return null;
    const fh = await dir.getFileHandle(f); const file = await fh.getFile(); return URL.createObjectURL(file);
  },
  async delete(path){ const [d,f] = path.split('/'); const dir = await this.dir(d); if(!dir) return false; await dir.removeEntry(f); return true; }
};

// ================================ Utilities ==================================
function todayISO(){ return new Date().toISOString(); }
function toDateOnly(iso){ try{ return new Date(iso).toLocaleDateString(); }catch{ return 'n/a'; } }
function randChoice(a){ return a[Math.floor(Math.random()*a.length)]; }
function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }
function isVowelStart(s){ return /^[aeiouhâêîôûéèëïüAEIOUH]/.test(s||''); }

// Allow skipping subject pronoun (je/j’, tu, il/elle/on, nous, vous, ils/elles)
// Accept optional subject pronoun at the start (je/j’/j', tu, il/elle/on, nous, vous, ils/elles).
// Also tolerates labels like "il/elle" or "ils/elles".
const PRONOUN_RE = /^\s*(?:j’|j'|je|tu|il(?:\/elle)?|elle(?:\/il)?|on|nous|vous|ils(?:\/elles)?|elles(?:\/ils)?)\s+/i;

function normalize(s){
  return (s || '')
    .replace(/\u00A0|\u202F/g, ' ')       // NBSP & narrow no-break space → space
    .replaceAll('’', "'")                 // curly apostrophe → straight
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSubjectPronoun(s){
  return normalize(s).replace(PRONOUN_RE, '').trim();
}

function answersEqual(userInput, expectedFull){
  // Compare exact AND pronoun-stripped forms
  const a = normalize(userInput);
  const b = normalize(expectedFull);
  return a === b || stripSubjectPronoun(a) === stripSubjectPronoun(b);
}


function normalize(s){
  return (s || '')
    .toLowerCase()
    .replaceAll('’', "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSubjectPronoun(s){
  return normalize(s).replace(PRONOUN_RE, '').trim();
}

// one authoritative comparator used everywhere
function answersEqual(userInput, expectedFull){
  const a = normalize(userInput);
  const b = normalize(expectedFull);
  // accept exact match OR match when both sides drop the pronoun
  return a === b || stripSubjectPronoun(a) === stripSubjectPronoun(b);
}


// =============================== Schedulers ==================================
function sm2Schedule(card, q/*0..5*/){
  let ease = card.ease ?? 2.5, reps = card.reps ?? 0, interval = card.interval ?? 0;
  if (q < 3) { reps = 0; interval = 1; }
  else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (ease < 1.3) ease = 1.3;
    reps += 1;
  }
  const now = new Date(); const due = new Date(now); due.setDate(now.getDate()+interval);
  return { ease, reps, interval, due: due.toISOString(), last: now.toISOString() };
}
function fixedSchedule(card, intervalsDays, q){
  let reps = card.reps ?? 0; if (q < 3) reps = 0; else reps += 1;
  const idx = clamp(reps, 0, intervalsDays.length - 1), interval = intervalsDays[idx];
  const now = new Date(); const due = new Date(now); due.setDate(now.getDate()+interval);
  return { ease: 2.5, reps, interval, due: due.toISOString(), last: now.toISOString() };
}

// =========================== Conjugator (fallback) ===========================
const PRONOUNS = ['je','tu','il/elle','nous','vous','ils/elles'];
const PERSON_KEY = ['je','tu','il/elle/on','nous','vous','ils/elles'];
const INTERNAL_TENSES = ['present','passeCompose','imparfait','plusQueParfait','futur','conditionnelPresent','subjonctifPresent','imperatif'];
const DISPLAY_TENSE = {
  present:'Présent', passeCompose:'Passé composé', imparfait:'Imparfait', plusQueParfait:'Plus-que-parfait',
  futur:'Futur simple', conditionnelPresent:'Conditionnel présent', subjonctifPresent:'Subjonctif présent',
  imperatif:'Impératif'
};

// Irregular present (by array per person index 0..5)
const IRREGULAR_PRESENT = {
  'être': ['suis','es','est','sommes','êtes','sont'],
  'avoir': ['ai','as','a','avons','avez','ont'],
  'aller': ['vais','vas','va','allons','allez','vont'],
  'faire': ['fais','fais','fait','faisons','faites','font'],
  'pouvoir': ['peux','peux','peut','pouvons','pouvez','peuvent'],
  'vouloir': ['veux','veux','veut','voulons','voulez','veulent'],
  'devoir': ['dois','dois','doit','devons','devez','doivent'],
  'savoir': ['sais','sais','sait','savons','savez','savent'],
  'venir': ['viens','viens','vient','venons','venez','viennent'],
  'prendre': ['prends','prends','prend','prenons','prenez','prennent'],
  'mettre': ['mets','mets','met','mettons','mettez','mettent'],
  'dire': ['dis','dis','dit','disons','dites','disent'],
  'voir': ['vois','vois','voit','voyons','voyez','voient'],
  // added:
  'tenir': ['tiens','tiens','tient','tenons','tenez','tiennent'],
  'ouvrir': ['ouvre','ouvres','ouvre','ouvrons','ouvrez','ouvrent'],
};

// -ir verbs that take -er endings in the present (and present-based stems)
const ER_LIKE_IR = new Set([
  'ouvrir','couvrir','découvrir','recouvrir','rouvrir','offrir','souffrir'
]);

const IRREGULAR_IMPARFAIT_STEM = { 'être':'ét','avoir':'av','aller':'all','faire':'fais','pouvoir':'pouv','vouloir':'voul','devoir':'dev','savoir':'sav','venir':'ven','prendre':'pren','mettre':'mett','dire':'dis','voir':'voy','tenir':'ten' };
const FUTUR_STEM_IRREG = { 'être':'ser','avoir':'aur','aller':'ir','faire':'fer','pouvoir':'pourr','vouloir':'voudr','devoir':'devr','savoir':'saur','venir':'viendr','prendre':'prendr','mettre':'mettr','dire':'dir','voir':'verr','tenir':'tiendr' };
const IMPARFAIT_END = ['ais','ais','ait','ions','iez','aient'];
const FUTUR_END = ['ai','as','a','ons','ez','ont'];

// === Rulebook integration ===
const RULES_URL = 'french_conjugation_rules.json';

// Map internal keys -> rules JSON keys where they differ
const TENSE_RULE_KEY = {
  present: 'present',
  passeCompose: 'passeCompose',
  imparfait: 'imparfait',
  plusQueParfait: 'plusQueParfait',
  futur: 'futurSimple',
  conditionnelPresent: 'conditionnelPresent',
  subjonctifPresent: 'subjonctifPresent',
  imperatif: 'imperatif'
};

function inferGroup(inf) {
  if (inf.endsWith('er')) return '-er';
  if (inf.endsWith('ir')) return '-ir';
  if (inf.endsWith('re')) return '-re';
  return null; // unknown/irregular container
}

function participePasseRegular(inf){
  if (inf.endsWith('er')) return inf.slice(0,-2)+'é';
  if (inf.endsWith('ir')) return inf.slice(0,-2)+'i';
  if (inf.endsWith('re')) return inf.slice(0,-2)+'u';
  return inf;
}

// Present stems
function presentNousStem(inf){
  if (IRREGULAR_PRESENT[inf]) return IRREGULAR_PRESENT[inf][3].replace(/ons$/,'');
  if (ER_LIKE_IR.has(inf)) return inf.slice(0,-2); // treat like -er
  if (inf.endsWith('ir')) return inf.slice(0,-2)+'iss';
  if (inf.endsWith('er') || inf.endsWith('re')) return inf.slice(0,-2);
  return inf;
}
function presentIlsStem(inf){
  if (IRREGULAR_PRESENT[inf]) return IRREGULAR_PRESENT[inf][5].replace(/ent$/,'');
  return presentRegular(inf, 5).replace(/ent$/,'');
}

// Present forms
function presentRegular(inf,i){
  if (IRREGULAR_PRESENT[inf]) return IRREGULAR_PRESENT[inf][i];
  if (ER_LIKE_IR.has(inf))    return inf.slice(0,-2)+['e','es','e','ons','ez','ent'][i];  // -er endings
  if (inf.endsWith('er'))     return inf.slice(0,-2)+['e','es','e','ons','ez','ent'][i];
  if (inf.endsWith('ir'))     return inf.slice(0,-2)+['is','is','it','issons','issez','issent'][i];
  if (inf.endsWith('re'))     return inf.slice(0,-2)+['s','s','','ons','ez','ent'][i];
  return inf;
}

// Other tenses
function imparfait(inf,i){ return (IRREGULAR_IMPARFAIT_STEM[inf] ?? presentNousStem(inf)) + IMPARFAIT_END[i]; }
function futurSimple(inf,i){ const stem = FUTUR_STEM_IRREG[inf] ?? (inf.endsWith('re') ? inf.slice(0,-1) : inf); return stem + FUTUR_END[i]; }
function subjonctifPresentPlain(inf, i){
  const bootStem = presentIlsStem(inf);   // je/tu/il/ils
  const nousStem = presentNousStem(inf);  // nous/vous
  const ends = ['e','es','e','ions','iez','ent'];
  const useNous = (i === 3 || i === 4);
  const stem = useNous ? nousStem : bootStem;
  return stem + ends[i];
}
function plusQueParfaitPlain(inf,i){
  const avoirImp = ['avais','avais','avait','avions','aviez','avaient'];
  return `${avoirImp[i]} ${participePasseRegular(inf)}`;
}
function passeCompose(inf,i){ const avoir = ['ai','as','a','avons','avez','ont'][i]; const pp = participePasseRegular(inf); return `${avoir} ${pp}`; }

// Minimal EN glosses; add more as you go.
const EN_GLOSS = {
  'manger': 'to eat',
  'parler': 'to speak',
  'finir': 'to finish',
  'vendre': 'to sell',
  'prendre': 'to take',
  'faire': 'to do/make',
  'dire': 'to say/tell',
  'voir': 'to see',
  'savoir': 'to know',
  'pouvoir': 'to be able to / can',
  'devoir': 'to have to / must',
  'aller': 'to go',
  'venir': 'to come',
  'mettre': 'to put',
  'donner': 'to give',
  'aimer': 'to like / to love',
  'appeler': 'to call',
  'trouver': 'to find',
  'comprendre': 'to understand',
  'écrire': 'to write',
  'lire': 'to read',
  'sortir': 'to go out / to take out',
  'partir': 'to leave',
  'rester': 'to stay',
  'arriver': 'to arrive',
  'passer': 'to pass / to spend (time)'
};

function englishGlossDefault(inf){
  return EN_GLOSS[inf] || '';
}

// ===================== Dataset (Top-200) — direct index ======================
const DATASET_URL = 'top200_french_verbs_conjugations.json';
const TENSE_DS_KEY = {
  present: 'Présent',
  imparfait: 'Imparfait',
  passeCompose: 'Passé composé',
  plusQueParfait: 'Plus-que-parfait',
  futur: 'Futur simple',
  conditionnelPresent: 'Conditionnel présent',
  subjonctifPresent: 'Subjonctif présent',
  imperatif: 'Impératif'
};
const PERSON_LABELS = ['je','tu','il/elle/on','nous','vous','ils/elles'];

// ========================= Seed example loader (optional) ====================
// One curated example (il/elle/on) per tense, stored in verbs.top50.json (optional)
const EXTERNAL_VERBS_URL = 'verbs.top50.json?v=1';
const seedVerbsByInf = new Map();
const TENSE_EXAMPLE_KEY = {
  present: 'present',
  passeCompose: 'passeCompose',
  imparfait: 'imparfait',
  plusQueParfait: 'plusQueParfait',
  futur: 'futurSimple',
  conditionnelPresent: 'conditionnelPresent',
  subjonctifPresent: 'subjonctifPresent',
  imperatif: 'imperatif'
};

// ================================ Vue App ====================================
const { createApp, reactive, computed, onMounted, ref, nextTick } = Vue;

createApp({
  setup(){
    const state = reactive({
      jsonEditor: { open:false, verb:null, text:'', readonly:false, error:'' },

      // --- RULES + DATASET ---
      rules: null,
      dataset: null, // Map<infinitive, tensesObj>

      // --- TABS ---
      tab: 'learn',
      learnTab: 'drills', // drills | vocab | myverbs | seedverbs

      // --- VOCAB (SRS) ---
      newVocabFront:'', newVocabBack:'',
      allCards:[], dueCards:[], currentCard:null, showBack:false,
      counts:{ total:0, learned:0 },

      // --- VERBS & DRILLS ---
      verbs: [], // { id, infinitive, english, tags[], conj? }
      newVerb: { infinitive:'', english:'', tags:'' },
      drillPrefs: {
        key: 'v1',
        tenses: ['present','passeCompose','imparfait','plusQueParfait','futur','conditionnelPresent','subjonctifPresent','imperatif'],
        persons: [0,1,2,3,4,5],
        includeOnlyTags: [],
        excludeTags: []
      },
      drillSession: { running:false, question:null, input:'', correct:null, total:0, right:0, history:[], help:null },

      // --- RECORD ---
      isRecording:false, mediaRecorder:null, chunks:[], recordings:[],

      // --- QA ---
      newQA:{ q:'', a:'' },

      // --- PLAN ---
      plan:{ key:'v1', goal:'Government B', dailyMinutes:60, focus:'listening, oral, vocab', weeklySchedule:'', notes:'' },

      // --- SETTINGS ---
      settings:{ key:'v1', srsMode:'SM2', fixedIntervals:[1,3,7,14,30], translator:{ endpoint:'', apiKey:'' } },
      fixedIntervalsText:'1,3,7,14,30',
      storagePersisted:false,
      translator:{ endpoint:'', apiKey:'' }
    });

    const drillInputEl = ref(null);

    const myVerbs = computed(() => state.verbs.filter(v => !(v.tags || []).includes('top200')));
    const seedVerbs = computed(() => state.verbs.filter(v => (v.tags || []).includes('top200')));

    const scoreClass = computed(() => {
      const t = state.drillSession.total || 0;
      const r = state.drillSession.right || 0;
      if (t === 0) return 'default';
      const pct = (r / t) * 100;
      if (pct >= 80) return 'good';
      if (pct >= 50) return 'ok';
      return 'bad';
    });

    // ---------------------------- Load / Save --------------------------------
    async function loadDataset() {
      try {
        const res = await fetch(DATASET_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const index = new Map();
        for (const v of json.verbs || []) index.set(v.verb, v.tenses || {});
        state.dataset = index;
      } catch (e) {
        console.warn('[dataset] load failed:', e);
        state.dataset = null;
      }
    }

    async function loadRules() {
      try {
        const res = await fetch(RULES_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state.rules = await res.json();
      } catch (e) {
        console.warn('[rules] load failed:', e);
        state.rules = null;
      }
    }

    async function loadExternalVerbs(){
      try{
        const res = await fetch(EXTERNAL_VERBS_URL, { cache:'no-store' });
        if(!res.ok) throw new Error(`Failed to load ${EXTERNAL_VERBS_URL}`);
        const list = await res.json();
        seedVerbsByInf.clear();
        list.forEach(v => seedVerbsByInf.set(v.infinitive, v));
        console.info(`[verbs] loaded ${seedVerbsByInf.size} seed example items`);
      } catch(e){
        console.error(e);
        // optional: no alert to avoid noise if file missing
      }
    }

    async function loadAll(){
      await loadDataset();          // <— dataset first
      await loadRules();            // <— rules for help
      await fixBadEnglishGlosses();

      const [settings, plan, drill] = await Promise.all([ db.settings.get('v1'), db.plan.get('v1'), db.drill.get('v1') ]);
      if (settings) {
        state.settings = settings;
        state.fixedIntervalsText = (settings.fixedIntervals || [1,3,7,14,30]).join(',');
        state.translator = settings.translator || { endpoint:'', apiKey:'' };
      } else {
        state.translator = { endpoint:'', apiKey:'' };
      }
      if (plan) state.plan = plan;
      if (drill) state.drillPrefs = { ...state.drillPrefs, ...drill };

      state.allCards = await db.vocab.toArray();
      computeDue();

      await maybeSeedVerbsFromTop200();
      await ensureSeedTaggingAndImport();
      state.verbs = await db.verbs.orderBy('infinitive').toArray();

      await loadExternalVerbs();
      state.recordings = await loadRecordings();
    }

    async function saveSettings(){ await db.settings.put({ ...state.settings, translator: state.translator }); }
    async function savePlan(){ await db.plan.put(state.plan); }
    async function saveDrillPrefs(){ await db.drill.put(state.drillPrefs); }

    // ----------------------------- VOCAB (SRS) -------------------------------
    function computeDue(){
      const now = Date.now();
      state.counts.total = state.allCards.length;
      state.counts.learned = state.allCards.filter(c => new Date(c.due).getTime() > now && (c.reps ?? 0) >= 2).length;
      state.dueCards = state.allCards.filter(c => new Date(c.due).getTime() <= now).sort((a,b)=>new Date(a.due)-new Date(b.due));
      state.currentCard = state.dueCards[0] || null;
      state.showBack = false;
    }
    async function addCard(){
      const front = state.newVocabFront.trim(), back = state.newVocabBack.trim();
      if (!front || !back) return;
      const now = todayISO();
      const id = await db.vocab.add({ front, back, due: now, ease: 2.5, reps: 0, interval: 0, last: now });
      state.allCards.push({ id, front, back, due: now, ease: 2.5, reps: 0, interval: 0, last: now });
      state.newVocabFront=''; state.newVocabBack=''; computeDue();
    }
    async function rate(q){
      if (!state.currentCard) return;
      const c = state.currentCard;
      const upd = (state.settings.srsMode==='SM2') ? sm2Schedule(c,q) : fixedSchedule(c, state.settings.fixedIntervals||[1,3,7,14,30], q);
      Object.assign(c, upd); await db.vocab.update(c.id, upd); computeDue();
    }
    async function deleteCard(id){ await db.vocab.delete(id); state.allCards = state.allCards.filter(c=>c.id!==id); computeDue(); }
    function updateFixedIntervals(){
      const parts = state.fixedIntervalsText.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>!Number.isNaN(n)&&n>0);
      state.settings.fixedIntervals = parts.length ? parts : [1,3,7,14,30]; saveSettings();
    }

    // ---------------------- VERBS: seed/import & CRUD ------------------------
    // Loader for the same top200 file to seed DB if empty, preserving your existing flow
    async function loadTop200JSON(){
      const url = './top200_french_verbs_conjugations.json?ts=' + Date.now();
      try {
        const res = await fetch(url, { cache:'no-store', headers:{ 'accept':'application/json, text/plain;q=0.6, */*;q=0.5' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ct = (res.headers.get('content-type')||'').toLowerCase();
        const data = ct.includes('application/json') ? await res.json() : JSON.parse(await res.text());
        return data;
      } catch (e) {
        console.warn('[Top200] Fetch failed:', e.message);
      }
      const tag = document.getElementById('top200-json');
      if (tag?.textContent) {
        try { const inline = JSON.parse(tag.textContent); return inline; }
        catch (e) { console.error('[Top200] Inline JSON parse failed:', e.message); }
      }
      console.error('[Top200] No dataset available. Ensure JSON is next to index.html and served over HTTP.');
      return null;
    }

    async function loadTop200AndNormalize(){
      const data = await loadTop200JSON(); if (!data) return [];
      const arr = Array.isArray(data?.verbs) ? data.verbs : []; if (!arr.length) return [];
      return arr.map(v => {
        const inf = (v.verb || '').trim(); const conj = v.tenses || {};
        return { infinitive: inf, english: englishGlossDefault(inf), tags: ['top200'], conj };
      });
    }
  async function maybeSeedVerbsFromTop200(){
  const count = await db.verbs.count();
  if (count > 0) return;

  let rows = [];
  try { rows = await loadTop200AndNormalize(); } catch (e) { console.warn('[Top200] loader crashed:', e); }
  if (rows.length) {
    await db.verbs.bulkAdd(rows);
  } else {
    console.warn('[Top200] No dataset rows available; verbs table will remain empty.');
  }
}

    async function ensureSeedTaggingAndImport(){
      const all = await db.verbs.toArray();
      let seedCount = all.filter(v => (v.tags || []).includes('top200')).length;
      if (seedCount > 0) return;

      // 1) Backfill 'top200' on rows that have a conj blob
      let modified = 0;
      for (const v of all) {
        if (v && v.conj && typeof v.conj === 'object') {
          const tags = Array.isArray(v.tags) ? v.tags.slice() : [];
          if (!tags.includes('top200')) { tags.push('top200'); await db.verbs.update(v.id, { tags }); modified++; }
        }
      }
      if (modified > 0) return;

      // 2) Merge (re)import
      const rows = await loadTop200AndNormalize();
      if (!rows.length) return;
      const byInf = new Map(all.map(v => [v.infinitive, v]));
      for (const r of rows) {
        const existing = byInf.get(r.infinitive);
        if (existing) {
          const tags = Array.from(new Set([...(existing.tags || []), 'top200']));
          await db.verbs.update(existing.id, { tags, conj: r.conj, english: existing.english || r.english });
        } else {
          await db.verbs.add(r);
        }
      }
    }

    async function addVerb(){
      const inf = state.newVerb.infinitive.trim(); if (!inf) return;
      const english = state.newVerb.english.trim() || englishGlossDefault(inf);
      const tags = (state.newVerb.tags||'').split(',').map(s=>s.trim()).filter(Boolean);
      const id = await db.verbs.add({ infinitive: inf, english, tags, conj: null });
      state.verbs = await db.verbs.orderBy('infinitive').toArray();
      state.newVerb = { infinitive:'', english:'', tags:'' }; return id;
    }
    async function deleteVerb(v){ await db.verbs.delete(v.id); state.verbs = state.verbs.filter(x=>x.id!==v.id); }

    // ------------------------------- DATA LOOKUPS -----------------------------
    // Prefer in-memory dataset; if not found, try DB row's conj; else null
    function getConjFromDatasetFirst(inf, tenseId, personIndex){
      // 1) in-memory dataset from top200 file
      if (state.dataset) {
        const tenses = state.dataset.get(inf);
        if (tenses) {
          const block = tenses[TENSE_DS_KEY[tenseId] || tenseId];
          if (block) {
            const form = block[PERSON_LABELS[personIndex]];
            if (typeof form === 'string' && form.trim() !== '') return form.trim(); // NOTE: plain form (no pronoun)
          }
        }
      }
      // 2) DB-stored conj blob (same shape as dataset)
      const row = state.verbs.find(v => v.infinitive === inf);
      if (row && row.conj) {
        const tenseName = DISPLAY_TENSE[tenseId] || tenseId;
        const block = row.conj[tenseName];
        if (block) {
          const key = (personIndex === 2) ? 'il/elle/on' : PERSON_KEY[personIndex];
          const form = block[key];
          if (typeof form === 'string' && form.trim() !== '') return form.trim();
        }
      }
      return null;
    }

    function makeFullAnswer(tenseId, personIndex, plainForm){
      if (tenseId === 'imperatif') return plainForm; // no subject
      const subj = PRONOUNS[personIndex];
      if (personIndex===0) return isVowelStart(plainForm) ? `j'${plainForm}` : `je ${plainForm}`;
      return `${subj} ${plainForm}`;
    }
    function prettyTense(t){ return DISPLAY_TENSE[t] || t; }

    // Prefer a user-edited verb in Dexie if you later add examples there; else seed
    function resolveVerbExamples(infinitive){
      const seed = seedVerbsByInf.get(infinitive);
      return seed?.examples || null;
    }
    function getExample(infinitive, internalTenseKey){
      const examples = resolveVerbExamples(infinitive);
      if (!examples) return null;
      const key = TENSE_EXAMPLE_KEY[internalTenseKey] || internalTenseKey;
      const ex = examples[key];
      return (ex && ex.fr && ex.en) ? ex : null;
    }

    // ------------------------------- DRILLS ----------------------------------
  function filterVerbsForDrill(list){
  // Only verbs that exist in the Top-200 dataset (by infinitive) or are tagged top200
  const onlyTop200 = list.filter(v =>
    (state.dataset && state.dataset.has(v.infinitive)) ||
    (v.tags || []).includes('top200')
  );

  const { includeOnlyTags, excludeTags } = state.drillPrefs;
  let out = onlyTop200;

  if (includeOnlyTags?.length) out = out.filter(v => (v.tags || []).some(t => includeOnlyTags.includes(t)));
  if (excludeTags?.length) out = out.filter(v => !(v.tags || []).some(t => excludeTags.includes(t)));

  return out;
}


    function conjugateFromAny(verbRow, tense, personIndex){
      // 0) dataset/plain form first (top200 file or DB conj)
      const dsPlain = getConjFromDatasetFirst(verbRow.infinitive, tense, personIndex);
      if (dsPlain) return makeFullAnswer(tense, personIndex, dsPlain);

      // 1) rule-based fallback
      let plain = '';
      switch (tense) {
        case 'present': plain = presentRegular(verbRow.infinitive, personIndex); break;
        case 'imparfait': plain = imparfait(verbRow.infinitive, personIndex); break;
        case 'futur': plain = futurSimple(verbRow.infinitive, personIndex); break;
        case 'passeCompose': plain = passeCompose(verbRow.infinitive, personIndex); break;
        case 'plusQueParfait': plain = plusQueParfaitPlain(verbRow.infinitive, personIndex); break;
        case 'conditionnelPresent': {
          const fs = futurSimple(verbRow.infinitive, personIndex);
          const ends = ['ais','ais','ait','ions','iez','aient'];
          plain = fs.replace(/(ai|as|a|ons|ez|ont)$/, ends[personIndex]); break;
        }
        case 'subjonctifPresent': plain = subjonctifPresentPlain(verbRow.infinitive, personIndex); break;
        case 'imperatif': return presentRegular(verbRow.infinitive, personIndex);
        default: plain = presentRegular(verbRow.infinitive, personIndex);
      }
      return makeFullAnswer(tense, personIndex, plain);
    }

    function buildRuleHelp(verbRow, tense, personIndex) {
      const R = state.rules;
      if (!R) return null;

      const lines = [];
      const groupKey = inferGroup(verbRow.infinitive);
      const tenseKey = TENSE_RULE_KEY[tense] || tense;

      // 0) Tense-level description + explanation (ALL tenses if present)
      const tObj = R.tenses?.[tenseKey];
      if (tObj?.description) lines.push(tObj.description);
      if (tObj?.explanation) lines.push(`Explanation: ${tObj.explanation}`);

      // 0.1) Targeted "how-to" if sample lookup exists for this person+verb+tense
      const personStr = PERSON_KEY[personIndex];
      const targetedKey = `${personStr}+${verbRow.infinitive}+${tenseKey}`;
      const targeted = R.sample_lookups?.[targetedKey];
      if (targeted) {
        if (targeted.how_to) lines.push(`How-to: ${targeted.how_to}`);
        if (targeted.correct_form_example) lines.push(`Example: ${targeted.correct_form_example}`);
      }

      // 0.2) Show dataset authoritative form (if present)
      const dsForm = getConjFromDatasetFirst(verbRow.infinitive, tense, personIndex);
      if (dsForm) lines.push(`Dataset form: ${personStr} ${dsForm}`);

      // 1) Quick template (high-level reminder)
      const quick = R.quick_help_templates?.[tenseKey];
      if (quick) lines.push(quick);

      // 2) Group-specific stem + endings (simple tenses)
      if (['present','imparfait','futur','conditionnelPresent','subjonctifPresent','imperatif'].includes(tense)) {
        if (tense === 'present' && groupKey && R.tenses?.present?.formation?.[groupKey]) {
          const g = R.groups?.[groupKey];
          const f = R.tenses.present.formation[groupKey];
          const ending = f.endings?.[personStr];
          if (g?.stem_rule) lines.push(`Group: ${g.name} — ${g.stem_rule}`);
          if (ending != null) lines.push(`Ending for “${personStr}”: “${ending || '∅'}”`);
          if (R.tenses.present?.notes?.length) {
            if (personIndex === 0 && isVowelStart(verbRow.infinitive)) {
              lines.push(R.orthography?.je_elision || "Use “j’” before vowel/mute h.");
            }
          }
        } else if (tense === 'imparfait' && R.tenses?.imparfait) {
          lines.push(R.tenses.imparfait.stem_rule);
          const end = R.tenses.imparfait.endings?.[personIndex];
          if (end) lines.push(`Imparfait ending for “${personStr}”: “${end}”`);
        } else if (tense === 'futur' && R.tenses?.futurSimple) {
          lines.push(R.tenses.futurSimple.stem_rule);
          const end = R.tenses.futurSimple.endings?.[personStr];
          if (end) lines.push(`Futur ending for “${personStr}”: “${end}”`);
        } else if (tense === 'conditionnelPresent' && R.tenses?.conditionnelPresent) {
          lines.push(R.tenses.conditionnelPresent.stem_rule);
          const end = R.tenses.conditionnelPresent.endings?.[personStr];
          if (end) lines.push(`Conditionnel ending for “${personStr}”: “${end}”`);
        } else if (tense === 'subjonctifPresent' && R.tenses?.subjonctifPresent) {
          lines.push(R.tenses.subjonctifPresent.stem_rule);
          const srEnd = (R.endings_reference?.subjonctifPresent || [])[personIndex];
          if (srEnd) lines.push(`Subjonctif ending for “${personStr}”: “${srEnd}”`);
        } else if (tense === 'imperatif' && R.tenses?.imperatif) {
          lines.push(R.tenses.imperatif.description);
          const g = groupKey && R.tenses.imperatif.formation?.[groupKey];
          if (g) {
            const iperson = ['tu','nous','vous'][personIndex === 2 ? 0 : (personIndex === 3 ? 1 : (personIndex === 4 ? 2 : -1))];
            if (iperson && g[iperson]) lines.push(`Imperative (“${iperson}”): ${g[iperson]}`);
          }
          if (R.orthography?.imperatif_pronoun_drop) lines.push(R.orthography.imperatif_pronoun_drop);
        }
      }

      // 3) Compound tenses (passé composé / plus-que-parfait)
      if (['passeCompose','plusQueParfait'].includes(tense)) {
        const isPC = tense === 'passeCompose';
        const T = isPC ? R.tenses.passeCompose : R.tenses.plusQueParfait;
        const tenseName = isPC ? 'Passé composé' : 'Plus-que-parfait';
        lines.push(T.description || `${tenseName}: auxiliary + past participle.`);

        const tpl = T.templates?.avoir?.[personStr] || null;
        const gKey = inferGroup(verbRow.infinitive);
        const ppSuffix = gKey && R.participles?.formation?.[gKey];

        if (tpl && ppSuffix) {
          const participle = verbRow.infinitive.slice(0, -2) + ppSuffix;
          const example = tpl.replace('{participle}', participle);
          lines.push(`Example: ${example}`);
          lines.push(`Past participle rule: replace “${gKey}” with “${ppSuffix}”.`);
        }
        if (T.formation?.auxiliary) lines.push(`Auxiliary used: ${T.formation.auxiliary}.`);
        if (T.agreement) lines.push(`Agreement rule: ${T.agreement}`);
      }

      // 4) Spelling hints for -cer/-ger in present/imparfait nous
      if ((tense === 'present' || tense === 'imparfait') && R.orthography?.c_g_spelling && (verbRow.infinitive.endsWith('cer') || verbRow.infinitive.endsWith('ger'))) {
        lines.push(R.orthography.c_g_spelling);
      }

      return { lines };
    }

    function exampleSentence(){ return null; }

   function newDrillQuestion(){
  let pool = filterVerbsForDrill(state.verbs);

  // If user has no verb rows yet, but dataset is loaded, build a pool from dataset keys
  if (USE_TOP200_ONLY && (!pool.length) && state.dataset && state.dataset.size > 0) {
    const infs = [...state.dataset.keys()];
    pool = infs.map(inf => ({
      id: 0,
      infinitive: inf,
      english: englishGlossDefault(inf),
      tags: ['top200'],
      conj: null
    }));
  }

  if (!pool.length) return null;

  const verb = randChoice(pool);
  const tensesPool   = state.drillPrefs.tenses.length   ? state.drillPrefs.tenses   : ['present'];
  const personsPool  = state.drillPrefs.persons.length  ? state.drillPrefs.persons  : [0,1,2,3,4,5];
  const tense = randChoice(tensesPool), personIndex = randChoice(personsPool);

  const answer = conjugateFromAny(verb, tense, personIndex);
  const prompt = { infinitive: verb.infinitive, english: verb.english, tense, personIndex,
    label: `${PRONOUNS[personIndex]} — ${verb.infinitive} — ${prettyTense(tense)}` };

  const ex = getExample(verb.infinitive, tense);
  return { verb, prompt, answer, ex };
}

    function startDrill(){
      state.drillSession = { running:true, question:newDrillQuestion(), input:'', correct:null, total:0, right:0, history:[], help:null };
      if (!state.drillSession.question) { alert('No verbs available for drill. Add some first.'); state.drillSession.running=false; return; }
      nextTick(()=>drillInputEl.value?.focus());
    }

  function checkDrill() {
  if (!state.drillSession.running || !state.drillSession.question) return;

  // 🚧 ignore extra checks during the 2s "Correct!" window
  if (state.drillSession.correct === true) return;

  const expected = state.drillSession.question.answer; // full form (may include pronoun)
  const given    = state.drillSession.input;

  const ok = answersEqual(given, expected);

  state.drillSession.total += 1;
  if (ok) state.drillSession.right += 1;
  state.drillSession.correct = ok;

  if (!ok) {
    const q = state.drillSession.question;
    state.drillSession.help = buildRuleHelp(q.verb, q.prompt.tense, q.prompt.personIndex);
    // keep focus so Enter on the correction always hits checkDrill()
    Vue.nextTick(() => drillInputEl.value?.focus());
  } else {
    state.drillSession.help = null;
    setTimeout(() => { nextDrill(); }, 2000);
  }

  state.drillSession.history.unshift({
    at: todayISO(),
    prompt: state.drillSession.question.prompt,
    expected,
    got: given,
    ok
  });
}



    function nextDrill(){
      state.drillSession.input=''; state.drillSession.correct=null;
      state.drillSession.help = null;

      state.drillSession.question = newDrillQuestion();
      if (!state.drillSession.question) { alert('No verbs available for drill. Add some first.'); state.drillSession.running=false; return; }
      nextTick(()=>drillInputEl.value?.focus());
    }
    function stopDrill(){ state.drillSession.running=false; }

    // -------------------------- RECORDING / QA / ETC -------------------------
    async function startRecording(){
      if (!navigator.mediaDevices?.getUserMedia) { alert('MediaDevices API not supported.'); return; }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.chunks = [];
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mr.ondataavailable = e => { if (e.data.size > 0) state.chunks.push(e.data); };
      mr.onstop = async () => { const blob = new Blob(state.chunks, { type: 'audio/webm' }); await saveRecording(blob); state.isRecording = false; };
      mr.start(); state.mediaRecorder = mr; state.isRecording = true;
    }
    function stopRecording(){ if (state.mediaRecorder && state.isRecording) state.mediaRecorder.stop(); }
    async function saveRecording(blob){
      const ts = new Date().toISOString().replace(/[:.]/g,'-'); const name = `rec-${ts}.webm`;
      let storage='idb', url=null;
      try { if (opfs.supported) { const fh=await opfs.saveFile(`audio/${name}`, blob); if (fh){ const file=await fh.getFile(); url=URL.createObjectURL(file); storage='opfs'; } } }
      catch(e){ console.warn('OPFS save failed, fallback to IDB URL:', e); }
      if (!url) url = URL.createObjectURL(blob);
      const id = await db.audio.add({ name, createdAt: todayISO(), size: blob.size, storage, urlHint: storage==='opfs' ? `opfs:audio/${name}` : '' });
      state.recordings.unshift({ id, name, size: blob.size, storage, url });
    }
    async function loadRecordings(){
      const rows = await db.audio.orderBy('createdAt').reverse().toArray(); const out=[];
      for (const r of rows) {
        let url=''; if (r.storage==='opfs' && r.urlHint?.startsWith('opfs:')) { try { url = await opfs.readURL(r.urlHint.slice(5)); } catch { url=''; } }
        if (!url) url = r.url || ''; out.push({ ...r, url });
      }
      return out;
    }
    async function deleteRecording(r){
      if (r.storage==='opfs' && r.urlHint?.startsWith('opfs:')) { try { await opfs.delete(r.urlHint.slice(5)); } catch {} }
      await db.audio.delete(r.id); state.recordings = state.recordings.filter(x=>x.id!==r.id);
    }
    async function saveQA(){ const q=(state.newQA.q||'').trim(), a=(state.newQA.a||'').trim(); if (!q && !a) return; await db.qa.add({ q,a,createdAt:todayISO() }); state.newQA.q=''; state.newQA.a=''; alert('Saved.'); }
    async function requestPersistence(){ if (!navigator.storage?.persist){ alert('Persistence API not available.'); return; } const g=await navigator.storage.persist(); state.storagePersisted=g; if (!g) alert('Persistence not granted by the browser.'); }
    async function exportData(){
      const [vocab, qa, audio, settings, plan, verbs, drill] = await Promise.all([
        db.vocab.toArray(), db.qa.toArray(), db.audio.toArray(), db.settings.toArray(), db.plan.toArray(), db.verbs.toArray(), db.drill.toArray()
      ]);
      const payload = { version:3, vocab, qa, audioMeta: audio, settings, plan, verbs, drill };
      const blob = new Blob([JSON.stringify(payload,null,2)], { type:'application/json' });
      const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`parlcoach-export-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
    }
    async function importData(ev){
      const file = ev.target.files?.[0]; if (!file) return;
      const text = await file.text(); let json; try { json = JSON.parse(text); } catch { alert('Invalid JSON'); return; }
      if (!json || !json.version) { alert('Invalid export file'); return; }
      await db.transaction('rw', db.vocab, db.qa, db.audio, db.settings, db.plan, db.verbs, db.drill, async ()=>{
        await db.vocab.clear(); await db.qa.clear(); await db.audio.clear(); await db.settings.clear(); await db.plan.clear(); await db.verbs.clear(); await db.drill.clear();
        if (Array.isArray(json.vocab)) await db.vocab.bulkAdd(json.vocab);
        if (Array.isArray(json.qa)) await db.qa.bulkAdd(json.qa);
        if (Array.isArray(json.audioMeta)) await db.audio.bulkAdd(json.audioMeta);
        if (Array.isArray(json.settings)) await db.settings.bulkAdd(json.settings);
        if (Array.isArray(json.plan)) await db.plan.bulkAdd(json.plan);
        if (Array.isArray(json.verbs)) await db.verbs.bulkAdd(json.verbs);
        if (Array.isArray(json.drill)) await db.drill.bulkAdd(json.drill);
      });
      await loadAll(); alert('Import complete.');
    }
    async function simulateSyncPush(){ alert('Simulated: pushed local changes.'); }
    async function simulateSyncPull(){ state.allCards = await db.vocab.toArray(); state.verbs = await db.verbs.orderBy('infinitive').toArray(); computeDue(); alert('Simulated: pulled remote changes (refreshed).'); }
    async function saveTranslator(){ state.settings.translator = { ...state.translator }; await saveSettings(); alert('Translator settings saved locally.'); }

    // ---------------------------- JSON Editor (verbs.conj) --------------------
    function openJsonEditor(verb, readonly=false){
      state.jsonEditor.open = true;
      state.jsonEditor.verb = verb;
      state.jsonEditor.readonly = !!readonly;
      const safe = (verb.conj && typeof verb.conj === 'object') ? verb.conj : {};
      state.jsonEditor.text = JSON.stringify(safe, null, 2);
      state.jsonEditor.error = '';
    }
    function closeJsonEditor(){
      state.jsonEditor.open = false;
      state.jsonEditor.verb = null;
      state.jsonEditor.text = '';
      state.jsonEditor.error = '';
    }
    function prettyJson(){
      try{ const obj = JSON.parse(state.jsonEditor.text); state.jsonEditor.text = JSON.stringify(obj, null, 2); state.jsonEditor.error=''; }
      catch(e){ state.jsonEditor.error = 'Invalid JSON: ' + e.message; }
    }
    async function saveJsonEditor(){
      if (!state.jsonEditor.verb) return;
      try{
        const obj = JSON.parse(state.jsonEditor.text);
        await db.verbs.update(state.jsonEditor.verb.id, { conj: obj });
        const fresh = await db.verbs.get(state.jsonEditor.verb.id);
        const idx = state.verbs.findIndex(v => v.id === state.jsonEditor.verb.id);
        if (idx >= 0) state.verbs[idx] = fresh;
        closeJsonEditor();
      } catch(e){
        state.jsonEditor.error = 'Invalid JSON: ' + e.message;
      }
    }
    async function clearConj(){
      if (!state.jsonEditor.verb) return;
      await db.verbs.update(state.jsonEditor.verb.id, { conj: null });
      const idx = state.verbs.findIndex(v => v.id === state.jsonEditor.verb.id);
      if (idx >= 0) state.verbs[idx].conj = null;
      state.jsonEditor.text = '{}';
    }
    async function fixBadEnglishGlosses(){
      const all = await db.verbs.toArray();
      for (const v of all) {
        const bad = 'to ' + (v.infinitive.endsWith('er')||v.infinitive.endsWith('ir')||v.infinitive.endsWith('re')
          ? v.infinitive.slice(0,-2) : v.infinitive);
        const good = EN_GLOSS[v.infinitive] || '';
        if (v.english === bad || (v.english && /^(to\s+[a-z]{2,}|to\s*$)/i.test(v.english) && good)) {
          await db.verbs.update(v.id, { english: good });
        }
      }
    }

    function conjSkeletonBlank(){
      const persons = ['je','tu','il/elle/on','nous','vous','ils/elles'];
      const tenses = ['Présent','Passé composé','Imparfait','Plus-que-parfait','Futur simple','Conditionnel présent','Subjonctif présent','Impératif'];
      const base = {};
      for (const t of tenses){ base[t] = {}; for (const p of persons) base[t][p] = ''; }
      return base;
    }
    function conjSkeletonPresentOnly(){
      return { 'Présent': { 'je':'','tu':'','il/elle/on':'','nous':'','vous':'','ils/elles':'' } };
    }
    function insertConjSkeleton(which){
      if (state.jsonEditor.readonly) return;
      const current = (()=>{ try{ return JSON.parse(state.jsonEditor.text||'{}'); }catch{ return {}; }})();
      let add={}; if (which==='blank') add = conjSkeletonBlank(); if (which==='present') add = conjSkeletonPresentOnly();
      const merged = { ...add, ...current };
      state.jsonEditor.text = JSON.stringify(merged, null, 2);
    }

    // ------------------------------ Expose -----------------------------------
    onMounted(loadAll);
    const api = {
      // state & derived
      ...Vue.toRefs(state), myVerbs, seedVerbs, drillInputEl, scoreClass,

      // utils
      toDateOnly, prettyTense,

      // vocab
      addCard, rate, deleteCard, updateFixedIntervals,

      // json editor
      openJsonEditor, closeJsonEditor, prettyJson, saveJsonEditor, clearConj, insertConjSkeleton,

      // verbs
      addVerb, deleteVerb,

      // drills
      startDrill, checkDrill, nextDrill, stopDrill,

      // audio
      startRecording, stopRecording, deleteRecording,

      // QA
      saveQA,

      // settings
      requestPersistence, exportData, importData, savePlan, saveSettings, saveDrillPrefs,
      simulateSyncPush, simulateSyncPull, saveTranslator
    };
    window.debugSeed = { ensureSeedTaggingAndImport, loadTop200JSON, loadExternalVerbs, getExample };
    return api;
  }
}).mount('#app');

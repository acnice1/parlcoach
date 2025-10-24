// ParlFR — app.js (INTEGRATED: Vocab Notes + SRS tags + existing drills)
// Local-first IndexedDB (Dexie); drills are dataset-only.
// Conjugations, examples, and English glosses are pulled ONLY from
// top200_french_verbs_collated.json. No rule-based fallbacks for answers.

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
 v4 -> ADD vocab_notes store; add *tags index to vocab for tag filtering (Option B)
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

db.version(4).stores({
  // add tags index to vocab, add vocab_notes store
  vocab: '++id,front,back,due,ease,reps,interval,last,*tags',
  qa: '++id,createdAt',
  audio: '++id,name,createdAt,size,storage,urlHint',
  verbs: '++id,infinitive,english,*tags',
  settings: 'key',
  plan: 'key',
  drill: 'key',
  vocab_notes: '++id,french,english,partOfSpeech,gender,topic,*tags'
}).upgrade(async (tx) => {
  try {
    const table = tx.table('vocab');
    const rows = await table.toArray();
    for (const r of rows) {
      if (!Array.isArray(r.tags)) await table.update(r.id, { tags: [] });
    }
  } catch (e) {
    console.warn('v4 upgrade note:', e);
  }
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

// Accept optional subject pronoun at the start (j’/j', je, tu, il/elle/on, nous, vous, ils/elles)
const PRONOUN_RE = /^\s*(?:(?:j’|j')|je\s+|tu\s+|il(?:\/elle)?\s+|elle(?:\/il)?\s+|on\s+|nous\s+|vous\s+|ils(?:\/elles)?\s+|elles(?:\/ils)?\s+)/i;

function normalize(s){
  return (s || '')
    .replace(/\u00A0|\u202F/g, ' ')
    .replaceAll('’', "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
function stripSubjectPronoun(s){
  return normalize(s).replace(PRONOUN_RE, '').trim();
}
function answersEqual(userInput, expectedFull){
  const a = normalize(userInput);
  const b = normalize(expectedFull);
  return a === b || stripSubjectPronoun(a) === stripSubjectPronoun(b);
}
function normalizeStr(s){ return (s ?? '').toString().trim(); }
function normalizeTags(raw){
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(t => normalizeStr(t)).filter(Boolean);
  if (typeof raw === 'string') return raw.split(',').map(t => t.trim()).filter(Boolean);
  return [];

}
// --- Normalize a value into an array of tags ---
function toArr(v) {
  return Array.isArray(v) ? v
    : typeof v === 'string'
      ? v.split(',').map(s => s.trim()).filter(Boolean)
      : [];
}

// --- Make a plain, cloneable object (no Vue proxies) ---
function toPlain(obj) {
  // If structuredClone exists, prefer it; otherwise JSON trick.
  try {
    // If Vue is in scope, strip reactivity first
    const raw = (typeof Vue !== 'undefined' && Vue.toRaw) ? Vue.toRaw(obj) : obj;
    return typeof structuredClone === 'function'
      ? structuredClone(raw)
      : JSON.parse(JSON.stringify(raw));
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
}

function days(n) { return n * 24 * 60 * 60 * 1000; }

// --- Verb grouping & regularity helpers ---
const IRREGULAR_SET = new Set([
  'être','avoir','aller','faire','pouvoir','vouloir','devoir','savoir','venir','tenir',
  'prendre','mettre','dire','voir','ouvrir','offrir','souffrir','recevoir','vivre',
  'écrire','lire','dormir','sortir','partir','mourir','naître','connaître',
  'croire','courir','boire','envoyer','falloir','pleuvoir','valoir'
]);

function groupOfInf(inf) {
  if (inf.endsWith('er')) return 'er';
  if (inf.endsWith('ir')) return 'ir';
  if (inf.endsWith('re')) return 're';
  return 'other';
}

function isIrregularVerbRow(v) {
  // Tag wins if present
  if ((v.tags || []).includes('irregular')) return true;
  // Known irregulars set
  if (IRREGULAR_SET.has(v.infinitive)) return true;
  // Heuristic: verbs not ending in -er/-ir/-re are "irregular/other"
  const g = groupOfInf(v.infinitive);
  return g === 'other';
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

// =========================== Dataset-only Conjugation ========================
const PRONOUNS = ['je','tu','il/elle','nous','vous','ils/elles'];
const PERSON_KEY = ['je','tu','il/elle/on','nous','vous','ils/elles'];
const INTERNAL_TENSES = ['present','passeCompose','imparfait','plusQueParfait','futur','conditionnelPresent','subjonctifPresent','imperatif'];
const DISPLAY_TENSE = {
  present:'Présent', passeCompose:'Passé composé', imparfait:'Imparfait', plusQueParfait:'Plus-que-parfait',
  futur:'Futur simple', conditionnelPresent:'Conditionnel présent', subjonctifPresent:'Subjonctif présent',
  imperatif:'Impératif'
};

// ===================== Dataset (Top-200) — single collated file ==============
const COLLATED_URL = 'top200_french_verbs_collated.json';
const RULES_URL = 'verb_conjugation_rules.json'; // optional (text-only help)

// --- Fixed list of tag pills you want to show ---
const TAG_PILL_OPTIONS = [
  'Top30',
  'auxiliary',
  'irregular',
  'very-common',
  'state-of-being',
  'vandertramp'
  // add/remove as you like
];


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
const TENSE_EXAMPLE_KEY = {
  present: 'present',
  passeCompose: 'passeCompose',
  imparfait: 'imparfait',
  plusQueParfait: 'plusQueParfait',
  futur: 'futurSimple',              // futur -> futurSimple in JSON
  conditionnelPresent: 'conditionnelPresent',
  subjonctifPresent: 'subjonctifPresent',
  imperatif: 'imperatif'
};
const TENSE_RULE_KEY = { ...TENSE_EXAMPLE_KEY };

// cache for examples/translations lookups
let VERB_DATA_CACHE = null;
const seedVerbsByInf = new Map();

// Fallback English if missing in JSON
function englishGlossDefault(inf) { return ''; }

// ================================ Vue App ====================================
const { createApp, reactive, computed, onMounted, ref, nextTick } = Vue;

createApp({
  setup(){
    const state = reactive({
      jsonEditor: { open:false, verb:null, text:'', readonly:false, error:'' },
      showEnglishTranslation: true,

      // RULES + DATASET
      rules: null,
      dataset: null,

      // TABS
      tab: 'learn',
      learnTab: 'drills', // drills | vocab | myverbs | seedverbs

      // VOCAB (SRS)
      newVocabFront:'', newVocabBack:'',
      allCards:[], dueCards:[], currentCard:null, showBack:false,
      counts:{ total:0, learned:0 },

      // NEW: tags + notes for Option B
      vocabTagFilter: '',       // filter SRS cards by tag
      notes: [],                // rich notes list
      notesTagFilter: '',       // filter notes by tag

      // VERBS & DRILLS
      verbs: [],
      newVerb: { infinitive:'', english:'', tags:'' },
      drillPrefs: {
        key: 'v1',
        tenses: ['present','passeCompose','imparfait','plusQueParfait','futur','conditionnelPresent','subjonctifPresent','imperatif'],
        persons: [0,1,2,3,4,5],
        includeOnlyTags: [],
        excludeTags: [],
        autoNext: true,
        filterGroups: ['er','ir','re'],    // multi-select; default to the big three
        regularity: 'any'                     // 'any' | 'regular' | 'irregular'
      },
      drillSession: {
        running:false, question:null, input:'', correct:null, total:0, right:0,
        history:[], help:null,
        side: { english:'—', fr:'—', en:'—' }
      },

      // RECORD
      isRecording:false, mediaRecorder:null, chunks:[], recordings:[],

      // QA
      newQA:{ q:'', a:'' },

      
      // PLAN
      plan:{ key:'v1', goal:'Government B', dailyMinutes:60, focus:'listening, oral, vocab', weeklySchedule:'', notes:'' },

      // SETTINGS
      settings:{ key:'v1', srsMode:'SM2', fixedIntervals:[1,3,7,14,30], translator:{ endpoint:'', apiKey:'' } },
      fixedIntervalsText:'1,3,7,14,30',
      storagePersisted:false,
      translator:{ endpoint:'', apiKey:'' }
    });

    const drillInputEl = ref(null);

    const myVerbs = computed(() => state.verbs.filter(v => !(v.tags || []).includes('top200')));
    const seedVerbs = computed(() => state.verbs.filter(v => (v.tags || []).includes('top200')));

    // Fixed set you control (not auto-collected)
const tagPills = Vue.ref(TAG_PILL_OPTIONS.slice());

// Toggle include
function toggleIncludeTag(tag){
  const curr = Array.isArray(state.drillPrefs.includeOnlyTags) ? state.drillPrefs.includeOnlyTags : [];
  const has  = curr.includes(tag);
  state.drillPrefs.includeOnlyTags = has ? curr.filter(t => t !== tag) : curr.concat(tag);
  saveDrillPrefs();
}

// Toggle exclude
function toggleExcludeTag(tag){
  const curr = Array.isArray(state.drillPrefs.excludeTags) ? state.drillPrefs.excludeTags : [];
  const has  = curr.includes(tag);
  state.drillPrefs.excludeTags = has ? curr.filter(t => t !== tag) : curr.concat(tag);
  saveDrillPrefs();
}

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
        const res = await fetch(COLLATED_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const index = new Map();
        for (const v of (json?.verbs || [])) {
          const inf = (v.verb || '').trim();
          if (inf) index.set(inf, v.tenses || {});
        }
        state.dataset = index;
      } catch (e) {
        console.warn('[dataset] load failed:', e);
        state.dataset = null;
      }
    }

    async function loadVerbData() {
      if (VERB_DATA_CACHE) return VERB_DATA_CACHE;
      const res = await fetch(COLLATED_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load ${COLLATED_URL}: ${res.status}`);
      const json = await res.json();
      const list = json?.verbs || [];

      const map = new Map();
      for (const v of list) {
        const key = (v.verb || '').normalize('NFC').toLowerCase().trim();
        if (!key) continue;
        map.set(key, {
          infinitive: v.verb,
          english: v.english || '',
          examples: v.examples || null
        });
      }
      VERB_DATA_CACHE = { list, map };
      return VERB_DATA_CACHE;
    }

    function normVerbKey(s) { return (s || '').normalize('NFC').toLowerCase().trim(); }

    async function getVerbInfo(infinitive, tense) {
      const { map } = await loadVerbData();
      const entry = map.get(normVerbKey(infinitive));
      if (!entry) return { english: null, exampleFR: null, exampleEN: null };

      const jsonTense = TENSE_EXAMPLE_KEY[tense] || tense;
      const ex = entry.examples ? entry.examples[jsonTense] : null;

      return {
        english: entry.english || null,
        exampleFR: ex?.fr ?? null,
        exampleEN: ex?.en ?? null,
      };
    }

    async function loadRules() {
      try {
        const res = await fetch(RULES_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state.rules = await res.json();
      } catch (e) {
        console.warn('[rules] load failed:', e?.message || e);
        state.rules = null;
      }
    }

    async function loadExternalVerbs(){
      try{
        const res = await fetch(COLLATED_URL, { cache:'no-store' });
        if(!res.ok) throw new Error(`Failed to load ${COLLATED_URL}`);
        const json = await res.json();
        const list = json?.verbs || [];

        seedVerbsByInf.clear();
        list.forEach(v => {
          const inf = (v.verb || '').trim();
          if (!inf) return;
          seedVerbsByInf.set(inf, { english: v.english || '', examples: v.examples || null });
        });
        console.info(` ${seedVerbsByInf.size} verbs (examples + english) loaded from collated JSON `);
      } catch(e){
        console.error(e);
        console.log(' No external verbs with examples/definitions loaded. ');
      }
    }

    async function loadAll(){
      await loadDataset();
      await loadRules();

      const [settings, plan, drill] = await Promise.all([ db.settings.get('v1'), db.plan.get('v1'), db.drill.get('v1') ]);
      if (settings) {
        state.settings = settings;
        state.fixedIntervalsText = (settings.fixedIntervals || [1,3,7,14,30]).join(',');
        state.translator = settings.translator || { endpoint:'', apiKey:'' };
      } else {
        state.translator = { endpoint:'', apiKey:'' };
      }
      if (plan) state.plan = plan;
      if (drill) { state.drillPrefs = { ...state.drillPrefs, ...drill }; }
      state.drillPrefs.includeOnlyTags = toArr(state.drillPrefs.includeOnlyTags);
      state.drillPrefs.excludeTags     = toArr(state.drillPrefs.excludeTags);

      // Ensure PK is present for the drill table (you read with 'v1')
if (!state.drillPrefs.key) state.drillPrefs.key = 'v1';

// Ensure array-type prefs are arrays (prevents future clone issues)
state.drillPrefs.persons        = Array.isArray(state.drillPrefs.persons) ? state.drillPrefs.persons : [];
state.drillPrefs.allowedTenses  = Array.isArray(state.drillPrefs.allowedTenses) ? state.drillPrefs.allowedTenses : [];
state.drillPrefs.questionTypes  = Array.isArray(state.drillPrefs.questionTypes) ? state.drillPrefs.questionTypes : [];


      if (state?.drillPrefs?.filterGroups?.some(g => g && g.startsWith?.('-'))) {
   state.drillPrefs.filterGroups = state.drillPrefs.filterGroups
    .map(g => (typeof g === 'string' ? g.replace(/^-/, '') : g))
    .filter(Boolean);
      }

      await reloadVocabByTag(); // load SRS cards (with optional tag filter)
      await maybeSeedVerbsFromTop200();
      await ensureSeedTaggingAndImport();
      state.verbs = await db.verbs.orderBy('infinitive').toArray();

      await loadExternalVerbs();
      state.recordings = await loadRecordings();
      await loadNotesByTag(); // load notes list (rich vocab content)
    }

    async function saveSettings(){ await db.settings.put({ ...state.settings, translator: state.translator }); }
    async function savePlan(){ await db.plan.put(state.plan); }
// Replace your current saveDrillPrefs with this:
async function saveDrillPrefs(){
  // 1) Get a non-reactive snapshot (strip Vue proxy if present)
  const prefs = state.drillPrefs;
  const base = (typeof Vue !== 'undefined' && Vue.toRaw) ? Vue.toRaw(prefs) : prefs;

  // 2) Normalize and keep only plain, cloneable fields
  const clean = {
    // Use your table's PK (you read with db.drill.get('v1'), so keep key:'v1')
    key: base.key || 'v1',

    // Tag fields normalized to arrays (works if user typed a comma string)
    includeOnlyTags: toArr(base.includeOnlyTags),
    excludeTags:     toArr(base.excludeTags),

    // Copy the rest of your primitive/array prefs
    persons: Array.isArray(base.persons) ? base.persons.slice() : [],
    allowedTenses: Array.isArray(base.allowedTenses) ? base.allowedTenses.slice() : [],
    questionTypes: Array.isArray(base.questionTypes) ? base.questionTypes.slice() : [],

    showEnglishTranslation: !!base.showEnglishTranslation,
    showNotesOnCorrect: !!base.showNotesOnCorrect,
    acceptAltPronouns: !!base.acceptAltPronouns,
    acceptNoSubjectShortcut: !!base.acceptNoSubjectShortcut,
    acceptAposVariants: !!base.acceptAposVariants,

    maxQuestions: typeof base.maxQuestions === 'number'
      ? base.maxQuestions
      : Number(base.maxQuestions) || 10
  };

  // 3) Ensure a fully cloneable object before writing to Dexie
  const storable = (typeof structuredClone === 'function')
    ? structuredClone(clean)
    : JSON.parse(JSON.stringify(clean));

  await db.drill.put(storable);
}



    // ----------------------------- VOCAB (SRS) -------------------------------
    function computeDue(){
      const now = Date.now();
      state.counts.total = state.allCards.length;
      state.counts.learned = state.allCards.filter(c => new Date(c.due).getTime() > now && (c.reps ?? 0) >= 2).length;
      state.dueCards = state.allCards.filter(c => new Date(c.due).getTime() <= now).sort((a,b)=>new Date(a.due)-new Date(b.due));
      state.currentCard = state.dueCards[0] || null;
      state.showBack = false;
    }
    async function reloadVocabByTag(){
      const rows = state.vocabTagFilter
        ? await db.vocab.where('tags').equals(state.vocabTagFilter).toArray()
        : await db.vocab.toArray();
      rows.sort((a,b)=> new Date(a.due) - new Date(b.due));
      state.allCards = rows;
      computeDue();
    }
    async function addCard(){
      const front = state.newVocabFront.trim(), back = state.newVocabBack.trim();
      if (!front || !back) return;
      const now = todayISO();
      const id = await db.vocab.add({ front, back, due: now, ease: 2.5, reps: 0, interval: 0, last: now, tags: [] });
      state.allCards.push({ id, front, back, due: now, ease: 2.5, reps: 0, interval: 0, last: now, tags: [] });
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
    async function loadTop200JSON(){
      try {
        const res = await fetch(COLLATED_URL, { cache:'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return json;
      } catch (e) {
        console.warn('[Top200] Fetch failed:', e.message);
      }
      console.error('[Top200] No dataset available. Ensure JSON is next to index.html and served over HTTP.');
      return null;
    }

async function loadTop200AndNormalize() {
  const resp = await fetch('top200_french_verbs_collated.json', { cache: 'no-store' });
  const json = await resp.json();
  const arr = json?.verbs || json || [];

  function normalizeTags(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(t => t.trim()).filter(Boolean);
    if (typeof raw === 'string') return raw.split(',').map(s => s.trim()).filter(Boolean);
    return [];
  }

  return arr.map(v => {
    const inf = (v.verb || '').trim();
    const conj = v.tenses || {};
    const english = v.english || englishGlossDefault(inf);
    const incomingTags = normalizeTags(v.tags);
    const tags = Array.from(new Set([...(incomingTags || []), 'top200']));
    return { infinitive: inf, english, tags, conj };
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
         const incomingTags = Array.isArray(r.tags) ? r.tags : [];
const tags = Array.from(new Set([...(existing.tags || []), ...incomingTags, 'top200']));
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

    // ---------------------- VOCAB NOTES + FR↔EN seeding (Option B) -----------
    async function upsertVocabNote(entry) {
      const note = {
        french: normalizeStr(entry.french || entry.fr || entry.term || entry.word),
        english: normalizeStr(entry.english || entry.en || entry.translation),
        partOfSpeech: normalizeStr(entry.partOfSpeech || entry.pos),
        gender: normalizeStr(entry.gender || entry.g),
        topic: normalizeStr(entry.topic || entry.domain || entry.category),
        tags: normalizeTags(entry.tags || entry.labels || entry.topics),
        ipa: normalizeStr(entry.ipa || entry.IPA),
        image: normalizeStr(entry.image || entry.imageUrl || entry.img),
        audio: normalizeStr(entry.audio || entry.audioUrl),
        exampleFr: normalizeStr(entry.exampleFr || entry.example?.fr || entry.examples?.fr),
        exampleEn: normalizeStr(entry.exampleEn || entry.example?.en || entry.examples?.en),
        frequencyRank: entry.frequencyRank ?? entry.freq ?? null,
        variants: Array.isArray(entry.variants) ? entry.variants : [],
      };

      if (!note.french && !note.english) return null;

      // Upsert by (french, english) pair
      const existing = await db.vocab_notes
        .where({ french: note.french, english: note.english })
        .first();

      if (existing) {
        await db.vocab_notes.update(existing.id, note);
        return existing.id;
      } else {
        return await db.vocab_notes.add(note);
      }
    }

    async function cardExists(front, back) {
      return !!(await db.vocab.where({ front, back }).first());
    }

    function seedCard(front, back, tags) {
      const now = todayISO();
      return {
        front, back,
        due: now,
        ease: 2.5,
        reps: 0,
        interval: 0,
        last: now,
        tags: Array.isArray(tags) ? tags : []
      };
    }

    async function importNotesAndSeedCards({ frToEn = true, enToFr = true } = {}) {
      try {
        const res = await fetch('general_vocab.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const items = Array.isArray(data) ? data
                    : Array.isArray(data?.vocab) ? data.vocab
                    : [];

        if (!items.length) {
          alert('No vocab items found in general_vocab.json');
          return;
        }

        let notesUpserted = 0, cardsSeeded = 0;
        const batchCards = [];

        for (const raw of items) {
          const id = await upsertVocabNote(raw);
          if (!id) continue;
          notesUpserted++;

          const fr = normalizeStr(raw.french || raw.fr || raw.term || raw.word);
          const en = normalizeStr(raw.english || raw.en || raw.translation);
          const tags = normalizeTags(raw.tags || raw.labels || raw.topics);
          if (!fr || !en) continue;

          if (frToEn && !(await cardExists(fr, en))) {
            batchCards.push(seedCard(fr, en, tags));
            cardsSeeded++;
          }
          if (enToFr && !(await cardExists(en, fr))) {
            batchCards.push(seedCard(en, fr, tags));
            cardsSeeded++;
          }
        }

        if (batchCards.length) await db.vocab.bulkAdd(batchCards);

        await reloadVocabByTag();
        await loadNotesByTag();

        alert(`Imported ${notesUpserted} notes and seeded ${cardsSeeded} cards.`);
      } catch (e) {
        console.error(e);
        alert('Import failed: ' + e.message);
      }
    }

    async function loadNotesByTag() {
      state.notes = state.notesTagFilter
        ? await db.vocab_notes.where('tags').equals(state.notesTagFilter).toArray()
        : await db.vocab_notes.toArray();
      state.notes.sort((a, b) =>
        (a.topic || '').localeCompare(b.topic || '') ||
        (a.french || '').localeCompare(b.french || '')
      );
    }

    // --- Collect all known tags from verbs ---
const allKnownTags = computed(() => {
  const tags = new Set();
  state.verbs.forEach(v => (v.tags || []).forEach(t => tags.add(t)));
  return Array.from(tags).sort((a,b)=>a.localeCompare(b));
});

// --- Toggle tags when pills clicked ---
function toggleTag(tag){
  const arr = state.drillPrefs.includeOnlyTags || [];
  const idx = arr.indexOf(tag);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(tag);
  state.drillPrefs.includeOnlyTags = arr;
  saveDrillPrefs();
}


    // ------------------------------- DATA LOOKUPS -----------------------------
    function getConjFromDatasetFirst(inf, tenseId, personIndex){
      if (state.dataset) {
        const tenses = state.dataset.get(inf);
        if (tenses) {
          const block = tenses[TENSE_DS_KEY[tenseId] || tenseId];
          if (block) {
            const form = block[PERSON_LABELS[personIndex]];
            if (typeof form === 'string' && form.trim() !== '') return form.trim();
          }
        }
      }
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

    async function updateDrillSideInfo(currentVerbInfinitive, currentTense) {
      try {
        const jsonTense = TENSE_EXAMPLE_KEY[currentTense] || currentTense;
        const info = await getVerbInfo(currentVerbInfinitive, jsonTense);

        if (!state.drillSession.side) {
          state.drillSession.side = { english:'—', fr:'—', en:'—' };
        }
        state.drillSession.side.english = info.english ?? '—';
        state.drillSession.side.fr      = info.exampleFR ?? '—';
        state.drillSession.side.en      = info.exampleEN ?? '—';
      } catch (e) {
        console.warn('updateDrillSideInfo failed:', e);
      }
    }

    // ------------------------------- DRILLS ----------------------------------
 function filterVerbsForDrill(list){
  // Keep dataset-backed/top200 verbs
  const onlyTop200 = list.filter(v =>
    (state.dataset && state.dataset.has(v.infinitive)) ||
    (v.tags || []).includes('top200')
  );

  const { includeOnlyTags, excludeTags, filterGroups, regularity } = state.drillPrefs;
  let out = onlyTop200;

  // Include-only tags
  if (includeOnlyTags?.length) {
    out = out.filter(v => (v.tags || []).some(t => includeOnlyTags.includes(t)));
  }
  // Exclude tags
  if (excludeTags?.length) {
    out = out.filter(v => !(v.tags || []).some(t => excludeTags.includes(t)));
  }

  // Group filter
  if (filterGroups?.length) {
    out = out.filter(v => filterGroups.includes(groupOfInf(v.infinitive)));
  }

  // Regularity filter
  if (regularity === 'regular') {
    out = out.filter(v => !isIrregularVerbRow(v));
  } else if (regularity === 'irregular') {
    out = out.filter(v => isIrregularVerbRow(v));
  }

  return out;
}


    function datasetOnlyAnswer(verbRow, tense, personIndex){
      const plain = getConjFromDatasetFirst(verbRow.infinitive, tense, personIndex);
      if (!plain) return null;
      return makeFullAnswer(tense, personIndex, plain);
    }

    function newDrillQuestion(){
      let pool = filterVerbsForDrill(state.verbs);

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

      const tensesPool   = state.drillPrefs.tenses.length   ? state.drillPrefs.tenses   : ['present'];
      const personsPool  = state.drillPrefs.persons.length  ? state.drillPrefs.persons  : [0,1,2,3,4,5];

      // Skip grammatically invalid imperative forms (je, il/elle/on, ils/elles)
      for (let attempts = 0; attempts < 50; attempts++) {
        const verb = randChoice(pool);
        const tense = randChoice(tensesPool);
        const personIndex = randChoice(personsPool);

        if (tense === 'imperatif' && [0,2,5].includes(personIndex)) continue;

        const answer = datasetOnlyAnswer(verb, tense, personIndex);
        if (!answer) continue;

        const prompt = {
          infinitive: verb.infinitive,
          english: verb.english,
          tense,
          personIndex,
          label: `${PRONOUNS[personIndex]} — ${verb.infinitive} — ${prettyTense(tense)}`
        };

        const ex = getExample(verb.infinitive, tense);

        updateDrillSideInfo(verb.infinitive, tense);

        return { verb, prompt, answer, ex };
      }
      return null;
    }

    function startDrill(){
      state.drillSession = { running:true, question:newDrillQuestion(), input:'', correct:null, total:0, right:0, history:[], help:null, side: { english:'—', fr:'—', en:'—' } };
      if (!state.drillSession.question) { alert('No dataset-backed forms available for drill. Check your JSON files.'); state.drillSession.running=false; return; }
      updateDrillSideInfo(state.drillSession.question.prompt.infinitive, state.drillSession.question.prompt.tense);
      nextTick(()=>drillInputEl.value?.focus());
    }

    function buildRuleHelp(verbRow, tense, personIndex) {
      const R = state.rules;
      if (!R) return null;

      const lines = [];
      const tenseKey = TENSE_RULE_KEY[tense] || tense;
      const personStr = PERSON_KEY[personIndex];

      const tObj = R.tenses?.[tenseKey];
      if (tObj?.explanation) lines.push(`<b>L'explication :</b> ${tObj.explanation}`);
      if (tObj?.description) lines.push(`<b>Explanation: </b> ${tObj.description}`);

      const targetedKey = `${personStr}+${verbRow.infinitive}+${tenseKey}`;
      const targeted = R.sample_lookups?.[targetedKey];
      if (targeted) {
        if (targeted.how_to) lines.push(`How-to: ${targeted.how_to}`);
        if (targeted.correct_form_example) lines.push(`Example: ${targeted.correct_form_example}`);
      }

      const quick = R.quick_help_templates?.[tenseKey];
      if (quick) lines.push(quick);

      if ((tense === 'present' || tense === 'imparfait') && R.orthography?.c_g_spelling && (verbRow.infinitive.endsWith('cer') || verbRow.infinitive.endsWith('ger'))) {
        lines.push(R.orthography.c_g_spelling);
      }

      return { lines };
    }

    function checkDrill() {
      if (!state.drillSession.running || !state.drillSession.question) return;

      if (state.drillSession.correct === true) return;

      const expected = state.drillSession.question.answer;
      const given    = state.drillSession.input;

      const ok = answersEqual(given, expected);

      state.drillSession.total += 1;
      if (ok) state.drillSession.right += 1;
      state.drillSession.correct = ok;

      const q = state.drillSession.question;
      state.drillSession.help = buildRuleHelp(q.verb, q.prompt.tense, q.prompt.personIndex);

      if (ok && state.drillPrefs.autoNext) {
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
      if (!state.drillSession.question) { alert('No dataset-backed forms available for drill. Check your JSON files.'); state.drillSession.running=false; return; }

      updateDrillSideInfo(state.drillSession.question.prompt.infinitive, state.drillSession.question.prompt.tense);

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
      const [vocab, qa, audio, settings, plan, verbs, drill, vocab_notes] = await Promise.all([
        db.vocab.toArray(), db.qa.toArray(), db.audio.toArray(), db.settings.toArray(), db.plan.toArray(), db.verbs.toArray(), db.drill.toArray(), db.vocab_notes?.toArray() ?? []
      ]);
      const payload = { version:4, vocab, qa, audioMeta: audio, settings, plan, verbs, drill, vocab_notes };
      const blob = new Blob([JSON.stringify(payload,null,2)], { type:'application/json' });
      const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`parlcoach-export-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
    }
    async function importData(ev){
      const file = ev.target.files?.[0]; if (!file) return;
      const text = await file.text(); let json; try { json = JSON.parse(text); } catch { alert('Invalid JSON'); return; }
      if (!json || !json.version) { alert('Invalid export file'); return; }
      await db.transaction('rw', db.vocab, db.qa, db.audio, db.settings, db.plan, db.verbs, db.drill, db.vocab_notes, async ()=>{
        await db.vocab.clear(); await db.qa.clear(); await db.audio.clear(); await db.settings.clear(); await db.plan.clear(); await db.verbs.clear(); await db.drill.clear();
        if (db.vocab_notes) await db.vocab_notes.clear();

        if (Array.isArray(json.vocab)) await db.vocab.bulkAdd(json.vocab);
        if (Array.isArray(json.qa)) await db.qa.bulkAdd(json.qa);
        if (Array.isArray(json.audioMeta)) await db.audio.bulkAdd(json.audioMeta);
        if (Array.isArray(json.settings)) await db.settings.bulkAdd(json.settings);
        if (Array.isArray(json.plan)) await db.plan.bulkAdd(json.plan);
        if (Array.isArray(json.verbs)) await db.verbs.bulkAdd(json.verbs);
        if (Array.isArray(json.drill)) await db.drill.bulkAdd(json.drill);
        if (Array.isArray(json.vocab_notes) && db.vocab_notes) await db.vocab_notes.bulkAdd(json.vocab_notes);
      });
      await loadAll(); alert('Import complete.');
    }
    async function simulateSyncPush(){ alert('Simulated: pushed local changes.'); }
    async function simulateSyncPull(){ await reloadVocabByTag(); state.verbs = await db.verbs.orderBy('infinitive').toArray(); alert('Simulated: pulled remote changes (refreshed).'); }
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

    // ------------------------------ Expose -----------------------------------
    onMounted(loadAll);
    const api = {
      ...Vue.toRefs(state), myVerbs, seedVerbs, drillInputEl, scoreClass,

      // utils
      toDateOnly, prettyTense,

      // vocab
      addCard, rate, deleteCard, updateFixedIntervals, reloadVocabByTag,

      // notes (Option B)
      importNotesAndSeedCards, loadNotesByTag,

      // json editor
      openJsonEditor, closeJsonEditor, prettyJson, saveJsonEditor, clearConj, insertConjSkeleton: ()=>{},

      // verbs
      addVerb, deleteVerb,

      // drills
      startDrill, checkDrill, nextDrill, stopDrill,

      // audio
      startRecording, stopRecording, deleteRecording,

      // tagging
      tagPills, toggleIncludeTag, toggleExcludeTag,

      // QA
      saveQA,

      // settings
      requestPersistence, exportData, importData, savePlan, saveSettings, saveDrillPrefs,
      simulateSyncPush, simulateSyncPull, saveTranslator
    };
    window.debugSeed = { ensureSeedTaggingAndImport, loadTop200JSON, loadExternalVerbs, getExample, updateDrillSideInfo };
    return api;
  }
}).mount('#app');

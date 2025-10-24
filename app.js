// ParlFR — app.js (CLEAN, single-collated source)
// Local-first IndexedDB (Dexie); drills first.
// Conjugations, examples, and English glosses are pulled ONLY from
// top200_french_verbs_collated.json. No rule-based fallbacks for answers.

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

// (keep existing internal<->display tense maps)
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

// examples: internal -> JSON keys
const TENSE_EXAMPLE_KEY = {
  present: 'present',
  passeCompose: 'passeCompose',
  imparfait: 'imparfait',
  plusQueParfait: 'plusQueParfait',
  futur: 'futurSimple',              // NOTE: futur -> futurSimple in JSON
  conditionnelPresent: 'conditionnelPresent',
  subjonctifPresent: 'subjonctifPresent',
  imperatif: 'imperatif'
};

// for rules help text lookups; maps internal keys to rule keys
const TENSE_RULE_KEY = { ...TENSE_EXAMPLE_KEY };

// cache for examples/translations lookups
let VERB_DATA_CACHE = null;
const seedVerbsByInf = new Map(); // keeps examples handy for the side panel

// Fallback English if missing in JSON
function englishGlossDefault(inf) { return ''; }

// ================================ Vue App ====================================
const { createApp, reactive, computed, onMounted, ref, nextTick } = Vue;

createApp({
  setup(){
    const state = reactive({
      jsonEditor: { open:false, verb:null, text:'', readonly:false, error:'' },
      showEnglishTranslation: true,
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
        excludeTags: [],
        autoNext: true
      },
      drillSession: {
        running:false, question:null, input:'', correct:null, total:0, right:0,
        history:[], help:null,
        // side panel info populated from collated JSON
        side: { english:'—', fr:'—', en:'—' }
      },

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

    /** English + example sentence for a given verb/tense. */
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
        state.rules = null; // drills continue to work without textual rules
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
      await loadDataset();          // dataset first
      await loadRules();            // rules for help text only (optional)

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

    async function loadTop200AndNormalize(){
      const data = await loadTop200JSON(); if (!data) return [];
      const arr = Array.isArray(data?.verbs) ? data.verbs : []; if (!arr.length) return [];
      return arr.map(v => {
        const inf = (v.verb || '').trim();
        const conj = v.tenses || {};
        const english = v.english || englishGlossDefault(inf);
        return { infinitive: inf, english, tags: ['top200'], conj };
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
      // 1) in-memory dataset from collated file
      if (state.dataset) {
        const tenses = state.dataset.get(inf);
        if (tenses) {
          const block = tenses[TENSE_DS_KEY[tenseId] || tenseId];
          if (block) {
            const form = block[PERSON_LABELS[personIndex]];
            if (typeof form === 'string' && form.trim() !== '') return form.trim(); // plain form (no pronoun)
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

    // --- keep side panel in sync with JSON translations/examples
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
      // Only verbs that exist in the dataset (by infinitive) or are tagged top200
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

    // DATASET-ONLY answer builder
    function datasetOnlyAnswer(verbRow, tense, personIndex){
      const plain = getConjFromDatasetFirst(verbRow.infinitive, tense, personIndex);
      if (!plain) return null;
      return makeFullAnswer(tense, personIndex, plain);
    }

    function newDrillQuestion(){
      // Build an eligible pool
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

      const tensesPool   = state.drillPrefs.tenses.length   ? state.drillPrefs.tenses   : ['present'];
      const personsPool  = state.drillPrefs.persons.length  ? state.drillPrefs.persons  : [0,1,2,3,4,5];

      // Try a few times to find a dataset-backed combo
      for (let attempts = 0; attempts < 50; attempts++) {
        const verb = randChoice(pool);
        const tense = randChoice(tensesPool);
        const personIndex = randChoice(personsPool);

        // 🚫 Skip grammatically invalid imperative forms
        if (tense === 'imperatif' && [0,2,5].includes(personIndex)) continue;

        const answer = datasetOnlyAnswer(verb, tense, personIndex);
        if (!answer) continue; // no dataset form for this combo; try again

        const prompt = {
          infinitive: verb.infinitive,
          english: verb.english,
          tense,
          personIndex,
          label: `${PRONOUNS[personIndex]} — ${verb.infinitive} — ${prettyTense(tense)}`
        };

        const ex = getExample(verb.infinitive, tense);

        // keep side info fresh (translations + examples from JSON)
        updateDrillSideInfo(verb.infinitive, tense);

        return { verb, prompt, answer, ex };
      }
      // If we fail to find any valid combo after attempts, report empty
      return null;
    }

    function startDrill(){
      state.drillSession = { running:true, question:newDrillQuestion(), input:'', correct:null, total:0, right:0, history:[], help:null, side: { english:'—', fr:'—', en:'—' } };
      if (!state.drillSession.question) { alert('No dataset-backed forms available for drill. Check your JSON files.'); state.drillSession.running=false; return; }

      // refresh side info on start (defensive)
      updateDrillSideInfo(state.drillSession.question.prompt.infinitive, state.drillSession.question.prompt.tense);

      nextTick(()=>drillInputEl.value?.focus());
    }

    function buildRuleHelp(verbRow, tense, personIndex) {
      // Textual guidance only — no fallbacks are used for answers.
      const R = state.rules;
      if (!R) return null;

      const lines = [];
      const groupKey = (typeof inferGroup === 'function') ? inferGroup(verbRow.infinitive) : null; // guarded; inferGroup may be absent
      const tenseKey = TENSE_RULE_KEY[tense] || tense;
      const personStr = PERSON_KEY[personIndex];

      // Tense-level description/explanation
      const tObj = R.tenses?.[tenseKey];
     if (tObj?.explanation) lines.push(`<b>L'explication :</b> ${tObj.explanation}`);
 
      if (tObj?.description) lines.push(`<b>Explanation: </b> ${tObj.description}`);

      // Targeted how-to, if present
      const targetedKey = `${personStr}+${verbRow.infinitive}+${tenseKey}`;
      const targeted = R.sample_lookups?.[targetedKey];
      if (targeted) {
        if (targeted.how_to) lines.push(`How-to: ${targeted.how_to}`);
        if (targeted.correct_form_example) lines.push(`Example: ${targeted.correct_form_example}`);
      }

      // Show dataset authoritative form (if present)
      //  removed; same as the expected answer
      // const dsForm = getConjFromDatasetFirst(verbRow.infinitive, tense, personIndex);
      //if (dsForm) lines.push(`Dataset form: ${personStr} ${dsForm}`);

      // Quick template (high-level reminder)
      const quick = R.quick_help_templates?.[tenseKey];
      if (quick) lines.push(quick);

      // Spelling hints for -cer/-ger (orthography)
      if ((tense === 'present' || tense === 'imparfait') && R.orthography?.c_g_spelling && (verbRow.infinitive.endsWith('cer') || verbRow.infinitive.endsWith('ger'))) {
        lines.push(R.orthography.c_g_spelling);
      }

      return { lines };
    }

    function checkDrill() {
      if (!state.drillSession.running || !state.drillSession.question) return;

      // ignore extra checks during the 2s "Correct!" window
      if (state.drillSession.correct === true) return;

      const expected = state.drillSession.question.answer; // full form (from dataset only)
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

      // refresh side info on next
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
      openJsonEditor, closeJsonEditor, prettyJson, saveJsonEditor, clearConj, insertConjSkeleton: ()=>{},

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
    window.debugSeed = { ensureSeedTaggingAndImport, loadTop200JSON, loadExternalVerbs, getExample, updateDrillSideInfo };
    return api;
  }
}).mount('#app');

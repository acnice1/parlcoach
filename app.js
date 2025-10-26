// app.js (entry)

import DrillPanel from './js/components/DrillPanel.js?v=1';
import VocabPanel from './js/components/VocabPanel.js?v=1';
import RecorderPanel from './js/components/RecorderPanel.js?v=1';
import ProfileWidget from './js/components/ProfileWidget.js?v=1';

import { initDexie, opfs, TAG_PILL_OPTIONS } from './js/db.js?v=1';
import { sm2Schedule, fixedSchedule, loadDataset, loadRules, saveDrillPrefs } from './js/drills.js?v=1';
import * as Vocab from './js/vocab.js?v=1';
import * as Verb from './js/verbs.js?v=1';
import { answersEqual, toArr } from './js/utils.js?v=1';

const db = initDexie();
const { createApp, reactive, ref, watch, toRefs } = Vue;

const vueApp = createApp({
  components: { DrillPanel, VocabPanel, RecorderPanel, ProfileWidget },

  setup(){
    const state = reactive({
      // STATE OBJECT
      // global profile + stats

      
      profileName: '',
      globalStats: { right: 0, total: 0, since: new Date().toISOString().slice(0,10) },
      todayStats:  { right: 0, total: 0, date:  new Date().toISOString().slice(0,10) },

      
      exampleMap: new Map(),   // 👈 add this here
      jsonEditor: { open:false, verb:null, text:'', readonly:false, error:'' },
      showEnglishTranslation: true,
      rules: null,
      dataset: null,

      vocab: { cards: [], deck: [], deckPtr: 0, prefs: { randomize:true, withoutReplacement:true } },
      tab: 'learn',
      learnTab: 'drills',

      newVocabFront:'', newVocabBack:'',
      allCards:[], dueCards:[], currentCard:null, showBack:false,
      counts:{ total:0, learned:0 },
      vocabTagFilter:'', notes:[], notesTagFilter:'',

      verbs: [],
      newVerb: { infinitive:'', english:'', tags:'' },

      drillPrefs: {
        key: 'v1',
        tenses: ['present','passeCompose','imparfait','plusQueParfait','futur','conditionnelPresent','subjonctifPresent','imperatif'],
        persons: [0,1,2,3,4,5],
        includeOnlyTags: [],
        excludeTags: [],
        autoNext: true,
        filterGroups: ['er','ir','re'],
        regularity: 'any'
      },
      drillSession: { running:false, question:null, input:'', correct:null, total:0, right:0, history:[], help:null, side:{ english:'—', fr:'—', en:'—' } },
      // recorder state

      isRecording:false, mediaRecorder:null, chunks:[], recordings:[],
      newQA:{ q:'', a:'' },

      speech: {
        lang: 'fr-FR',          // pick 'en-US' for English
        isOn: false,
        interim: '',
        final: '',
        appendToQA: true        // when final text arrives, append to newQA.a
      },
      _recog: null,              // internal SpeechRecognition instance (not persisted)

      
      // plan + settings
      plan:{ key:'v1', goal:'Government B', dailyMinutes:60, focus:'listening, oral, vocab', weeklySchedule:'', notes:'' },
      settings:{ key:'v1', srsMode:'SM2', fixedIntervals:[1,3,7,14,30], translator:{ endpoint:'', apiKey:'' } },
      fixedIntervalsText:'1,3,7,14,30',
      storagePersisted:false,
      translator:{ endpoint:'', apiKey:'' },
    });

    // ---- Scroll lock helpers ----
function getScroll(){ return { x: window.scrollX, y: window.scrollY }; }
function restoreScroll(pos){ window.scrollTo(pos.x, pos.y); }
async function withScrollLock(run){
  const pos = getScroll();
  await run();               // your existing logic
  await Vue.nextTick();      // wait for DOM update
  restoreScroll(pos);        // put viewport back exactly
}

    // put near your speech state
state.speech = state.speech || { lang:'fr-FR', isOn:false, interim:'', final:'', appendToQA:true, supported:false, why:'' };


function detectSpeechSupport(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const secure = location.protocol === 'https:' || location.hostname === 'localhost';
  state.speech.supported = !!SR && secure;
  state.speech.why = !secure ? 'Needs HTTPS or localhost.' : (!SR ? 'SpeechRecognition not available in this browser.' : '');
}
detectSpeechSupport(); // call once in setup / before UI renders

    // Holds examples from the collated JSON (verb → examples)
    state.exampleMap = new Map();

    // tag pills fixed set
    const tagPills = ref(TAG_PILL_OPTIONS.slice());

    // rebuild vocab deck when prefs change
    watch(
      () => [state.vocab.prefs.randomize, state.vocab.prefs.withoutReplacement],
      () => Vocab.buildVocabDeck(state)
    );

    // -------------------- Drill helpers --------------------
    const TENSE_LABEL = {
      present:'Présent',
      passeCompose:'Passé composé',
      imparfait:'Imparfait',
      plusQueParfait:'Plus-que-parfait',
      futur:'Futur simple',
      conditionnelPresent:'Conditionnel présent',
      subjonctifPresent:'Subjonctif présent',
      imperatif:'Impératif'
    };
    const PERSON_LABELS = ['je','tu','il/elle/on','nous','vous','ils/elles'];

    function debounce(fn, ms=300){
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// replace your existing saveGlobalToSettings with this:
async function saveGlobalToSettings(){
  // Get the existing row (plain object)
  const existing = (await db.settings.get('v1')) || { key: 'v1' };

  // Build plain JSON-safe snapshots (no proxies)
  const today = new Date().toISOString().slice(0,10);
  const gs = {
    right: Number(state.globalStats?.right || 0),
    total: Number(state.globalStats?.total || 0),
    since: String(state.globalStats?.since || today),
  };
  const ts = {
    right: Number(state.todayStats?.right || 0),
    total: Number(state.todayStats?.total || 0),
    date:  String(state.todayStats?.date  || today),
  };

  const record = {
    key: 'v1',
    // keep only known, JSON-safe fields from existing row
    srsMode: existing.srsMode,                 // (if you store this here)
    fixedIntervals: existing.fixedIntervals,   // (if present)
    translator: existing.translator,           // (strings)
    profileName: String(state.profileName || ''),
    globalStats: gs,
    todayStats: ts,
  };

  // Write only the whitelisted plain object
  await db.settings.put(record);
}


const saveGlobalToSettingsDebounced = debounce(saveGlobalToSettings, 500);

// bump global + today counters
function bumpGlobal(isRight){
  state.globalStats.total += 1;
  state.todayStats.total  += 1;
  if (isRight) {
    state.globalStats.right += 1;
    state.todayStats.right  += 1;
  }
  saveGlobalToSettingsDebounced();
}


    // Build one question from current dataset + filters
    function buildQuestion() {
      // dataset sanity
      if (!state.dataset || !(state.dataset instanceof Map)) return null;

      // filter verbs by include/exclude tags
      let pool = state.verbs.slice();
      const inc = Array.isArray(state.drillPrefs.includeOnlyTags) ? state.drillPrefs.includeOnlyTags.filter(Boolean) : [];
      const exc = Array.isArray(state.drillPrefs.excludeTags) ? state.drillPrefs.excludeTags.filter(Boolean) : [];

      if (inc.length) {
        pool = pool.filter(v => (v.tags || []).some(t => inc.includes(t)));
      }
      if (exc.length) {
        pool = pool.filter(v => !(v.tags || []).some(t => exc.includes(t)));
      }
      if (!pool.length) return null;

      // pick a verb
      const verb = pool[Math.floor(Math.random() * pool.length)];
      const inf  = verb.infinitive;

      // pick a tense
      const allowedTenses = (state.drillPrefs.tenses || []).filter(k => TENSE_LABEL[k]);
      if (!allowedTenses.length) return null;
      const tenseKey   = allowedTenses[Math.floor(Math.random()*allowedTenses.length)];
      const tenseLabel = TENSE_LABEL[tenseKey];

      // pick a person (avoid invalid imperative persons)
      let persons = Array.isArray(state.drillPrefs.persons) ? state.drillPrefs.persons.slice() : [0,1,2,3,4,5];
      if (tenseKey === 'imperatif') {
        // valid imperative persons: tu (1), nous (3), vous (4)
        persons = persons.filter(p => p === 1 || p === 3 || p === 4);
        if (!persons.length) persons = [1,3,4];
      }
      const pIdx = persons[Math.floor(Math.random()*persons.length)];
      const personLabel = PERSON_LABELS[pIdx] || 'je';

      // look up answer from dataset
      const tensesObj = state.dataset.get(inf); // e.g., { "Présent": {...}, "Passé composé": {...}, ... }
      if (!tensesObj) return null;
      const tenseObj  = tensesObj[tenseLabel];
      if (!tenseObj) return null;

      // dataset uses keys like "je","tu","il/elle/on","nous","vous","ils/elles"
      const answer = (tenseObj[personLabel] || '').trim();
      if (!answer) return null;

      const label = `${personLabel} — ${inf} — ${tenseLabel}`;
      return { label, answer, verb, personLabel, tenseLabel };
    }
    // ------------------------------------------------------
    //    
    // ---------- methods (thin wrappers around modules) ----------
   
   function toggleIncludeTag(tag){
  const arr = state.drillPrefs.includeOnlyTags ?? [];
  const i = arr.indexOf(tag);
  if (i === -1) arr.push(tag);
  else arr.splice(i, 1);
  state.drillPrefs.includeOnlyTags = [...arr];  // trigger reactivity
  methods.saveDrillPrefs();
}
function clearIncludeTags(){
  state.drillPrefs.includeOnlyTags = [];
  methods.saveDrillPrefs();
}
function toggleExcludeTag(tag){
  const arr = state.drillPrefs.excludeTags ?? [];
  const i = arr.indexOf(tag);
  if (i === -1) arr.push(tag);
  else arr.splice(i, 1);
  state.drillPrefs.excludeTags = [...arr];
  methods.saveDrillPrefs();
}
function clearExcludeTags(){
  state.drillPrefs.excludeTags = [];
  methods.saveDrillPrefs();
}

    async function rate(q){
      if (!state.currentCard) return;
      const c = state.currentCard;
      const upd = (state.settings.srsMode==='SM2')
        ? sm2Schedule(c,q)
        : fixedSchedule(c, state.settings.fixedIntervals||[1,3,7,14,30], q);
      Object.assign(c, upd);
      await db.vocab.update(c.id, upd);
      Vocab.computeDue(state);
    }

    async function loadAll(){
      state.dataset = await loadDataset();
      state.rules   = await loadRules();

      // Build example index from external verbs file, if available
    if (typeof Verb.loadExternalVerbs === 'function') {
      try {
        const { map } = await Verb.loadExternalVerbs(); // map: infinitive → { infinitive, english, examples }
        if (map && map.size) state.exampleMap = map;
      } catch (e) {
        console.warn('[examples] loadExternalVerbs failed:', e);
      }
    }

      const [settings, plan, drill] = await Promise.all([
        db.settings.get('v1'), db.plan.get('v1'), db.drill.get('v1')
      ]);

      if (settings) {
        state.settings = settings;
        state.fixedIntervalsText = (settings.fixedIntervals || [1,3,7,14,30]).join(',');
        state.translator = settings.translator || { endpoint:'', apiKey:'' };
      } else {
        state.translator = { endpoint:'', apiKey:'' };
      }
      if (plan) state.plan = plan;
      if (drill) state.drillPrefs = { ...state.drillPrefs, ...drill };

      state.drillPrefs.includeOnlyTags = toArr(state.drillPrefs.includeOnlyTags);
      state.drillPrefs.excludeTags     = toArr(state.drillPrefs.excludeTags);
      if (!state.drillPrefs.key) state.drillPrefs.key = 'v1';

      // hydrate profile + counters from settings if present
      if (state.settings.profileName) state.profileName = state.settings.profileName;
      if (state.settings.globalStats) state.globalStats = { ...state.globalStats, ...state.settings.globalStats };
      if (state.settings.todayStats)  state.todayStats  = { ...state.todayStats,  ...state.settings.todayStats  };

      // roll todayStats if date changed
      const today = new Date().toISOString().slice(0,10);
      if (state.todayStats.date !== today) {
        state.todayStats = { right: 0, total: 0, date: today };
}

      await Vocab.reloadVocabByTag(db, state);
      Vocab.buildVocabDeck(state);

      // Seed/merge verbs if module exports exist
      if (typeof Verb.maybeSeedVerbsFromTop200 === 'function') {
        await Verb.maybeSeedVerbsFromTop200(db);
      }
      if (typeof Verb.ensureSeedTaggingAndImport === 'function') {
        await Verb.ensureSeedTaggingAndImport(db);
      }
      state.verbs = await db.verbs.orderBy('infinitive').toArray();

      // (recordings/notes loaders go here if you use them)
      await loadRecordingsFromDB();
    }


// Map display → canonical (already defined earlier)
const EX_KEY = {
  'Présent': 'present',
  'Passé composé': 'passeCompose',
  'Imparfait': 'imparfait',
  'Plus-que-parfait': 'plusQueParfait',
  'Futur simple': 'futurSimple',
  'Conditionnel présent': 'conditionnelPresent',
  'Subjonctif présent': 'subjonctifPresent',
  'Impératif': 'imperatif'
};

function attachExamplesAndRules(q) {
  // Reset rules panel (examples are set below)
  state.drillSession.help = null;

  const display = q.tenseLabel;                          // e.g., "Présent"
  const camel   = EX_KEY[display] || display;            // e.g., "present"
  const infinitive = (q.verb?.infinitive || '').trim();
  const lowerInf   = infinitive.toLowerCase();

  // --------- Determine verb group for formation filtering ---------
  // only one of '-er' | '-ir' | '-re' will be shown in rules
  let groupKey = null;
  if (lowerInf.endsWith('er')) groupKey = '-er';
  else if (lowerInf.endsWith('ir')) groupKey = '-ir';
  else if (lowerInf.endsWith('re')) groupKey = '-re';

  // ------------------ Examples (FR/EN) ------------------
  try {
    // Pull from exampleMap loaded via loadExternalVerbs()
    const exKey = infinitive.normalize('NFC').toLowerCase();
    const entry = state.exampleMap?.get(exKey);

    // Prefer per-tense examples; fall back to the entry’s 'default' block if present (still file-driven)
    const ex =
      entry?.examples?.[camel] ??
      entry?.examples?.[display] ??
      entry?.examples?.default ??
      (entry?.examples && (entry.examples.fr || entry.examples.en) ? entry.examples : null);

    if (ex) {
      if (ex.fr) state.drillSession.side.fr = ex.fr;
      if (ex.en) state.drillSession.side.en = ex.en;
    } else {
      // If no examples for this verb/tense, keep previous values or leave as '—' (we do not synthesize any text)
      state.drillSession.side.fr ??= '—';
      state.drillSession.side.en ??= '—';
    }
  } catch (e) {
    console.warn('[examples] attach failed:', e);
  }

  // ------------------ Rules (strictly from rules.json) ------------------
  const R = state.rules;
  if (!R) return;

  const pickFrom = obj => {
    if (!obj) return null;
    if (obj[camel]) return obj[camel];
    if (obj[display]) return obj[display];
    for (const k of Object.keys(obj)) {
      if ((k || '').localeCompare(camel,   undefined, { sensitivity:'accent' }) === 0) return obj[k];
      if ((k || '').localeCompare(display, undefined, { sensitivity:'accent' }) === 0) return obj[k];
    }
    return null;
  };

  let block =
    pickFrom(R.tenses) ||
    pickFrom(R) ||
    null;

  if (!block) return;

  const lines = [];

  // Explanations from file
  if (typeof block.explanation === 'string' && block.explanation.trim()) {
    lines.push(`<strong>L’explication :</strong> ${block.explanation.trim()}`);
  }
  if (typeof block.description === 'string' && block.description.trim()) {
    lines.push(`<strong>Explanation:</strong> ${block.description.trim()}`);
  }

  // Pretty printer for endings
  const fmtEndings = (end) => {
    try {
      return Object.entries(end)
        .map(([p, e]) => `<code>${p}</code>: <code>${e}</code>`)
        .join(', ');
    } catch { return null; }
  };

  // Print one group’s formation (only the matching groupKey)
  const pushGroupFormation = (grpKey, grpObj) => {
    if (!grpObj || typeof grpObj !== 'object') return;
    if (grpObj.stem && String(grpObj.stem).trim()) {
      lines.push(`${grpKey}: Stem — ${grpObj.stem}`);
    }
    if (grpObj.endings) {
      const s = fmtEndings(grpObj.endings);
      if (s) lines.push(`${grpKey}: Endings — ${s}`);
    }
    if (grpObj.special && String(grpObj.special).trim()) {
      lines.push(grpObj.special);
    }
  };

  // Formation: compound (auxiliary/participle) and/or simple (-er/-ir/-re)
  if (block.formation && typeof block.formation === 'object') {
    const F = block.formation;

    // For compound tenses, show auxiliary/participle info
    if (F.auxiliary && String(F.auxiliary).trim()) {
      lines.push(`Auxiliary — ${F.auxiliary}`);
    }
    if (F.participle && String(F.participle).trim()) {
      lines.push(`Participle — ${F.participle}`);
    }

    // For simple tenses with group-specific rules, show only the matching group
    if (groupKey && F[groupKey]) {
      pushGroupFormation(groupKey, F[groupKey]);
    }
  }

  // Alternate schema: top-level stem_rule/endings (applies to tense broadly)
  if (block.stem_rule && String(block.stem_rule).trim()) {
    lines.push(block.stem_rule.trim());
  }
  if (block.endings && typeof block.endings === 'object') {
    const s = fmtEndings(block.endings);
    if (s) lines.push(`Endings — ${s}`);
  }

  // Agreement / auxiliary rules straight from file
  if (block.agreement && String(block.agreement).trim()) {
    lines.push(block.agreement.trim());
  }
  if (block.auxiliary_rules && typeof block.auxiliary_rules === 'object') {
    const ar = block.auxiliary_rules;
    if (ar.default && String(ar.default).trim()) {
      lines.push(`Auxiliary (default) — ${ar.default.trim()}`);
    }
    if (ar.reflexive && String(ar.reflexive).trim()) {
      lines.push(`Reflexive — ${ar.reflexive.trim()}`);
    }
  }

  // Notes from file
  if (Array.isArray(block.notes)) {
    for (const n of block.notes) {
      const t = (n ?? '').toString().trim();
      if (t) lines.push(t);
    }
  }

  state.drillSession.help = lines.length ? { lines } : null;
}


function getRecognizer(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.continuous = true;
  r.interimResults = true;
  r.lang = state.speech.lang || 'fr-FR';
  return r;
}

function startTranscription(){
  if (state.speech.isOn) return;
  const r = getRecognizer();
  if (!r) {
    alert('SpeechRecognition not supported in this browser. Try Chrome/Edge on https://');
    return;
  }
  state.speech.interim = '';
  state.speech.final = '';
  state.speech.isOn = true;
  state._recog = r;

  r.onresult = (evt) => {
    let interim = '';
    let final = state.speech.final || '';
    for (let i = evt.resultIndex; i < evt.results.length; i++) {
      const res = evt.results[i];
      const txt = res[0].transcript || '';
      if (res.isFinal) final += (final && !final.endsWith(' ') ? ' ' : '') + txt.trim();
      else interim += txt;
    }
    state.speech.interim = interim.trim();
    state.speech.final = final.trim();

    // append to QA answer as final fragments arrive
    if (state.speech.appendToQA && final) {
      // only append the delta since last time
      const cur = (state.newQA.a || '').trim();
      const want = final;
      if (!cur || !want.startsWith(cur)) {
        // simple fallback: set to full final
        state.newQA.a = want;
      } else {
        // nothing to do; already in there
      }
    }
  };

  r.onerror = (e) => {
    console.warn('[Speech] error', e);
    stopTranscription(); // gracefully stop
  };

  r.onend = () => {
    // Some browsers auto-stop after silence; if user still wants it on, restart
    if (state.speech.isOn && state._recog) {
      try { state._recog.start(); } catch { /* no-op */ }
    }
  };

  try { r.start(); } catch (e) {
    console.warn('[Speech] start failed', e);
    state.speech.isOn = false;
    state._recog = null;
  }
}

function stopTranscription(){
  state.speech.isOn = false;
  try { state._recog && state._recog.stop(); } catch {}
  state._recog = null;
}

function clearTranscript(){
  state.speech.interim = '';
  state.speech.final = '';
}

function setSpeechLang(lang){
  state.speech.lang = lang;
  // if currently listening, restart in the new language
  if (state.speech.isOn) {
    stopTranscription();
    startTranscription();
  }
}

// ---- OPFS polyfill helpers (use native Origin Private File System) ----
async function opfsWrite(path, blob){
  const root = await navigator.storage.getDirectory(); // requires https or localhost
  const parts = path.split('/').filter(Boolean);
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true });
  }
  const name = parts[parts.length - 1];
  const fh = await dir.getFileHandle(name, { create: true });
  const ws = await fh.createWritable();
  await ws.write(blob);
  await ws.close();
}

async function opfsRead(path){
  const root = await navigator.storage.getDirectory();
  const parts = path.split('/').filter(Boolean);
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]); // throws if missing
  }
  const name = parts[parts.length - 1];
  const fh = await dir.getFileHandle(name);
  const file = await fh.getFile();
  return new Blob([await file.arrayBuffer()], { type: file.type || 'application/octet-stream' });
}

async function opfsRemove(path){
  const root = await navigator.storage.getDirectory();
  const parts = path.split('/').filter(Boolean);
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]);
  }
  const name = parts[parts.length - 1];
  await dir.removeEntry(name);
}

// ---- SAVE: audio + metadata (keeps Dexie PK id) ----
async function persistRecording({ blob, name, mime, transcript, question, answer }) {
  const dir = 'recordings';
  const path = `${dir}/${name}`;

  // Write audio file to OPFS (use your helper if available; else fallback)
  try {
    if (opfs?.writeFile) await opfs.writeFile(path, blob);
    else await opfsWrite(path, blob); // your earlier polyfill
  } catch (e) {
    console.warn('[OPFS] write fail, storing metadata only:', e);
  }

  const rec = {
    name,
    size: blob.size,
    path,
    mime: mime || 'audio/webm',
    createdAt: new Date().toISOString(),
    transcript: (transcript || '').trim(),
    question: (question || '').trim(),   // NEW: snapshot question
    answer: (answer || '').trim()
  };

  const id = await db.recordings.add(rec); // <-- Dexie PK
  return { id, ...rec };
}


// ---- LOAD: rehydrate all recordings (keep id) ----
async function loadRecordingsFromDB(){
  const rows = await db.recordings.orderBy('createdAt').reverse().toArray();
  const hydrated = [];
  for (const r of rows) {
    try {
      const blob = opfs?.readFile ? await opfs.readFile(r.path) : await opfsRead(r.path);
      const url = URL.createObjectURL(blob);
      hydrated.push({ ...r, url }); // <-- keep r.id
    } catch (e) {
      console.warn('[OPFS] read fail for', r.path, e);
      hydrated.push({ ...r, url: '' });
    }
  }
  state.recordings = hydrated;
}

/*
async function reallyDeleteRecording(r){
  try { if (r?.url) URL.revokeObjectURL(r.url); } catch {}
  try {
    if (r?.path) {
      if (opfs?.removeFile) await opfs.removeFile(r.path);
      else await opfsRemove(r.path);
    }
  } catch (e) {
    console.warn('[OPFS] remove fail', e);
  }
  try {
    const row = await db.recordings.where('name').equals(r.name).first();
    if (row?.id != null) await db.recordings.delete(row.id);
  } catch (e) {
    console.warn('[DB] delete fail', e);
  }
  state.recordings = state.recordings.filter(x => x.name !== r.name);
}
*/

// ---- Scroll lock helpers ----
function getScroll() { return { x: window.scrollX, y: window.scrollY }; }
function restoreScroll(pos) { window.scrollTo(pos.x, pos.y); }
async function withScrollLock(run) {
  const pos = getScroll();
  await run();               // run your existing logic
  await Vue.nextTick();      // wait for DOM to update
  restoreScroll(pos);        // put viewport back exactly
}

// ---- Find recording's PK id robustly (works even without indexes) ----
async function findRecordingId(r){
  if (r?.id != null) return r.id;

  // Try fast paths (work if you indexed these)
  try {
    if (r?.path && db.recordings.where) {
      const row = await db.recordings.where('path').equals(r.path).first();
      if (row?.id != null) return row.id;
    }
  } catch {} // ignore if 'path' isn't indexed

  try {
    if (r?.name && db.recordings.where) {
      const row = await db.recordings.where('name').equals(r.name).first();
      if (row?.id != null) return row.id;
    }
  } catch {} // ignore if 'name' isn't indexed

  // Guaranteed fallback: scan (works even with no indexes)
  const rows = await db.recordings.toArray();
  const hit = rows.find(x =>
    (r?.path && x.path === r.path) ||
    (r?.name && x.name === r.name)
  );
  return hit?.id ?? null;
}


    const methods = {
      // vocab
      reloadVocabByTag:   () => Vocab.reloadVocabByTag(db, state),
      addCard:            () => Vocab.addCard(db, state),
      deleteCard:         (id) => Vocab.deleteCard(db, id, state),
      reshuffleVocabDeck: () => Vocab.reshuffleVocabDeck(state),
      nextVocabCard:      () => Vocab.nextVocabCard(state),
      currentVocabCard:   () => (state.vocab.deck[state.vocab.deckPtr] || null),
      rate,

      // drill tag filters
      toggleIncludeTag, // defined earlier
      clearIncludeTags,  // defined earlier
      toggleExcludeTag,
      clearExcludeTags,


      // drills prefs/save
      saveDrillPrefs: () => saveDrillPrefs(db, state),

      // verbs CRUD
      addVerb: async () => {
        const id = await Verb.addVerb(db, state.newVerb);
        state.verbs = await db.verbs.orderBy('infinitive').toArray();
        state.newVerb = { infinitive:'', english:'', tags:'' };
        return id;
      },
      deleteVerb: async (v) => {
        await Verb.deleteVerb(db, v);
        state.verbs = state.verbs.filter(x => x.id !== v.id);
      },

      // recordings/QA (place your original bodies here)
      // --- Recorder methods (paste into methods = { ... } ) ---
      startTranscription,
      stopTranscription,
      clearTranscript,
      setSpeechLang,

async startRecording(){
  if (state.isRecording) return;
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Recording not supported in this browser.');
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');

    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    state.mediaRecorder = mr;
    state.chunks = [];
    state.isRecording = true;

    // (optional) auto-start live transcription
    methods.startTranscription?.();

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) state.chunks.push(e.data);
    };

    mr.onerror = (e) => {
      console.error('[Recorder] error', e);
      alert('Recorder error: ' + (e.error?.message || e.message || e.name));
      try { mr.stop(); } catch {}
    };

  mr.onstop = async () => {
  try {
    const blob = new Blob(state.chunks, { type: mime || 'audio/webm' });
    const ts = new Date();
    const uuid = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    const name = `rec-${ts.toISOString().replace(/[:.]/g, '-')}-${uuid}.webm`;

    // snapshot data
    const transcript = state.speech?.final || '';
    const question   = state.newQA?.q || '';
    const answer     = state.newQA?.a || '';

    // persist to OPFS + Dexie  (returns { id, ... })
    const saved = await persistRecording({
      blob,
      name,
      mime: mime || 'audio/webm',
      transcript,
      question,
      answer
    });

    // hydrate a URL for immediate playback; KEEP the id for deletion later
    const url = URL.createObjectURL(blob);
    state.recordings.unshift({ ...saved, url });

    // (optional) clear inputs
    // state.newQA = { q: '', a: '' };

  } catch (err) {
    console.error('[Recorder] assemble/persist error', err);
  } finally {
    state.chunks = [];
    state.isRecording = false;
    try { stream.getTracks().forEach(t => t.stop()); } catch {}
    state.mediaRecorder = null;
    methods.stopTranscription?.();
  }
};


    mr.start();
  } catch (err) {
    console.error('[Recorder] start failed', err);
    alert('Microphone permission was denied or unavailable.');
    state.isRecording = false;
  }
},

stopRecording(){
  try {
    // ❌ Do not reference `blob` here
    if (state.mediaRecorder?.state === 'recording') {
      state.mediaRecorder.stop(); // onstop will build the Blob
    } else {
      state.isRecording = false;
      methods.stopTranscription?.();
    }
  } catch (e) {
    console.error('[Recorder] stop error', e);
    state.isRecording = false;
    methods.stopTranscription?.();
  }
},

deleteRecording: async (r) => {
  if (!r) return;

  // 1) Revoke current ObjectURL (memory)
  try { if (r.url) URL.revokeObjectURL(r.url); } catch {}

  // 2) Remove the OPFS file (ignore errors; DB delete will still remove metadata)
  try {
    if (r.path) {
      if (opfs?.removeFile) await opfs.removeFile(r.path);
      else await opfsRemove(r.path);
    }
  } catch (e) {
    console.warn('[OPFS] remove failed:', e);
  }

  // 3) Resolve Dexie PK id robustly and delete
  try {
    const id = await findRecordingId(r);
    if (id != null) {
      await db.recordings.delete(id);
    } else if (r.path || r.name) {
      // ultimate fallback: filter-delete (rare)
      const rows = await db.recordings.toArray();
      const victim = rows.find(x => (r.path && x.path === r.path) || (r.name && x.name === r.name));
      if (victim?.id != null) await db.recordings.delete(victim.id);
    }
  } catch (e) {
    console.warn('[Dexie] delete failed:', e);
  }

  // 4) Refresh the UI from source of truth (DB)
  await loadRecordingsFromDB();
},



saveQA(){
  const q = (state.newQA.q || '').trim();
  const a = (state.newQA.a || '').trim();
  if (!q && !a) return;
  // If you have a notes table, persist here; for now, just clear inputs.
  state.newQA = { q: '', a: '' };
},


      // ------------------- DRILL FLOW -------------------
      startDrill(){
        // reset session
        state.drillSession.running = true;
        state.drillSession.question = null;
        state.drillSession.input = '';
        state.drillSession.correct = null;
        state.drillSession.total = 0;
        state.drillSession.right = 0;
        state.drillSession.history = [];
        state.drillSession.help = null;
        state.drillSession.side = { english: '—', fr: '—', en: '—' };

        // build first question
        const q = buildQuestion();
        if (!q) {
          state.drillSession.running = false;
          alert('No drillable items. Add verbs or adjust filters/tenses/persons.');
          return;
        }
        state.drillSession.question = {
          prompt: { label: q.label },
          answer: q.answer,
          meta: { infinitive: q.verb.infinitive, english: q.verb.english || '', person: q.personLabel, tense: q.tenseLabel }
        };
        state.drillSession.side.english = q.verb.english || '';
        attachExamplesAndRules(q);

      },

      checkDrill(){
        
        const sess = state.drillSession;
        if (!sess.running || !sess.question) return;

        const isRight = answersEqual(sess.input, sess.question.answer);
        sess.correct = isRight;
        sess.total += 1;
        if (isRight)  
          sess.right += 1;
        bumpGlobal(isRight);
        
        // record history
        sess.history.push({
          q: sess.question.prompt.label,
          expected: sess.question.answer,
          given: sess.input,
          ok: isRight
        });

        // auto-next if enabled and correct
        if (isRight && state.drillPrefs.autoNext) {
          setTimeout(() => { methods.nextDrill(); }, 350);
        }
      },

      promptProfileName(){
  const val = prompt('Display name:', state.profileName || '');
  if (val !== null) {
    state.profileName = val.trim();
    saveGlobalToSettingsDebounced();
  }
},
exportGlobalStats(){
  const blob = new Blob([JSON.stringify({
    profileName: state.profileName,
    globalStats: state.globalStats,
    todayStats:  state.todayStats
  }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `drill-stats-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
},
resetTodayStats(){
  state.todayStats = { right: 0, total: 0, date: new Date().toISOString().slice(0,10) };
  saveGlobalToSettingsDebounced();
},


  nextDrill() {
    return withScrollLock(async () => {
      // ⬇️ your original next-drill body
      const q = buildQuestion();
      if (!q) {
        state.drillSession.running = false;
        alert('No more questions available with current filters.');
        return;
      }
      state.drillSession.question = {
        prompt: { label: q.label },
        answer: q.answer,
        meta: {
          infinitive: q.verb.infinitive,
          english: q.verb.english || '',
          person: q.personLabel,
          tense: q.tenseLabel
        }
      };
      state.drillSession.side.english = q.verb.english || '';
      attachExamplesAndRules(q);

      // reset input/flags
      state.drillSession.input = '';
      state.drillSession.correct = null;
    });
  },


      stopDrill(){
        state.drillSession.running = false;
        state.drillSession.question = null;
        state.drillSession.input = '';
        state.drillSession.correct = null;
      },
      // --------------------------------------------------

      // notes import (reuse your original)
      importNotesAndSeedCards(/*opts*/){ /* unchanged body */ },

      // settings/plan
      saveSettings: () => db.settings.put({ ...state.settings, translator: state.translator }),
      savePlan:     () => db.plan.put(state.plan),

      loadAll
    };

    // boot
    methods.loadAll();

    // expose legacy top-level bindings so existing templates keep working
    const refs = toRefs(state);
    return { ...refs, ...methods, state, methods, tagPills };
  }
})//.mount('#app');
const vm = vueApp.mount('#app');
window.parlApp = vm;  
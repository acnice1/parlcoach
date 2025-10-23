// ParlFR — app.js
// Local-first IndexedDB (Dexie); seed examples from verbs.top20.json; drills first.

// =========================== Dexie (IndexedDB) ===============================
if (!window.Dexie) {
  alert('Dexie failed to load. Check your connection or CDN.');
  throw new Error('Dexie missing');
}

const db = new Dexie('parlcoach');
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
const INTERNAL_TENSES = ['present','passeCompose','imparfait','plusQueParfait','futur','conditionnelPresent','subjonctifPresent','imperatif'];
const DISPLAY_TENSE = {
  present:'Présent', passeCompose:'Passé composé', imparfait:'Imparfait', plusQueParfait:'Plus-que-parfait',
  futur:'Futur simple', conditionnelPresent:'Conditionnel présent', subjonctifPresent:'Subjonctif présent',
  imperatif:'Impératif'
};
const PERSON_KEY = ['je','tu','il/elle/on','nous','vous','ils/elles'];

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
};
const IRREGULAR_IMPARFAIT_STEM = { 'être':'ét','avoir':'av','aller':'all','faire':'fais','pouvoir':'pouv','vouloir':'voul','devoir':'dev','savoir':'sav','venir':'ven','prendre':'pren','mettre':'mett','dire':'dis','voir':'voy' };
const FUTUR_STEM_IRREG = { 'être':'ser','avoir':'aur','aller':'ir','faire':'fer','pouvoir':'pourr','vouloir':'voudr','devoir':'devr','savoir':'saur','venir':'viendr','prendre':'prendr','mettre':'mettr','dire':'dir','voir':'verr' };
const IMPARFAIT_END = ['ais','ais','ait','ions','iez','aient'];
const FUTUR_END = ['ai','as','a','ons','ez','ont'];

function participePasseRegular(inf){ if (inf.endsWith('er')) return inf.slice(0,-2)+'é'; if (inf.endsWith('ir')) return inf.slice(0,-2)+'i'; if (inf.endsWith('re')) return inf.slice(0,-2)+'u'; return inf; }
function presentNousStem(inf){
  if (IRREGULAR_PRESENT[inf]) return IRREGULAR_PRESENT[inf][3].replace(/ons$/,'');
  if (inf.endsWith('ir')) return inf.slice(0,-2)+'iss';
  if (inf.endsWith('er') || inf.endsWith('re')) return inf.slice(0,-2);
  return inf;
}
function presentRegular(inf,i){
  if (IRREGULAR_PRESENT[inf]) return IRREGULAR_PRESENT[inf][i];
  if (inf.endsWith('er')) return inf.slice(0,-2)+['e','es','e','ons','ez','ent'][i];
  if (inf.endsWith('ir')) return inf.slice(0,-2)+['is','is','it','issons','issez','issent'][i];
  if (inf.endsWith('re')) return inf.slice(0,-2)+['s','s','','ons','ez','ent'][i];
  return inf;
}
function imparfait(inf,i){ return (IRREGULAR_IMPARFAIT_STEM[inf] ?? presentNousStem(inf)) + IMPARFAIT_END[i]; }
function futurSimple(inf,i){ const stem = FUTUR_STEM_IRREG[inf] ?? (inf.endsWith('re') ? inf.slice(0,-1) : inf); return stem + FUTUR_END[i]; }
function passeCompose(inf,i){ const avoir = ['ai','as','a','avons','avez','ont'][i]; const pp = participePasseRegular(inf); return `${avoir} ${pp}`; }
function englishGlossDefault(inf){ if (inf.endsWith('er')||inf.endsWith('ir')||inf.endsWith('re')) return 'to '+inf.slice(0,-2); return 'to '+inf; }

// ======================== Robust Top-200 JSON loader ==========================
async function loadTop200JSON(){
  const url = './top200_french_verbs_conjugations.json?ts=' + Date.now();
  try {
    console.info('[Top200] Fetching', url);
    const res = await fetch(url, { cache:'no-store', headers:{ 'accept':'application/json, text/plain;q=0.6, */*;q=0.5' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = (res.headers.get('content-type')||'').toLowerCase();
    const data = ct.includes('application/json') ? await res.json() : JSON.parse(await res.text());
    console.info('[Top200] Loaded via fetch:', data?.verbs?.length ?? 0, 'verbs');
    return data;
  } catch (e) {
    console.warn('[Top200] Fetch failed:', e.message);
  }
  const tag = document.getElementById('top200-json');
  if (tag?.textContent) {
    try { const inline = JSON.parse(tag.textContent); console.info('[Top200] Loaded inline:', inline?.verbs?.length ?? 0); return inline; }
    catch (e) { console.error('[Top200] Inline JSON parse failed:', e.message); }
  }
  console.error('[Top200] No dataset available. Ensure JSON is next to index.html and served over HTTP.');
  return null;
}

// ============================== Dataset helpers ==============================
function getConjFromDataset(verbRow, tenseId, personIndex){
  const conj = verbRow?.conj; if (!conj) return null;
  const tenseName = DISPLAY_TENSE[tenseId] || tenseId;
  const tenseBlock = conj[tenseName]; if (!tenseBlock) return null;
  const lookupKey = (personIndex === 2) ? 'il/elle/on' : PERSON_KEY[personIndex];
  const form = tenseBlock[lookupKey]; if (typeof form !== 'string') return null;
  const cleaned = form.trim(); return cleaned || null;
}
function makeFullAnswer(tenseId, personIndex, plainForm){
  if (tenseId === 'imperatif') return plainForm; // no subject
  const subj = PRONOUNS[personIndex];
  if (personIndex===0) return isVowelStart(plainForm) ? `j'${plainForm}` : `je ${plainForm}`;
  return `${subj} ${plainForm}`;
}
function prettyTense(t){ return DISPLAY_TENSE[t] || t; }

// ========================= Seed example loader (NEW) =========================
// One curated example (il/elle/on) per tense, stored in verbs.top20.json
const EXTERNAL_VERBS_URL = 'verbs.top20.json?v=1';
const seedVerbsByInf = new Map();

// Map internal drill keys -> example JSON keys
const TENSE_EXAMPLE_KEY = {
  present: 'present',
  passeCompose: 'passeCompose',
  imparfait: 'imparfait',
  plusQueParfait: 'plusQueParfait',
  futur: 'futurSimple',                // internal 'futur' maps to JSON 'futurSimple'
  conditionnelPresent: 'conditionnelPresent',
  subjonctifPresent: 'subjonctifPresent',
  imperatif: 'imperatif'
};

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
    alert('Could not load seed verb examples (verbs.top20.json).');
  }
}

// Prefer a user-edited verb in Dexie if you later add examples there; else seed
function resolveVerbExamples(infinitive){
  // (future-ready) if you ever store examples inside db.verbs, prefer those:
  // const mine = /* lookup by infinitive from a map you maintain */;
  // if (mine?.examples) return mine.examples;
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

// ================================ Vue App ====================================
const { createApp, reactive, computed, onMounted, ref, nextTick } = Vue;

createApp({
  setup(){
    const state = reactive({
      jsonEditor: { open:false, verb:null, text:'', readonly:false, error:'' },

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
      drillSession: { running:false, question:null, input:'', correct:null, total:0, right:0, history:[] },

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

    // ---------------------------- Load / Save --------------------------------
    async function loadAll(){
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

      await loadExternalVerbs(); // <— NEW: load curated examples

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
    async function loadTop200AndNormalize(){
      const data = await loadTop200JSON(); if (!data) return [];
      const arr = Array.isArray(data?.verbs) ? data.verbs : []; if (!arr.length) return [];
      return arr.map(v => {
        const inf = (v.verb || '').trim(); const conj = v.tenses || {};
        return { infinitive: inf, english: englishGlossDefault(inf), tags: ['top200'], conj };
      });
    }
    async function maybeSeedVerbsFromTop200(){
      const count = await db.verbs.count(); if (count > 0) { console.info('[Top200] verbs exists:', count); return; }
      let rows = []; try { rows = await loadTop200AndNormalize(); } catch (e) { console.warn('[Top200] loader crashed:', e); }
      if (rows.length) { console.info('[Top200] seeding', rows.length); await db.verbs.bulkAdd(rows); return; }
      // minimal fallback
      const seed = [
        { infinitive:'être', english:'to be', tags:['core'] },
        { infinitive:'avoir', english:'to have', tags:['core'] },
        { infinitive:'aller', english:'to go', tags:['core'] },
        { infinitive:'faire', english:'to do/make', tags:['core'] },
        { infinitive:'pouvoir', english:'to be able to/can', tags:['core'] },
        { infinitive:'vouloir', english:'to want', tags:['core'] },
        { infinitive:'devoir', english:'to have to/must', tags:['core'] },
        { infinitive:'savoir', english:'to know', tags:['core'] },
        { infinitive:'venir', english:'to come', tags:['core'] },
        { infinitive:'parler', english:'to speak', tags:['regular','er'] },
        { infinitive:'finir', english:'to finish', tags:['regular','ir'] },
        { infinitive:'prendre', english:'to take', tags:[] },
      ];
      await db.verbs.bulkAdd(seed);
    }
    // Self-heal: ensure seed verbs are tagged & present
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

    // ------------------------------- DRILLS ----------------------------------
    function filterVerbsForDrill(list){
      const { includeOnlyTags, excludeTags } = state.drillPrefs;
      let out = list.slice();
      if (includeOnlyTags?.length) out = out.filter(v => (v.tags||[]).some(t => includeOnlyTags.includes(t)));
      if (excludeTags?.length) out = out.filter(v => !(v.tags||[]).some(t => excludeTags.includes(t)));
      return out;
    }
    function conjugateFromAny(verbRow, tense, personIndex){
      const dsForm = getConjFromDataset(verbRow, tense, personIndex);
      if (dsForm) return makeFullAnswer(tense, personIndex, dsForm);
      let plain = '';
      switch (tense) {
        case 'present': plain = presentRegular(verbRow.infinitive, personIndex); break;
        case 'imparfait': plain = imparfait(verbRow.infinitive, personIndex); break;
        case 'futur': plain = futurSimple(verbRow.infinitive, personIndex); break;
        case 'passeCompose': plain = passeCompose(verbRow.infinitive, personIndex); break;
        case 'plusQueParfait': plain = 'avais ' + participePasseRegular(verbRow.infinitive); break;
        case 'conditionnelPresent': {
          const fs = futurSimple(verbRow.infinitive, personIndex);
          const ends = ['ais','ais','ait','ions','iez','aient'];
          plain = fs.replace(/(ai|as|a|ons|ez|ont)$/, ends[personIndex]); break;
        }
        case 'subjonctifPresent': plain = presentNousStem(verbRow.infinitive)+['e','es','e','ions','iez','ent'][personIndex]; break;
        case 'imperatif': return presentRegular(verbRow.infinitive, personIndex);
        default: plain = presentRegular(verbRow.infinitive, personIndex);
      }
      return makeFullAnswer(tense, personIndex, plain);
    }

    // Hard stop: no synthetic examples. Only curated JSON.
    function exampleSentence(){
      return null;
    }

    function newDrillQuestion(){
      const pool = filterVerbsForDrill(state.verbs);
      if (!pool.length) return null;
      const verb = randChoice(pool);
      const tensesPool = state.drillPrefs.tenses.length ? state.drillPrefs.tenses : ['present'];
      const personsPool = state.drillPrefs.persons.length ? state.drillPrefs.persons : [0,1,2,3,4,5];
      const tense = randChoice(tensesPool), personIndex = randChoice(personsPool);
      const answer = conjugateFromAny(verb, tense, personIndex);
      const prompt = { infinitive: verb.infinitive, english: verb.english, tense, personIndex,
        label: `${PRONOUNS[personIndex]} — ${verb.infinitive} — ${prettyTense(tense)}` };
      const ex = getExample(verb.infinitive, tense); // <— curated (il/elle/on) example, may be null
      return { verb, prompt, answer, ex };
    }
    function startDrill(){
      state.drillSession = { running:true, question:newDrillQuestion(), input:'', correct:null, total:0, right:0, history:[] };
      if (!state.drillSession.question) { alert('No verbs available for drill. Add some first.'); state.drillSession.running=false; return; }
      nextTick(()=>drillInputEl.value?.focus());
    }
    function normalize(s){ return (s||'').toLowerCase().replaceAll('’',"'").replace(/\s+/g,' ').trim(); }
    function checkDrill(){
      if (!state.drillSession.running || !state.drillSession.question) return;
      const ok = normalize(state.drillSession.input) === normalize(state.drillSession.question.answer);
      state.drillSession.total += 1; if (ok) state.drillSession.right += 1;
      state.drillSession.correct = ok;
      state.drillSession.history.unshift({
        at: todayISO(), prompt: state.drillSession.question.prompt,
        expected: state.drillSession.question.answer, got: state.drillSession.input, ok
      });
    }
    function nextDrill(){
      state.drillSession.input=''; state.drillSession.correct=null;
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
      console.debug('[JSON] open', verb?.infinitive, { readonly });
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
      ...Vue.toRefs(state), myVerbs, seedVerbs, drillInputEl,
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

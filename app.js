// app.js (rebuilt, with UI toggle persistence + Vocab pills without Gender)

import DrillPanel from "./js/components/DrillPanel.js?v=1";
import VocabPanel from "./js/components/VocabPanel.js?v=1";
import RecorderPanel from "./js/components/RecorderPanel.js?v=1";
import ProfileWidget from "./js/components/ProfileWidget.js?v=1";
import DataPanel from "./js/components/DataPanel.js?v=4";

import { initDexie, opfs, TAG_PILL_OPTIONS } from "./js/db.js?v=1";
import {
  sm2Schedule,
  fixedSchedule,
  loadDataset,
  loadRules,
  saveDrillPrefs,
} from "./js/drills.js?v=1";
import * as Vocab from "./js/vocab.js?v=1";
import * as Verb from "./js/verbs.js?v=1";
import { answersEqual, toArr } from "./js/utils.js?v=1";

const db = initDexie();
const { createApp, reactive, ref, watch, toRefs, nextTick } = Vue;


/* // Debounce utility
function debounce(fn, ms = 300){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
  */
 
function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const vueApp = Vue.createApp({
  components: {
    DrillPanel,
    VocabPanel,
    RecorderPanel,
    ProfileWidget,
    DataPanel,
  },

  setup() {
    // ------------------------- STATE -------------------------
    const state = reactive({
      // Profile + stats
      profileName: "",
      globalStats: {
        right: 0,
        total: 0,
        since: new Date().toISOString().slice(0, 10),
      },
      todayStats: {
        right: 0,
        total: 0,
        date: new Date().toISOString().slice(0, 10),
      },

      //  Data import/export
      csv: { rows: [], headers: [], meta: null },
wordPicker: { items: [], selected: {}, listName: "", savedLists: [], activeList: "" },
notesTagFilter: "",

      // UI flags (persisted)
      ui: {
        showVocabTags: false, // <— persisted toggle
      },

      exampleMap: new Map(),
      jsonEditor: {
        open: false,
        verb: null,
        text: "",
        readonly: false,
        error: "",
      },
      showEnglishTranslation: true,

      // Data
      rules: null,
      dataset: null,

      //  VOCAB
      // Mode: 'review' (JSON) vs 'flashcards' (SRS)
      vocabMode: "review",
      // Vocab filters (distinct from Drills) — NO gender here
      vocabFilters: { topic: [], tags: [], pos: [] },
      vocabPills: { topic: [], tags: [], pos: [] },

      vocab: {
        cards: [],
        deck: [],
        deckPtr: 0,
        prefs: { randomize: true, withoutReplacement: true },
      },

      flashcards: {
        allCards: [],
        dueCards: [],
        currentCard: null,
        showBack: false,
        counts: { total: 0, learned: 0 },
        vocabTagFilter: "", // keep your tag filter, but scoped to SRS
      },

      // Top-level tabs
      tab: "learn",
      learnTab: "drills",

      // Vocab quick add
      newVocabFront: "",
      newVocabBack: "",

      // SRS queue (for classic card pane)

      vocabTagFilter: "",
      notes: [],
      notesTagFilter: "",

      // Verbs store
      verbs: [],
      newVerb: { infinitive: "", english: "", tags: "" },

      // Drill prefs + session
      drillPrefs: {
        key: "v1",
        tenses: [
          "present",
          "passeCompose",
          "imparfait",
          "plusQueParfait",
          "futur",
          "conditionnelPresent",
          "subjonctifPresent",
          "imperatif",
        ],
        persons: [0, 1, 2, 3, 4, 5],
        includeOnlyTags: [],
        excludeTags: [],
        autoNext: true,
        filterGroups: ["er", "ir", "re"],
        regularity: "any",
      },
      drillSession: {
        running: false,
        question: null,
        input: "",
        correct: null,
        total: 0,
        right: 0,
        history: [],
        help: null,
        side: { english: "—", fr: "—", en: "—" },
      },

      // Recorder / Interview bank
      questionBank: [],
      qFilters: {
        category: "",
        tag: "",
        showSample: true,
        insertSampleOnPick: false,
      },
      _showPaste: false,
      _pasteText: "",
      _pasteErr: "",

      isRecording: false,
      mediaRecorder: null,
      chunks: [],
      recordings: [],
      newQA: { q: "", a: "" },

      speech: {
        lang: "fr-FR",
        isOn: false,
        interim: "",
        final: "",
        appendToQA: true,
        supported: false,
        why: "",
      },
      _recog: null,

      // Plan & Settings
      plan: {
        key: "v1",
        goal: "Government B",
        dailyMinutes: 60,
        focus: "listening, oral, vocab",
        weeklySchedule: "",
        notes: "",
      },
      settings: {
        key: "v1",
        srsMode: "SM2",
        fixedIntervals: [1, 3, 7, 14, 30],
        translator: { endpoint: "", apiKey: "" },
      },
      fixedIntervalsText: "1,3,7,14,30",
      storagePersisted: false,
      translator: { endpoint: "", apiKey: "" },
    });

    // -------------------- Generic helpers --------------------
    function autosizeTextarea(e) {
      const el = e && e.target;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }

    // Speech support
    function detectSpeechSupport() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const secure =
        location.protocol === "https:" || location.hostname === "localhost";
      state.speech.supported = !!SR && secure;
      state.speech.why = !secure
        ? "Needs HTTPS or localhost."
        : !SR
        ? "SpeechRecognition not available in this browser."
        : "";
    }
    detectSpeechSupport();

    // Example map placeholder (may be loaded later)
    state.exampleMap = new Map();

 // Drills Tag Pills (existing set for drills)

 // Drills Tag Pills (existing set for drills)
 const tagPills = ref(TAG_PILL_OPTIONS.slice());
 // Expose to state so DrillPanel can render chips
 state.tagPills = tagPills.value;

    // -------------------- Vocab Pills (distinct) --------------------
    function toggleVocabPill(group, value) {
      const allowed = ["topic", "tags", "pos"];
      if (!allowed.includes(group)) return;
      const arr = state.vocabFilters[group] || [];
      const i = arr.indexOf(value);
      if (i === -1) arr.push(value);
      else arr.splice(i, 1);
      state.vocabFilters[group] = [...arr];
      applyVocabPillFilter();
    }
    function clearVocabPills(group) {
      const allowed = ["topic", "tags", "pos"];
      if (!allowed.includes(group)) return;
      state.vocabFilters[group] = [];
      applyVocabPillFilter();
    }
    function clearAllVocabPills() {
      state.vocabFilters.topic = [];
      state.vocabFilters.tags = [];
      state.vocabFilters.pos = [];
      applyVocabPillFilter();
    }
    function applyVocabPillFilter() {
      const { topic, tags, pos } = state.vocabFilters;
      const cards = Array.isArray(state.vocab.cards) ? state.vocab.cards : [];
      const filtered = cards.filter((c) => {
        if (topic.length && !topic.includes(c?.topic)) return false;
        if (tags.length) {
          const ct = Array.isArray(c?.tags) ? c.tags : [];
          if (!ct.some((t) => tags.includes(t))) return false;
        }
        if (pos.length && !pos.includes(c?.partOfSpeech)) return false;
        return true;
      });
      const deck = [...filtered];
      if (state.vocab?.prefs?.randomize) {
        for (let i = deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [deck[i], deck[j]] = [deck[j], deck[i]];
        }
      }
      state.vocab.deck = deck;
      state.vocab.deckPtr = 0;
    }

    // Render FR w/ article for nouns
    function renderFr(card) {
      // 1) Pull the French surface form from any known field shape
      const w = (card?.fr ?? card?.front ?? card?.french ?? "").trim();

      if (!w) return w;

      // 2) If the string already contains an article, keep it as-is
      if (/^(l['’]\s*|le\s+|la\s+)/i.test(w)) return w;

      // 3) Decide if it's a noun:
      //    - explicit flags from common schemas: partOfSpeech / pos / tags
      const posStr = String(
        card?.partOfSpeech || card?.pos || ""
      ).toLowerCase();
      const tagsArr = Array.isArray(card?.tags)
        ? card.tags.map((t) => String(t).toLowerCase())
        : [];
      const isNoun =
        posStr.includes("noun") ||
        tagsArr.some((t) => t.startsWith("noun")) ||
        // If gender exists, it’s almost certainly a noun in this dataset
        (card?.gender && String(card.gender).trim() !== "");

      if (!isNoun) return w;

      // 4) Work out the article
      //    - prefer explicit article if given
      //    - otherwise use gender or elision for vowels / mute h
      const startsWithVowelOrMuteH =
        /^[aeiouâêîôûéèëïüœ]/i.test(w) || /^h/i.test(w);

      let article = String(card?.article || "").toLowerCase();
      let gender = String(card?.gender || "").toLowerCase(); // 'm' | 'f'

      if (!article) {
        if (startsWithVowelOrMuteH) {
          article = "l'";
        } else if (gender === "f" || tagsArr.includes("f")) {
          article = "la";
        } else if (gender === "m" || tagsArr.includes("m")) {
          article = "le";
        } else {
          // Unknown gender and no elision → leave bare word rather than guessing
          return w;
        }
      }

      // 5) Normalize elided form
      if (article === "l'") {
        const bare = w.replace(/^l['’]\s*/i, "").trim();
        return `l'${bare}`;
      }
      return `${article} ${w}`;
    }

    // Rebuild vocab deck on prefs change
    watch(
      () => [state.vocab.prefs.randomize, state.vocab.prefs.withoutReplacement],
      () => Vocab.buildVocabDeck(state)
    );

    // -------------------- Drill helpers --------------------
    const TENSE_LABEL = {
      present: "Présent",
      passeCompose: "Passé composé",
      imparfait: "Imparfait",
      plusQueParfait: "Plus-que-parfait",
      futur: "Futur simple",
      conditionnelPresent: "Conditionnel présent",
      subjonctifPresent: "Subjonctif présent",
      imperatif: "Impératif",
    };
    const PERSON_LABELS = [
      "je",
      "tu",
      "il/elle/on",
      "nous",
      "vous",
      "ils/elles",
    ];

    function buildQuestion() {
      if (!state.dataset || !(state.dataset instanceof Map)) return null;

      let pool = state.verbs.slice();
      const inc = Array.isArray(state.drillPrefs.includeOnlyTags)
        ? state.drillPrefs.includeOnlyTags.filter(Boolean)
        : [];
      const exc = Array.isArray(state.drillPrefs.excludeTags)
        ? state.drillPrefs.excludeTags.filter(Boolean)
        : [];

      if (inc.length)
        pool = pool.filter((v) => (v.tags || []).some((t) => inc.includes(t)));
      if (exc.length)
        pool = pool.filter((v) => !(v.tags || []).some((t) => exc.includes(t)));
      if (!pool.length) return null;

      const verb = pool[Math.floor(Math.random() * pool.length)];
      const inf = verb.infinitive;

      const allowedTenses = (state.drillPrefs.tenses || []).filter(
        (k) => TENSE_LABEL[k]
      );
      if (!allowedTenses.length) return null;
      const tenseKey =
        allowedTenses[Math.floor(Math.random() * allowedTenses.length)];
      const tenseLabel = TENSE_LABEL[tenseKey];

      let persons = Array.isArray(state.drillPrefs.persons)
        ? state.drillPrefs.persons.slice()
        : [0, 1, 2, 3, 4, 5];
      if (tenseKey === "imperatif") {
        persons = persons.filter((p) => p === 1 || p === 3 || p === 4);
        if (!persons.length) persons = [1, 3, 4];
      }
      const pIdx = persons[Math.floor(Math.random() * persons.length)];
      const personLabel = PERSON_LABELS[pIdx] || "je";

      const tensesObj = state.dataset.get(inf);
      if (!tensesObj) return null;
      const tenseObj = tensesObj[tenseLabel];
      if (!tenseObj) return null;

      const answer = (tenseObj[personLabel] || "").trim();
      if (!answer) return null;

      const label = `${personLabel} — ${inf} — ${tenseLabel}`;
      return { label, answer, verb, personLabel, tenseLabel };
    }

    // -------------------- Recorder helpers --------------------
    function getRecognizer() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return null;
      const r = new SR();
      r.continuous = true;
      r.interimResults = true;
      r.lang = state.speech.lang || "fr-FR";
      return r;
    }

    function startTranscription() {
      if (state.speech.isOn) return;
      const r = getRecognizer();
      if (!r) {
        alert(
          "SpeechRecognition not supported in this browser. Try Chrome/Edge on https://"
        );
        return;
      }
      state.speech.interim = "";
      state.speech.final = "";
      state.speech.isOn = true;
      state._recog = r;

      r.onresult = (evt) => {
        let interim = "";
        let final = state.speech.final || "";
        for (let i = evt.resultIndex; i < evt.results.length; i++) {
          const res = evt.results[i];
          const txt = res[0].transcript || "";
          if (res.isFinal)
            final += (final && !final.endsWith(" ") ? " " : "") + txt.trim();
          else interim += txt;
        }
        state.speech.interim = interim.trim();
        state.speech.final = final.trim();

        if (state.speech.appendToQA && final) {
          const cur = (state.newQA.a || "").trim();
          const want = final;
          if (!cur || !want.startsWith(cur)) {
            state.newQA.a = want;
          }
        }
      };
      r.onerror = () => {
        stopTranscription();
      };
      r.onend = () => {
        if (state.speech.isOn && state._recog) {
          try {
            state._recog.start();
          } catch {}
        }
      };
      try {
        r.start();
      } catch {
        state.speech.isOn = false;
        state._recog = null;
      }
    }

    function stopTranscription() {
      state.speech.isOn = false;
      try {
        state._recog && state._recog.stop();
      } catch {}
      state._recog = null;
    }

    function clearTranscript() {
      state.speech.interim = "";
      state.speech.final = "";
    }
    function setSpeechLang(lang) {
      state.speech.lang = lang;
      if (state.speech.isOn) {
        stopTranscription();
        startTranscription();
      }
    }

    //

    // -------------------- OPFS helpers --------------------
    async function opfsWrite(path, blob) {
      const root = await navigator.storage.getDirectory();
      const parts = path.split("/").filter(Boolean);
      let dir = root;
      for (let i = 0; i < parts.length - 1; i++)
        dir = await dir.getDirectoryHandle(parts[i], { create: true });
      const name = parts[parts.length - 1];
      const fh = await dir.getFileHandle(name, { create: true });
      const ws = await fh.createWritable();
      await ws.write(blob);
      await ws.close();
    }
    async function opfsRead(path) {
      const root = await navigator.storage.getDirectory();
      const parts = path.split("/").filter(Boolean);
      let dir = root;
      for (let i = 0; i < parts.length - 1; i++)
        dir = await dir.getDirectoryHandle(parts[i]);
      const name = parts[parts.length - 1];
      const fh = await dir.getFileHandle(name);
      const file = await fh.getFile();
      return new Blob([await file.arrayBuffer()], {
        type: file.type || "application/octet-stream",
      });
    }
    async function opfsRemove(path) {
      const root = await navigator.storage.getDirectory();
      const parts = path.split("/").filter(Boolean);
      let dir = root;
      for (let i = 0; i < parts.length - 1; i++)
        dir = await dir.getDirectoryHandle(parts[i]);
      const name = parts[parts.length - 1];
      await dir.removeEntry(name);
    }

    // -------------------- Recordings persistence --------------------
    async function persistRecording({
      blob,
      name,
      mime,
      transcript,
      question,
      answer,
    }) {
      const dir = "recordings";
      const path = `${dir}/${name}`;
      try {
        if (opfs?.writeFile) await opfs.writeFile(path, blob);
        else await opfsWrite(path, blob);
      } catch (e) {
        console.warn("[OPFS] write fail, storing metadata only:", e);
      }
      const rec = {
        name,
        size: blob.size,
        path,
        mime: mime || "audio/webm",
        createdAt: new Date().toISOString(),
        transcript: (transcript || "").trim(),
        question: (question || "").trim(),
        answer: (answer || "").trim(),
      };
      const id = await db.recordings.add(rec);
      return { id, ...rec };
    }

    async function loadRecordingsFromDB() {
      const rows = await db.recordings.orderBy("createdAt").reverse().toArray();
      const hydrated = [];
      for (const r of rows) {
        try {
          const blob = opfs?.readFile
            ? await opfs.readFile(r.path)
            : await opfsRead(r.path);
          const url = URL.createObjectURL(blob);
          hydrated.push({ ...r, url });
        } catch (e) {
          console.warn("[OPFS] read fail for", r.path, e);
          hydrated.push({ ...r, url: "" });
        }
      }
      state.recordings = hydrated;
    }

    async function findRecordingId(r) {
      if (r?.id != null) return r.id;
      try {
        if (r?.path && db.recordings.where) {
          const row = await db.recordings.where("path").equals(r.path).first();
          if (row?.id != null) return row.id;
        }
      } catch {}
      try {
        if (r?.name && db.recordings.where) {
          const row = await db.recordings.where("name").equals(r.name).first();
          if (row?.id != null) return row.id;
        }
      } catch {}
      const rows = await db.recordings.toArray();
      const hit = rows.find(
        (x) => (r?.path && x.path === r.path) || (r?.name && x.name === r.name)
      );
      return hit?.id ?? null;
    }

    // -------------------- Settings persistence helpers --------------------
    const saveSettingsMerged = async (partial) => {
      const existing = (await db.settings.get("v1")) || { key: "v1" };
      await db.settings.put({ ...existing, ...partial, key: "v1" });
    };

    const saveGlobalToSettings = async () => {
      const existing = (await db.settings.get("v1")) || { key: "v1" };
      const today = new Date().toISOString().slice(0, 10);
      const record = {
        key: "v1",
        srsMode: existing.srsMode,
        fixedIntervals: existing.fixedIntervals,
        translator: existing.translator,
        profileName: String(state.profileName || ""),
        globalStats: {
          right: Number(state.globalStats?.right || 0),
          total: Number(state.globalStats?.total || 0),
          since: String(state.globalStats?.since || today),
        },
        todayStats: {
          right: Number(state.todayStats?.right || 0),
          total: Number(state.todayStats?.total || 0),
          date: String(state.todayStats?.date || today),
        },
        // persist UI toggles here
        ui: { ...(existing.ui || {}), showVocabTags: !!state.ui.showVocabTags },
      };
      await db.settings.put(record);
    };
    const saveGlobalToSettingsDebounced = debounce(saveGlobalToSettings, 500);

    // Persist UI changes quickly (only the UI subtree)
    const saveUI = debounce(async () => {
      await saveSettingsMerged({
        ui: { showVocabTags: !!state.ui.showVocabTags },
      });
    }, 200);

    watch(
      () => state.ui.showVocabTags,
      () => {
        saveUI();
      }
    );

    function bumpGlobal(isRight) {
      state.globalStats.total += 1;
      state.todayStats.total += 1;
      if (isRight) {
        state.globalStats.right += 1;
        state.todayStats.right += 1;
      }
      saveGlobalToSettingsDebounced();
    }

    // -------------------- Load-all bootstrap --------------------
    
   async function loadAll() {
      state.dataset = await loadDataset();
      state.rules = await loadRules();

      // -------------------- Examples loading --------------------
      // External examples (optional)
      if (typeof Verb.loadExternalVerbs === "function") {
        try {
          const { map } = await Verb.loadExternalVerbs();
          if (map && map.size) state.exampleMap = map;
        } catch (e) {
          console.warn("[examples] loadExternalVerbs failed:", e);
        }
      }

      const [settings, plan, drill] = await Promise.all([
        db.settings.get("v1"),
        db.plan.get("v1"),
        db.drill.get("v1"),
      ]);

      // Settings → state
      if (settings) {
        state.settings = settings;
        state.fixedIntervalsText = (
          settings.fixedIntervals || [1, 3, 7, 14, 30]
        ).join(",");
        state.translator = settings.translator || { endpoint: "", apiKey: "" };

        // Hydrate persisted UI toggles
        if (settings.ui && typeof settings.ui === "object") {
          state.ui.showVocabTags = !!settings.ui.showVocabTags;
        }
        // Hydrate profile/stats
        if (settings.profileName) state.profileName = settings.profileName;
        if (settings.globalStats)
          state.globalStats = { ...state.globalStats, ...settings.globalStats };
        if (settings.todayStats)
          state.todayStats = { ...state.todayStats, ...settings.todayStats };
      } else {
        state.translator = { endpoint: "", apiKey: "" };
      }

      if (plan) state.plan = plan;
      if (drill) state.drillPrefs = { ...state.drillPrefs, ...drill };

      state.drillPrefs.includeOnlyTags = toArr(
        state.drillPrefs.includeOnlyTags
      );
      state.drillPrefs.excludeTags = toArr(state.drillPrefs.excludeTags);
      if (!state.drillPrefs.key) state.drillPrefs.key = "v1";

      // roll todayStats if date changed
      const today = new Date().toISOString().slice(0, 10);
      if (state.todayStats.date !== today) {
        state.todayStats = { right: 0, total: 0, date: today };
      }

      //
      // hydration
      const vocabLists =
        settings?.vocabLists && typeof settings.vocabLists === "object"
          ? settings.vocabLists
          : {};

      state.wordPicker.savedLists = Object.keys(vocabLists)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
          name,
          count: Array.isArray(vocabLists[name]) ? vocabLists[name].length : 0,
        }));

// After loading `settings` and building savedLists:
// Restore the last-used Review list (if any); otherwise seed from built-in JSON once
const active = (settings?.activeReviewList || '').trim();

// Reflect into the UI dropdown so the DataPanel shows the true active list
state.wordPicker.activeList = active || '';

if (active) {
  try {
    await methods.loadListIntoReview(active);
  } catch (e) {
    console.warn("[Lists] failed to restore activeReviewList:", active, e);
  }
} else {
  // No remembered list → first-run/default: load bundled general_vocab.json
  try {
    const resp = await fetch("general_vocab.json?v=" + Date.now());
    if (resp.ok) {
      const raw = await resp.json();
      const arr = Array.isArray(raw) ? raw
               : Array.isArray(raw?.vocab) ? raw.vocab
               : null;
      if (arr) {
        state.vocab.cards = arr.map((c, i) => ({
          id: i + 1,
          fr: (c.french ?? c.front ?? c.fr ?? '').trim(),
          en: (c.english ?? c.back  ?? c.en ?? '').trim(),
          partOfSpeech: (c.partOfSpeech ?? c.pos ?? '').trim(),
          gender: (c.gender ?? '').trim(),
          topic: (c.topic ?? '').trim(),
          tags: Array.isArray(c.tags) ? c.tags.slice()
               : c.tags ? String(c.tags).split(/[;,]/).map(t=>t.trim()).filter(Boolean)
                        : [],
          example: coerceExample(c.example ?? c.eg ?? null),
        }));

        // build pills + deck
        (function buildPills(cards){
          const topic = new Set(), tags = new Set(), pos = new Set();
          for (const c of cards) {
            if (c?.topic) topic.add(c.topic);
            if (Array.isArray(c?.tags)) c.tags.forEach(t => t && tags.add(t));
            if (c?.partOfSpeech) pos.add(c.partOfSpeech);
          }
          state.vocabPills.topic = Array.from(topic).sort();
          state.vocabPills.tags  = Array.from(tags).sort();
          state.vocabPills.pos   = Array.from(pos).sort();
        })(state.vocab.cards);

        if (typeof Vocab?.buildVocabDeck === 'function') Vocab.buildVocabDeck(state);
        else { state.vocab.deck = [...state.vocab.cards]; state.vocab.deckPtr = 0; }
      } else {
        console.warn("general_vocab.json did not contain an array or a {vocab: []} shape.");
      }
    } else {
      console.warn("Failed to fetch general_vocab.json:", resp.status);
    }
  } catch (err) {
    console.error("Error loading general_vocab.json:", err);
  }
}


      const _vocabCount = await db.vocab.count();
      if (_vocabCount > 0) {
        // Populate SRS-only subset after DB seed (if applicable)
        // (existing logic unchanged)
      }

      watch(
        () => state.vocab.cards,
        (cards) => {
          // defensive: cards may be replaced wholesale
          if (!Array.isArray(cards)) return;
          // Rebuild pills + keep filtering in sync
          // If buildVocabPillsFromData is inside loadAll's scope, inline here:
          const topic = new Set(),
            tags = new Set(),
            pos = new Set();
          for (const c of cards) {
            if (c?.topic) topic.add(c.topic);
            if (Array.isArray(c?.tags)) c.tags.forEach((t) => t && tags.add(t));
            if (c?.partOfSpeech) pos.add(c.partOfSpeech);
          }
          state.vocabPills.topic = Array.from(topic).sort();
          state.vocabPills.tags = Array.from(tags).sort();
          state.vocabPills.pos = Array.from(pos).sort();
          applyVocabPillFilter();
        },
        { deep: true }
      );

      // Verbs (seeders optional)
      if (typeof Verb.maybeSeedVerbsFromTop200 === "function") {
        try {
          await Verb.maybeSeedVerbsFromTop200(db);
        } catch (e) {
          console.warn("[verbs] maybeSeedVerbsFromTop200 failed:", e);
        }
      }
      if (typeof Verb.maybeSeedIrregulars === "function") {
        try {
          await Verb.maybeSeedIrregulars(db);
        } catch (e) {
          console.warn("[verbs] maybeSeedIrregulars failed:", e);
        }
      }
if (typeof Verb.ensureSeedTaggingAndImport === "function") {
  await Verb.ensureSeedTaggingAndImport(db);
}
state.verbs = await db.verbs.orderBy("infinitive").toArray();

      // Interview questions (optional seed)
      if (!state.questions?.length) {
        try {
          const resp = await fetch("interview_questions.json?v=" + Date.now());
          if (resp.ok) {
            const raw = await resp.json();
            const arr = Array.isArray(raw)
              ? raw
              : Array.isArray(raw?.questions)
              ? raw.questions
              : null;
            if (arr) {
              state.questions = arr.map((q, i) => ({
                id: q.id ?? i + 1,
                fr: (q.fr ?? q.french ?? q.prompt ?? "").trim(),
                en: (q.en ?? q.english ?? q.translation ?? "").trim(),
                tags: Array.isArray(q.tags) ? q.tags.slice() : [],
              }));
              console.log(
                `Loaded default interview_questions.json (${arr.length} entries).`
              );
            }
          } else {
            console.warn(
              "Could not load interview_questions.json (HTTP " +
                resp.status +
                ")"
            );
          }
        } catch (err) {
          console.warn("Failed to fetch interview_questions.json", err);
        }
      }
    }

    // -------------------- Drill rule attachment --------------------
    const EX_KEY = {
      Présent: "present",
      "Passé composé": "passeCompose",
      Imparfait: "imparfait",
      "Plus-que-parfait": "plusQueParfait",
      "Futur simple": "futurSimple",
      "Conditionnel présent": "conditionnelPresent",
      "Subjonctif présent": "subjonctifPresent",
      Impératif: "imperatif",
    };

    function attachExamplesAndRules(q) {
      state.drillSession.help = null;

      const display = q.tenseLabel;
      const camel = EX_KEY[display] || display;
      const infinitive = (q.verb?.infinitive || "").trim();
      const lowerInf = infinitive.toLowerCase();

      // Verb group
      let groupKey = null;
      if (lowerInf.endsWith("er")) groupKey = "-er";
      else if (lowerInf.endsWith("ir")) groupKey = "-ir";
      else if (lowerInf.endsWith("re")) groupKey = "-re";

      // Examples
      try {
        const exKey = infinitive.normalize("NFC").toLowerCase();
        const entry = state.exampleMap?.get(exKey);
        const ex =
          entry?.examples?.[camel] ??
          entry?.examples?.[display] ??
          entry?.examples?.default ??
          (entry?.examples && (entry.examples.fr || entry.examples.en)
            ? entry.examples
            : null);

        if (ex) {
          if (ex.fr) state.drillSession.side.fr = ex.fr;
          if (ex.en) state.drillSession.side.en = ex.en;
        } else {
          state.drillSession.side.fr ??= "—";
          state.drillSession.side.en ??= "—";
        }
      } catch (e) {
        console.warn("[examples] attach failed:", e);
      }

      // Rules (from rules.json)
      const R = state.rules;
      if (!R) return;

      const pickFrom = (obj) => {
        if (!obj) return null;
        if (obj[camel]) return obj[camel];
        if (obj[display]) return obj[display];
        for (const k of Object.keys(obj)) {
          if (
            (k || "").localeCompare(camel, undefined, {
              sensitivity: "accent",
            }) === 0
          )
            return obj[k];
          if (
            (k || "").localeCompare(display, undefined, {
              sensitivity: "accent",
            }) === 0
          )
            return obj[k];
        }
        return null;
      };

      let block = pickFrom(R.tenses) || pickFrom(R) || null;
      if (!block) return;

      const lines = [];
      if (typeof block.explanation === "string" && block.explanation.trim()) {
        lines.push(
          `<strong>L’explication :</strong> ${block.explanation.trim()}`
        );
      }
      if (typeof block.description === "string" && block.description.trim()) {
        lines.push(`<strong>Explanation:</strong> ${block.description.trim()}`);
      }

      const fmtEndings = (end) => {
        try {
          return Object.entries(end)
            .map(([p, e]) => `<code>${p}</code>: <code>${e}</code>`)
            .join(", ");
        } catch {
          return null;
        }
      };

      const pushGroupFormation = (grpKey, grpObj) => {
        if (!grpObj || typeof grpObj !== "object") return;
        if (grpObj.stem && String(grpObj.stem).trim())
          lines.push(`${grpKey}: Stem — ${grpObj.stem}`);
        if (grpObj.endings) {
          const s = fmtEndings(grpObj.endings);
          if (s) lines.push(`${grpKey}: Endings — ${s}`);
        }
        if (grpObj.special && String(grpObj.special).trim())
          lines.push(grpObj.special);
      };

      if (block.formation && typeof block.formation === "object") {
        const F = block.formation;
        if (F.auxiliary && String(F.auxiliary).trim())
          lines.push(`Auxiliary — ${F.auxiliary}`);
        if (F.participle && String(F.participle).trim())
          lines.push(`Participle — ${F.participle}`);
        if (groupKey && F[groupKey]) pushGroupFormation(groupKey, F[groupKey]);
      }

      if (block.stem_rule && String(block.stem_rule).trim())
        lines.push(block.stem_rule.trim());
      if (block.endings && typeof block.endings === "object") {
        const s = fmtEndings(block.endings);
        if (s) lines.push(`Endings — ${s}`);
      }

      if (block.agreement && String(block.agreement).trim())
        lines.push(block.agreement.trim());
      if (block.auxiliary_rules && typeof block.auxiliary_rules === "object") {
        const ar = block.auxiliary_rules;
        if (ar.default && String(ar.default).trim())
          lines.push(`Auxiliary (default) — ${ar.default.trim()}`);
        if (ar.reflexive && String(ar.reflexive).trim())
          lines.push(`Reflexive — ${ar.reflexive.trim()}`);
      }

      if (Array.isArray(block.notes)) {
        for (const n of block.notes) {
          const t = (n ?? "").toString().trim();
          if (t) lines.push(t);
        }
      }
      state.drillSession.help = lines.length ? { lines } : null;
    }

    // -------------------- Import helpers (merge-safe upsert for vocab) --------------------
    function normalizeVocabItem(c) {
      const fr = (c.french ?? c.front ?? "").trim();
      const en = (c.english ?? c.back ?? "").trim();
      return {
        fr,
        en,
        partOfSpeech: (c.partOfSpeech ?? c.pos ?? "").trim(),
        gender: (c.gender ?? "").trim(),
        topic: (c.topic ?? "").trim(),
        tags: Array.isArray(c.tags)
          ? c.tags.slice().filter(Boolean)
          : c.tags
          ? [String(c.tags)]
          : [],
        article: (c.article ?? "").trim(),
        plural: c.plural ?? "",
        example: c.example ?? null,
        notes: c.notes ?? "",
        audio: c.audio ?? null,
        image: c.image ?? "",
      };
    }
    function unionTags(a = [], b = []) {
      const s = new Set();
      (Array.isArray(a) ? a : []).forEach((t) => t && s.add(String(t)));
      (Array.isArray(b) ? b : []).forEach((t) => t && s.add(String(t)));
      return Array.from(s);
    }
    function rebuildVocabPillsFromCards(cards = []) {
      const topic = new Set(),
        tags = new Set(),
        pos = new Set();
      for (const c of cards) {
        if (c?.topic) topic.add(c.topic);
        if (Array.isArray(c?.tags)) c.tags.forEach((t) => t && tags.add(t));
        if (c?.partOfSpeech) pos.add(c.partOfSpeech);
      }
      state.vocabPills.topic = Array.from(topic).sort();
      state.vocabPills.tags = Array.from(tags).sort();
      state.vocabPills.pos = Array.from(pos).sort();
    }

    // -------------------- Methods --------------------
    function toggleIncludeTag(tag) {
      const arr = state.drillPrefs.includeOnlyTags ?? [];
      const i = arr.indexOf(tag);
      if (i === -1) arr.push(tag);
      else arr.splice(i, 1);
      state.drillPrefs.includeOnlyTags = [...arr];
      methods.saveDrillPrefs();
    }
    function clearIncludeTags() {
      state.drillPrefs.includeOnlyTags = [];
      methods.saveDrillPrefs();
    }
    function toggleExcludeTag(tag) {
      const arr = state.drillPrefs.excludeTags ?? [];
      const i = arr.indexOf(tag);
      if (i === -1) arr.push(tag);
      else arr.splice(i, 1);
      state.drillPrefs.excludeTags = [...arr];
      methods.saveDrillPrefs();
    }
    function clearExcludeTags() {
      state.drillPrefs.excludeTags = [];
      methods.saveDrillPrefs();
    }

    async function rate(q) {
      if (!state.flashcards.currentCard) return;
      const c = state.flashcards.currentCard;
      const upd =
        state.settings.srsMode === "SM2"
          ? sm2Schedule(c, q)
          : fixedSchedule(
              c,
              state.settings.fixedIntervals || [1, 3, 7, 14, 30],
              q
            );
      Object.assign(c, upd);
      await db.vocab.update(c.id, upd);
      Vocab.computeDue(state.flashcards);
    }

    function getScroll() {
      return { x: window.scrollX, y: window.scrollY };
    }
    function restoreScroll(pos) {
      window.scrollTo(pos.x, pos.y);
    }
    async function withScrollLock(run) {
      const pos = getScroll();
      await run();
      await nextTick();
      restoreScroll(pos);
    }

    const methods = {
      // vocab
      reloadVocabByTag: () => Vocab.reloadVocabByTag(db, state.flashcards),
      addCard: () => Vocab.addCard(db, state.flashcards),
      deleteCard: (id) => Vocab.deleteCard(db, id, state.flashcards),

      reshuffleVocabDeck: () => Vocab.reshuffleVocabDeck(state),
      nextVocabCard: () => Vocab.nextVocabCard(state),
      currentVocabCard: () => state.vocab.deck[state.vocab.deckPtr] || null,
      rate,

      // Vocab rendering + pills
      renderFr,
      toggleVocabPill,
      clearVocabPills,
      clearAllVocabPills,
      applyVocabPillFilter,

      // Drill tag pills
      toggleIncludeTag,
      clearIncludeTags,
      toggleExcludeTag,
      clearExcludeTags,

      // Drill prefs/save
      saveDrillPrefs: () => saveDrillPrefs(db, state),

      // Verbs CRUD
      addVerb: async () => {
        const id = await Verb.addVerb(db, state.newVerb);
        state.verbs = await db.verbs.orderBy("infinitive").toArray();
        state.newVerb = { infinitive: "", english: "", tags: "" };
        return id;
      },
      deleteVerb: async (v) => {
        await Verb.deleteVerb(db, v);
        state.verbs = state.verbs.filter((x) => x.id !== v.id);
      },

      // Question bank
      qbCategories() {
        const s = new Set();
        for (const q of state.questionBank) if (q?.category) s.add(q.category);
        return Array.from(s).sort((a, b) => a.localeCompare(b));
      },
      qbTags() {
        const s = new Set();
        for (const q of state.questionBank)
          for (const t of q.tags || []) s.add(t);
        return Array.from(s).sort((a, b) => a.localeCompare(b));
      },
      qbFiltered() {
        const { category, tag } = state.qFilters;
        return (state.questionBank || []).filter((q) => {
          const okC = !category || q.category === category;
          const okT = !tag || (q.tags || []).includes(tag);
          return okC && okT;
        });
      },
      async importQuestionBankFromText(text) {
        state._pasteErr = "";
        try {
          const arr = JSON.parse(text);
          if (!Array.isArray(arr)) throw new Error("Root is not an array");
          state.questionBank = arr;
          const existing = (await db.settings.get("v1")) || { key: "v1" };
          await db.settings.put({ ...existing, questionBank: arr, key: "v1" });
          state._showPaste = false;
          state._pasteText = "";
        } catch (e) {
          state._pasteErr = e.message || "Invalid JSON";
        }
      },
      async importQuestionBankFromFile(evt) {
        const f = evt?.target?.files?.[0];
        if (!f) return;
        try {
          const txt = await f.text();
          await methods.importQuestionBankFromText(txt);
        } catch (e) {
          alert("Failed to read file: " + (e.message || e));
        } finally {
          evt.target.value = "";
        }
      },
      async clearQuestionBank() {
        state.questionBank = [];
        const existing = (await db.settings.get("v1")) || { key: "v1" };
        delete existing.questionBank;
        await db.settings.put({ ...existing, key: "v1" });
      },
      pickQuestion(q) {
        if (!q) return;
        const fu =
          Array.isArray(q.followUps) && q.followUps.length
            ? "\n" + q.followUps.map((x) => "— " + x).join("\n")
            : "";
        state.newQA.q = `${q.prompt}${fu}`;
        if (state.qFilters.insertSampleOnPick && q.sampleAnswer) {
          state.newQA.a = q.sampleAnswer;
        }
      },

      // Recorder
      startTranscription,
      stopTranscription,
      clearTranscript,
      setSpeechLang,
      autosizeTextarea,

      async startRecording() {
        if (state.isRecording) return;
        try {
          if (!navigator.mediaDevices?.getUserMedia) {
            alert("Recording not supported in this browser.");
            return;
          }
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";
          const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
          state.mediaRecorder = mr;
          state.chunks = [];
          state.isRecording = true;

          methods.startTranscription?.();

          mr.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) state.chunks.push(e.data);
          };
          mr.onerror = (e) => {
            console.error("[Recorder] error", e);
            alert(
              "Recorder error: " + (e.error?.message || e.message || e.name)
            );
            try {
              mr.stop();
            } catch {}
          };
          mr.onstop = async () => {
            try {
              const blob = new Blob(state.chunks, {
                type: mime || "audio/webm",
              });
              const ts = new Date();
              const uuid =
                crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
              const name = `rec-${ts
                .toISOString()
                .replace(/[:.]/g, "-")}-${uuid}.webm`;

              const transcript = state.speech?.final || "";
              const question = state.newQA?.q || "";
              const answer = state.newQA?.a || "";

              const saved = await persistRecording({
                blob,
                name,
                mime: mime || "audio/webm",
                transcript,
                question,
                answer,
              });
              const url = URL.createObjectURL(blob);
              state.recordings.unshift({ ...saved, url });
            } catch (err) {
              console.error("[Recorder] assemble/persist error", err);
            } finally {
              state.chunks = [];
              state.isRecording = false;
              try {
                stream.getTracks().forEach((t) => t.stop());
              } catch {}
              state.mediaRecorder = null;
              methods.stopTranscription?.();
            }
          };
          mr.start();
        } catch (err) {
          console.error("[Recorder] start failed", err);
          alert("Microphone permission was denied or unavailable.");
          state.isRecording = false;
        }
      },

      stopRecording() {
        try {
          if (state.mediaRecorder?.state === "recording") {
            state.mediaRecorder.stop();
          } else {
            state.isRecording = false;
            methods.stopTranscription?.();
          }
        } catch (e) {
          console.error("[Recorder] stop error", e);
          state.isRecording = false;
          methods.stopTranscription?.();
        }
      },

      deleteRecording: async (r) => {
        if (!r) return;
        try {
          if (r.url) URL.revokeObjectURL(r.url);
        } catch {}
        try {
          if (r.path) {
            if (opfs?.removeFile) await opfs.removeFile(r.path);
            else await opfsRemove(r.path);
          }
        } catch (e) {
          console.warn("[OPFS] remove failed:", e);
        }
        try {
          const id = await findRecordingId(r);
          if (id != null) await db.recordings.delete(id);
          else if (r.path || r.name) {
            const rows = await db.recordings.toArray();
            const victim = rows.find(
              (x) =>
                (r.path && x.path === r.path) || (r.name && x.name === r.name)
            );
            if (victim?.id != null) await db.recordings.delete(victim.id);
          }
        } catch (e) {
          console.warn("[Dexie] delete failed:", e);
        }
        await loadRecordingsFromDB();
      },

      saveQA() {
        const q = (state.newQA.q || "").trim();
        const a = (state.newQA.a || "").trim();
        if (!q && !a) return;
        state.newQA = { q: "", a: "" };
      },

      // Drill flow
      startDrill() {
        state.drillSession.running = true;
        state.drillSession.question = null;
        state.drillSession.input = "";
        state.drillSession.correct = null;
        state.drillSession.total = 0;
        state.drillSession.right = 0;
        state.drillSession.history = [];
        state.drillSession.help = null;
        state.drillSession.side = { english: "—", fr: "—", en: "—" };

        const q = buildQuestion();
        if (!q) {
          state.drillSession.running = false;
          alert(
            "No drillable items. Add verbs or adjust filters/tenses/persons."
          );
          return;
        }
        state.drillSession.question = {
          prompt: { label: q.label },
          answer: q.answer,
          meta: {
            infinitive: q.verb.infinitive,
            english: q.verb.english || "",
            person: q.personLabel,
            tense: q.tenseLabel,
          },
        };
        state.drillSession.side.english = q.verb.english || "";
        attachExamplesAndRules(q);
      },

      checkDrill() {
        const sess = state.drillSession;
        if (!sess.running || !sess.question) return;
        const isRight = answersEqual(sess.input, sess.question.answer);
        sess.correct = isRight;
        sess.total += 1;
        if (isRight) sess.right += 1;
        bumpGlobal(isRight);

        sess.history.push({
          q: sess.question.prompt.label,
          expected: sess.question.answer,
          given: sess.input,
          ok: isRight,
        });

        if (isRight && state.drillPrefs.autoNext) {
          setTimeout(() => {
            methods.nextDrill();
          }, 350);
        }
      },

      nextDrill() {
        return withScrollLock(async () => {
          const q = buildQuestion();
          if (!q) {
            state.drillSession.running = false;
            alert("No more questions available with current filters.");
            return;
          }
          state.drillSession.question = {
            prompt: { label: q.label },
            answer: q.answer,
            meta: {
              infinitive: q.verb.infinitive,
              english: q.verb.english || "",
              person: q.personLabel,
              tense: q.tenseLabel,
            },
          };
          state.drillSession.side.english = q.verb.english || "";
          attachExamplesAndRules(q);

          state.drillSession.input = "";
          state.drillSession.correct = null;
        });
      },

      stopDrill() {
        state.drillSession.running = false;
        state.drillSession.question = null;
        state.drillSession.input = "";
        state.drillSession.correct = null;
      },

      // Notes/Data import — MERGE-SAFE upsert of vocab (keeps Topics/Tags/PoS; dedupes)
      importNotesAndSeedCards: async (
        opts = { frToEn: true, enToFr: true }
      ) => {
        try {
          const nowISO = new Date().toISOString().slice(0, 10);

          const resp = await fetch("general_vocab.json?v=" + Date.now());
          if (!resp.ok) {
            alert("Failed to fetch general_vocab.json: " + resp.status);
            return;
          }
          const raw = await resp.json();
          const arr = Array.isArray(raw)
            ? raw
            : Array.isArray(raw?.vocab)
            ? raw.vocab
            : [];
          if (!arr.length) {
            alert("general_vocab.json has no entries.");
            return;
          }

          // Normalize incoming
          const incoming = arr
            .map(normalizeVocabItem)
            .filter((x) => x.fr && x.en);

          // Snapshot existing by (fr,en) for upsert
          const existingRows = await db.vocab.toArray();
          const keyOf = (fr, en) =>
            (fr || "").toLowerCase().trim() +
            "␟" +
            (en || "").toLowerCase().trim();
          const existingByKey = new Map(
            existingRows.map((r) => [keyOf(r.fr || r.front, r.en || r.back), r])
          );

          const toAdd = [];
          const toUpdate = [];
          let addedSrs = 0;

          for (const inc of incoming) {
            const k = keyOf(inc.fr, inc.en);
            const ex = existingByKey.get(k);

            // optional notes upsert if exposed
            if (typeof Vocab.upsertVocabNote === "function") {
              await Vocab.upsertVocabNote(db, {
                french: inc.fr,
                english: inc.en,
                tags: inc.tags,
                topic: inc.topic,
                pos: inc.partOfSpeech,
              });
            }

            // SRS card directions (using your current behaviour)
            const wantFRtoEN = opts.frToEn !== false;
            const wantENtoFR = opts.enToFr !== false;

            if (!ex) {
              // First-time (fr,en) → create FR→EN card now; EN→FR handled below
              if (wantFRtoEN) {
                toAdd.push({
                  front: inc.fr,
                  back: inc.en,
                  due: nowISO,
                  ease: 2.5,
                  reps: 0,
                  interval: 0,
                  last: nowISO,
                  fr: inc.fr,
                  en: inc.en,
                  partOfSpeech: inc.partOfSpeech,
                  gender: inc.gender,
                  topic: inc.topic,
                  tags: inc.tags,
                  article: inc.article,
                  plural: inc.plural,
                  example: inc.example,
                  notes: inc.notes,
                  audio: inc.audio,
                  image: inc.image,
                });
                addedSrs++;
              }
            } else {
              // Merge metadata: don't wipe existing; fill blanks; union tags
              const patch = {};
              const keep = (v) =>
                v !== undefined && v !== null && String(v).trim() !== "";

              if (!keep(ex.topic) && keep(inc.topic)) patch.topic = inc.topic;
              if (!keep(ex.partOfSpeech) && keep(inc.partOfSpeech))
                patch.partOfSpeech = inc.partOfSpeech;
              if (!keep(ex.gender) && keep(inc.gender))
                patch.gender = inc.gender;
              if (!keep(ex.article) && keep(inc.article))
                patch.article = inc.article;

              const mergedTags = unionTags(ex.tags, inc.tags);
              if (
                JSON.stringify(mergedTags) !== JSON.stringify(ex.tags || [])
              ) {
                patch.tags = mergedTags;
              }

              if (!keep(ex.plural) && keep(inc.plural))
                patch.plural = inc.plural;
              if (!keep(ex.example) && keep(inc.example))
                patch.example = inc.example;
              if (!keep(ex.notes) && keep(inc.notes)) patch.notes = inc.notes;
              if (!keep(ex.audio) && keep(inc.audio)) patch.audio = inc.audio;
              if (!keep(ex.image) && keep(inc.image)) patch.image = inc.image;

              if (Object.keys(patch).length) {
                toUpdate.push({ id: ex.id, patch });
              }
            }

            // Ensure EN→FR card also exists (only if requested)
            if (wantENtoFR) {
              const existsEF = existingRows.find(
                (r) =>
                  (r.front || r.fr) === inc.en && (r.back || r.en) === inc.fr
              );
              if (!existsEF) {
                toAdd.push({
                  front: inc.en,
                  back: inc.fr,
                  due: nowISO,
                  ease: 2.5,
                  reps: 0,
                  interval: 0,
                  last: nowISO,
                  fr: inc.en,
                  en: inc.fr,
                  partOfSpeech: inc.partOfSpeech,
                  gender: inc.gender,
                  topic: inc.topic,
                  tags: inc.tags,
                  article: inc.article,
                  plural: inc.plural,
                  example: inc.example,
                  notes: inc.notes,
                  audio: inc.audio,
                  image: inc.image,
                });
                addedSrs++;
              }
            }
          }

          // Persist
          if (toAdd.length) {
            try {
              await db.vocab.bulkAdd(toAdd);
            } catch {
              for (const row of toAdd) {
                try {
                  await db.vocab.add(row);
                } catch {}
              }
            }
          }
          for (const u of toUpdate) {
            try {
              await db.vocab.update(u.id, u.patch);
            } catch {}
          }
          // Repair any existing rows missing scheduling fields (one-time safety net)
          {
            const rows = await db.vocab.toArray();
            const patch = {
              due: nowISO,
              ease: 2.5,
              reps: 0,
              interval: 0,
              last: nowISO,
            };
            for (const r of rows) {
              if (!r.due || Number.isNaN(new Date(r.due).getTime())) {
                try {
                  await db.vocab.update(r.id, patch);
                } catch {}
              }
            }
          }

          // Refresh UI: pull from DB, rebuild deck & pills, reapply filters
          await Vocab.reloadVocabByTag(db, state.flashcards);
          // Keep Review (JSON) as-is; if you want to rebuild its deck, do it explicitly:
          Vocab.buildVocabDeck(state);
          rebuildVocabPillsFromCards(state.vocab.cards || []);
          applyVocabPillFilter();

          alert(
            `Imported ${incoming.length} entries; added ${addedSrs} new SRS cards (both directions, deduped; metadata merged).`
          );

          // Optional: take user to Learn → Vocab
          state.tab = "learn";
          state.learnTab = "vocab";
        } catch (e) {
          console.error(e);
          alert("Import failed: " + (e.message || e));
        } finally {
          state.newVocabFront = "";
          state.newVocabBack = "";
        }
      },

      // === Load a saved list into the Review deck (non-SRS) ===
async deleteSavedList(listName) {
  try {
    if (!listName) return;
    if (!confirm(`Delete the list "${listName}"? This cannot be undone.`)) return;

    const settingsRec = (await db.settings.get("v1")) || { key: "v1" };
    const lists = { ...(settingsRec.vocabLists || {}) };

    if (!(listName in lists)) {
      alert("List not found.");
      return;
    }

    // Remove and persist
    delete lists[listName];
    await db.settings.put({ ...settingsRec, vocabLists: lists, key: "v1" });

    // Refresh savedLists in UI
    state.wordPicker.savedLists = Object.keys(lists)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        name,
        count: Array.isArray(lists[name]) ? lists[name].length : 0,
      }));

    // If that list was active in the Review picker, revert to Default (built-in)
    if (state.wordPicker.activeList === listName) {
      state.wordPicker.activeList = "";
      try {
        // Use existing loader to swap Review back to built-in JSON deck
        await methods.loadListIntoReview("");
      } catch (e) {
        console.warn("[Lists] fallback to default review deck failed:", e);
      }
    }

    console.log(`[Lists] Deleted "${listName}"`);
  } catch (e) {
    console.error("[Lists] deleteSavedList failed:", e);
    alert("Could not delete that list.");
  }
  // If that list was active in the Review picker, revert to Default (built-in)
if (state.wordPicker.activeList === listName) {
  state.wordPicker.activeList = '';
  const s = (await db.settings.get('v1')) || { key: 'v1' };
  await db.settings.put({ ...s, activeReviewList: '', key: 'v1' });
  // Keep current deck; the next full reload will seed from built-in
  // (or call methods.loadListIntoReview('') if you want to clear immediately)
}
},


// === Load a saved list into SRS (Dexie-backed) ===
async loadListIntoSrs(listName) {
  try {
    const settingsRec = (await db.settings.get("v1")) || { key: "v1" };
    const lists = settingsRec.vocabLists || {};
    const arr = Array.isArray(lists[listName]) ? lists[listName] : [];

    if (!arr.length) {
      alert("That list is empty or not found.");
      return;
    }

    const nowISO = new Date().toISOString();

    // Helper: upsert by (front/back) to avoid dupes
    async function upsert(front, back, tags = []) {
      const existing = await db.vocab
        .where("front")
        .equals(front)
        .and((r) => r.back === back)
        .first();
      if (existing) {
        // Don't change scheduling; just union tags if present
        const mergedTags = Array.from(
          new Set([...(existing.tags || []), ...tags].filter(Boolean))
        );
        await db.vocab.update(existing.id, { tags: mergedTags });
        return existing.id;
      } else {
        const row = {
          front,
          back,
          due: nowISO,
          ease: 2.5,
          reps: 0,
          interval: 0,
          last: nowISO,
          tags: Array.isArray(tags) ? tags.filter(Boolean) : []
        };
        return await db.vocab.add(row);
      }
    }

    // Upsert all words from the list
    for (const c of arr) {
      const fr = (c.fr || c.french || "").trim();
      const en = (c.en || c.english || "").trim();
      if (!fr || !en) continue;
      const tags = Array.isArray(c.tags) ? c.tags : (c.tags ? [c.tags] : []);
      await upsert(fr, en, tags);
    }

    // Reload SRS queue from DB
    await Vocab.reloadVocabByTag(db, state.flashcards); // keeps SRS subtree only
    // Recompute due already happens inside reloadVocabByTag; currentCard is set.  :contentReference[oaicite:6]{index=6}
    alert(`Loaded "${listName}" into SRS.`);
  } catch (e) {
    console.error("[SRS] loadListIntoSrs failed:", e);
    alert("Could not load list into SRS.");
  }
},

      // Settings/Plan saves
      saveSettings: () =>
        db.settings.put({
          ...state.settings,
          translator: state.translator,
          key: "v1",
        }),
      savePlan: () => db.plan.put(state.plan),
      promptProfileName() {
        const val = prompt("Display name:", state.profileName || "");
        if (val !== null) {
          state.profileName = val.trim();
          saveGlobalToSettingsDebounced();
        }
      },
      exportGlobalStats() {
        const blob = new Blob(
          [
            JSON.stringify(
              {
                profileName: state.profileName,
                globalStats: state.globalStats,
                todayStats: state.todayStats,
              },
              null,
              2
            ),
          ],
          { type: "application/json" }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `drill-stats-${new Date()
          .toISOString()
          .slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },

      resetTodayStats() {
        state.todayStats = {
          right: 0,
          total: 0,
          date: new Date().toISOString().slice(0, 10),
        };
        saveGlobalToSettingsDebounced();
      },


      importVocabCsv,
togglePickAll,
savePickedAsList,
loadListIntoSrs,
loadListIntoReview,

      // END METHODS

      // Load-all
      loadAll,
    };

    //    
    // Auto-detect delimiter: comma, semicolon, or tab
function detectDelimiter(line) {
  const candidates = [',',';','\t'];
  let best = ',', bestCount = 0;
  for (const d of candidates) {
    // count split parts ignoring empty trailing fields
    const count = line.split(d).length;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

//    
function toPlainWord(it){
  const tags =
    Array.isArray(it.tags) ? it.tags.slice()
  : (it.tags && typeof it.tags[Symbol.iterator] === 'function') ? [...it.tags]
  : (typeof it.tags === 'string') ? it.tags.split(/[,;|]/).map(s=>s.trim()).filter(Boolean)
  : [];
  return {
    fr: String(it.fr || '').trim(),
    en: String(it.en || '').trim(),
    article: String(it.article || '').trim(),
    tags: tags.map(t => String(t)),
  };
}

//    
function parseCsv(text) {
  // strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const linesRaw = text.split(/\r?\n/);
  const lines = linesRaw.filter(l => l.trim() !== '');
  if (!lines.length) return { headers: [], rows: [], delimiter: ',' };

  const delimiter = detectDelimiter(lines[0]);

  const split = (line) => {
    const out = [];
    let cur = '', inQ = false;
    for (let i=0; i<line.length; i++){
      const ch = line[i], nxt = line[i+1];
      if (ch === '"' && inQ && nxt === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === delimiter && !inQ) { out.push(cur); cur=''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  const headers = split(lines[0]).map(h => h.toLowerCase());
  const rows = lines.slice(1).map(l => {
    const cols = split(l);
    const obj = {};
    headers.forEach((h,i)=> obj[h] = (cols[i] ?? '').trim());
    return obj;
  });

  return { headers, rows, delimiter };
}


function normalizeCsvRow(row){
  const fr = normalizeStr(row.FR ?? row.fr ?? row.French ?? row.french);
  const en = normalizeStr(row.EN ?? row.en ?? row.English ?? row.english);
  const rawArticle = normalizeStr(row.article ?? row.Article ?? row.gender ?? row.Gender);
  const tags = Array.isArray(row.tags) ? row.tags : normalizeStr(row.tags).split(',').map(t=>t.trim()).filter(Boolean);
  const ex = row.example ?? row.Example ?? row.ex ?? '';

  if (!fr || !en) return null;

  return {
    fr,
    en,
    article: normalizeArticle(fr, rawArticle),
    // keep gender optional if you want
    gender: ['m','masc','masculin'].includes(rawArticle.toLowerCase()) ? 'm'
          : ['f','fem','féminin','feminin','feminine'].includes(rawArticle.toLowerCase()) ? 'f'
          : '',
    example: coerceExample(ex),
    tags
  };
}

// helpers (top of app.js near your other helpers)
const normalizeStr = s => (s ?? '').toString().trim();
const isVowelStart = s => /^[aeiouhâêîôûéèëïüAEIOUH]/.test(s || '');
function normalizeArticle(fr, raw) {
  const a = normalizeStr(raw).toLowerCase();
  if (['le','la','l\'','l’','les'].includes(a)) return (a === "l'") ? 'l’' : a;
  if (['m','masc','masculin'].includes(a)) return isVowelStart(fr) ? 'l’' : 'le';
  if (['f','fem','femme','féminin','feminin','feminine'].includes(a)) return isVowelStart(fr) ? 'l’' : 'la';
  return ''; // unknown → no article
}

// Coerce example to a { fr, en } or null; keeps UI consistent
function coerceExample(ex) {
  if (!ex) return null;
  if (typeof ex === 'string') return { fr: ex.trim(), en: '' };
  if (typeof ex === 'object') return { fr: normalizeStr(ex.fr), en: normalizeStr(ex.en) };
  return null;
}


async function importVocabCsv(evt){
  console.log('[CSV]', { file: evt?.target?.files?.[0]?.name });
  const f = evt?.target?.files?.[0];
  if (!f) return;
  try {
    const txt = await f.text();
    const parsed = parseCsv(txt);
    const items = parsed.rows.map(normalizeCsvRow).filter(Boolean);

    state.csv.headers = parsed.headers;
    state.csv.rows = parsed.rows;
    state.csv.meta = { delimiter: parsed.delimiter, total: parsed.rows.length, normalized: items.length };

    state.wordPicker.items = items;
    state.wordPicker.selected = {};
    items.forEach((_,i)=> state.wordPicker.selected[i] = true);
    if (!state.wordPicker.listName) {
      state.wordPicker.listName = new Date().toISOString().slice(0,10) + ' list';
    }

    if (!items.length) {
      alert(
        `CSV loaded but 0 usable rows.\n\n` +
        `Detected delimiter: "${parsed.delimiter}"\n` +
        `Headers: [${parsed.headers.join(', ')}]\n\n` +
        `Expected headers include EN/FR/article (case-insensitive). ` +
        `You can also use english/french/front/back or det/déterminant.`
      );
    } else {
      alert(`CSV loaded: ${items.length} row(s) normalized (of ${parsed.rows.length} raw).`);
    }
  } catch (e) {
    alert('Failed to read CSV: ' + (e.message || e));
  } finally {
    if (evt?.target) evt.target.value = '';
  }
}


async function saveVocabListsToSettings(updater) {
  const existing = (await db.settings.get("v1")) || { key: "v1" };
  const current  = (existing.vocabLists && typeof existing.vocabLists === "object") ? existing.vocabLists : {};
  const nextRaw  = updater(current);
  const next     = JSON.parse(JSON.stringify(nextRaw)); // clone to plain JSON

  await db.settings.put({ ...existing, vocabLists: next, key: "v1" });

  // Rebuild the Saved Lists UI (⚠️ keep this chain contiguous)
  state.wordPicker.savedLists = Object.keys(next)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, count: Array.isArray(next[name]) ? next[name].length : 0 }));
}



    function togglePickAll(flag) {
      const sel = {};
      state.wordPicker.items.forEach((_, i) => (sel[i] = !!flag));
      state.wordPicker.selected = sel;
    }

async function savePickedAsList(pickedIdxArr){
  const name = (state.wordPicker.listName || '').trim();
  if (!name) { alert('Please enter a list name.'); return; }

  // indices from filteredItems (if passed) or from checkboxes
  let indices;
  if (Array.isArray(pickedIdxArr) && pickedIdxArr.length) {
    indices = pickedIdxArr;
  } else {
    indices = Object.entries(state.wordPicker.selected)
      .filter(([,v]) => !!v)
      .map(([k]) => Number(k));
  }

  // Build normalized entries
  const picked = indices
    .map(i => state.wordPicker.items[i])
    .filter(Boolean)
    .map(it => ({
      fr: (it.fr || '').trim(),
      en: (it.en || '').trim(),
      article: (it.article || '').trim(),
      example: coerceExample(it.example),
      tags: Array.isArray(it.tags) ? it.tags : []
    }));

  if (!picked.length){ alert('No words selected.'); return; }

  await saveVocabListsToSettings(curr => ({ ...curr, [name]: picked }));

  // Mark this as the active Review list and mirror into UI
  const settings = (await db.settings.get('v1')) || { key: 'v1' };
  await db.settings.put({ ...settings, activeReviewList: name, key: 'v1' });
  state.wordPicker.activeList = name;

  alert(`Saved list "${name}" with ${picked.length} items.`);
}


    // === Load a saved sub-list straight into Review (non-SRS) ===

// Load a saved sub-list straight into Review (non-SRS)
async function loadListIntoReview(name){
  const settings = (await db.settings.get('v1')) || { key: 'v1' };
  await db.settings.put({ ...settings, activeReviewList: name || '', key: 'v1' });

  const list = settings?.vocabLists?.[name];

  // If blank or missing, keep current deck (lets app fall back during initial hydration)
  if (!Array.isArray(list) || !list.length) {
    console.log(`[Lists] loadListIntoReview: list "${name}" not found or empty; keeping existing deck.`);
    return;
  }

  const cards = list.map(it => ({
    id: null,
    fr: (it.fr || '').trim(),
    en: (it.en || '').trim(),
    article: (it.article || '').trim(),
    example: coerceExample(it.example),
    tags: Array.isArray(it.tags) ? it.tags : [],
    source: 'list:' + name
  })).filter(c => c.fr && c.en);

  state.vocab.cards = cards;
  // IMPORTANT: call your deck builder correctly
  if (typeof Vocab?.buildVocabDeck === 'function') Vocab.buildVocabDeck(state);
  else { state.vocab.deck = [...state.vocab.cards]; state.vocab.deckPtr = 0; }

  state.tab = 'learn';
}

    
    // inside app.js
async function loadListIntoReview(name){
  const settings = (await db.settings.get('v1')) || { key: 'v1' };
  await db.settings.put({ ...settings, activeReviewList: name || '', key: 'v1' }); // persist choice

  const list = settings?.vocabLists?.[name];
  if (!Array.isArray(list) || !list.length) { alert('List not found or empty.'); return; }

  const cards = list.map(it => ({
    id: null,
    fr: (it.fr || '').trim(),
    en: (it.en || '').trim(),
    article: (it.article || '').trim(),
    example: coerceExample(it.example),   // normalized (see §3)
    tags: Array.isArray(it.tags) ? it.tags : [],
    source: 'list:' + name
  })).filter(c => c.fr && c.en);

  state.vocab.cards = cards;
  if (typeof buildVocabDeck === 'function') buildVocabDeck();
  else { state.vocab.deck = [...state.vocab.cards]; state.vocab.deckPtr = 0; }
  state.tab = 'learn';
}




async function loadListIntoSrs(name){
  const settings = (await db.settings.get('v1')) || { key: 'v1' };
  const list = settings?.vocabLists?.[name];
  if (!Array.isArray(list) || !list.length) { alert('List not found or empty.'); return; }

  const nowISO = new Date().toISOString();
  const existing = await db.vocab.toArray();
  const keyOf = (front, back) => (front||'').toLowerCase().trim() + '␟' + (back||'').toLowerCase().trim();
  const have = new Set(existing.map(r => keyOf(r.front || r.fr, r.back || r.en)));

  const toAdd = [];
  for (const it of list){
    const fr = (it.fr||'').trim(), en = (it.en||'').trim();
    if (!fr || !en) continue;
    const k = keyOf(fr, en);
    if (have.has(k)) continue;
    toAdd.push({
      front: fr, back: en,       // SRS core
      fr, en, article: it.article || '',
      example: it.example || '',
      tags: Array.isArray(it.tags) ? it.tags : [],
      due: nowISO, ease: 2.5, reps: 0, interval: 0, last: nowISO
    });
    have.add(k);
  }

  if (toAdd.length){
    try { await db.vocab.bulkAdd(toAdd); }
    catch { for (const r of toAdd) { try { await db.vocab.add(r); } catch {} } }
  }
  if (Vocab?.reloadVocabByTag) await Vocab.reloadVocabByTag(db, state.flashcards);
  alert(`Loaded "${name}" into SRS: ${toAdd.length} new card(s).`);
}


    // -------------------- Boot --------------------
    methods.loadAll();

    // Expose refs & methods to template
    const refs = toRefs(state);
    return {
      ...refs,
      ...methods,
      state,
      methods,
      tagPills,
      // Flashcards
      renderFr,
      toggleVocabPill,
      clearVocabPills,
      clearAllVocabPills,
      applyVocabPillFilter,
      // CSV & Word Picker
 importVocabCsv,
  togglePickAll,
  savePickedAsList,
  loadListIntoSrs,
  loadListIntoReview,
    };
  },
});

const vm = vueApp.mount("#app");
window.parlApp = vm;

/**
   * app.js — Readability pass v1 (safe)
   * - No logic changes to functions.
   * - Only comment banner + reordering inside `const methods = {

    // -- Other ----------------------------------------------------------------------
    ...
  `.
  * - Methods regrouped by domain for scan-ability; bodies unchanged.
  */
// app.js (rebuilt, with UI toggle persistence + Vocab pills without Gender)
import {
  loadSettings,
  applySettingsToState,
  startAutoSave,
} from "./core/settings.js";

import DrillPanel from "./js/components/DrillPanel.js?v=3";
import VocabPanel from "./js/components/VocabPanel.js?v=3";
import RecorderPanel from "./js/components/RecorderPanel.js?v=2";
import ProfileWidget from "./js/components/ProfileWidget.js?v=2";
import DataPanel from "./js/components/DataPanel.js?v=6";
import GrammarPanel from "./js/components/GrammarPanel.js?v=1";

import { initDexie, opfs, TAG_PILL_OPTIONS } from "./js/db.js?v=2";
import {
  sm2Schedule,
  fixedSchedule,
  loadDataset,
  loadRules,
  saveDrillPrefs,
} from "./js/drills.js?v=2";
import * as Vocab from "./js/vocab.js?v=2";
import * as Verb from "./js/verbs.js?v=2";
import { answersEqual, toArr } from "./js/utils.js?v=2";

const db = initDexie();
const { createApp, reactive, ref, watch, toRefs, nextTick } = Vue;

const vueApp = Vue.createApp({
  components: {
    DrillPanel,
    VocabPanel,
    GrammarPanel, 
    RecorderPanel,
    ProfileWidget,
    DataPanel,
  },

  setup() {
    /* =========================================================================
     * setup() — grouped, commented (non-invasive)
     * SECTION MAP (scan-ability only; no logic changes):
     *   1) STATE ...................................................... [STATE]
     *   2) SETTINGS HYDRATION & AUTOSAVE ............................ [SETTINGS]
     *   3) CONSTANTS & LABELS (drills) ............................... [LABELS]
     *   4) GENERIC HELPERS (UI, speech, parsing) ................... [HELPERS]
     *   5) VOCAB (rendering, pills, deck) ............................. [VOCAB]
     *   6) DRILL HELPERS (build question, attach rules) .............. [DRILL]
     *   7) RECORDER (speech/recording, OPFS) ....................... [RECORDER]
     *   8) IMPORT / CSV INDEX (lists meta) .......................... [IMPORTS]
     *   9) PERSISTENCE HELPERS (settings/stats) ................... [PERSISTED]
     *  10) LOAD BOOTSTRAP (dataset/rules/settings/plan/verbs) ....... [LOADALL]
     *  11) METHODS (grouped by domain; bodies unchanged) ............ [METHODS]
     * ========================================================================= */

    // ------------------------- STATE -------------------------
    const state = reactive({

      // transient notifications (info/success/warn/error)

      toasts: [], 
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
      wordPicker: {
        items: [],
        selected: {},
        listName: "",
        savedLists: [],
        activeList: "",
      },

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

      // GRAMMAR
      grammar: {
  relpron: [],   // normalized rows from prepositional relative pronouns CSV
  verbprep: [],  // normalized rows from verb+preposition CSV
  filters: { q: '' },
  pages: { relpron: 1, verbprep: 1 },
  pageSize: 20,
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

    // Apply persisted UI/prefs from localStorage (settings.js)
    applySettingsToState(state, loadSettings());

    // Start autosaving UI/prefs to localStorage (debounced)
    startAutoSave(state, watch, { debounceMs: 300 });

    // --- Settings: hydrate UI/prefs from localStorage, then start autosave ---

    // Optional: when you *must* flush immediately (rare), call:
    // const flushSettingsNow = () => saveSettings(extractSettingsFromState(state));

    // ==================== END STATE ====================
    // -------------------- Generic helpers --------------------

    //  -- Toast notifications (transient) ---  
    function pushToast(msg, type = 'info', ms = 2400) {
  const id = crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  state.toasts.push({ id, msg: String(msg), type, ts: Date.now() });
  setTimeout(() => {
    const i = state.toasts.findIndex(t => t.id === id);
    if (i > -1) state.toasts.splice(i, 1);
  }, ms);
}
function dismissToast(id) {
  const i = state.toasts.findIndex(t => t.id === id);
  if (i > -1) state.toasts.splice(i, 1);
}
const toast = {
  info:   (m, ms) => pushToast(m, 'info',   ms),
  success:(m, ms) => pushToast(m, 'success',ms),
  warn:   (m, ms) => pushToast(m, 'warn',   ms),
  error:  (m, ms) => pushToast(m, 'error',  ms),
};

// prevents scroll lock override  
watch(
  () => [state.tab, state.learnTab],
  () => { window.scrollTo(0, 0); },
  { flush: 'post' }
);

   // CSV parser (simple, no quotes/escapes)
    async function refreshSavedListsUI() {
      try {
        const s = (await db.settings.get("v1")) || { key: "v1" };
        const listsObj =
          s && s.vocabLists && typeof s.vocabLists === "object"
            ? s.vocabLists
            : {};
        const meta = (s && s.vocabMeta) || {};

        const names = Object.keys(listsObj).sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" })
        );

        state.wordPicker.savedLists = names.map((name) => {
          const items = Array.isArray(listsObj[name]) ? listsObj[name] : [];
          const m = meta[name] || meta[name.replace(/[_-]+/g, " ")] || {};
          const displayName = (m.name || name).trim();
          const description = (m.description || "").trim();
          const file = (m.file || "").trim();
          return {
            name,
            displayName,
            description,
            desc: description,
            file,
            count: items.length,
          };
        });
      } catch (e) {
        console.warn("[Lists] refreshSavedListsUI failed:", e);
        state.wordPicker.savedLists = [];
      }
    }
    // make it visible even if something calls window.refreshSavedListsUI()
    window.refreshSavedListsUI = refreshSavedListsUI;

    // List .csv entries under /data via index.json or directory listing
    async function listDataEntries() {
      async function tryJson(url) {
        try {
          const r = await fetch(url + "?v=" + Date.now());
          if (!r.ok) return null;
          const j = await r.json();

          // Case A: desired shape already
          if (
            Array.isArray(j) &&
            j.length &&
            typeof j[0] === "object" &&
            j[0].file
          ) {
            return j.filter((x) => /\.csv$/i.test(x.file));
          }
          // Case B: { files: ["a.csv", ...] }
          if (Array.isArray(j?.files)) {
            return j.files
              .filter((s) => /\.csv$/i.test(s))
              .map((f) => ({
                file: f,
                name: f
                  .replace(/\.csv$/i, "")
                  .replace(/[_-]+/g, " ")
                  .trim(),
                description: "",
              }));
          }
          // Case C: ["a.csv", ...]
          if (Array.isArray(j) && j.length && typeof j[0] === "string") {
            return j
              .filter((s) => /\.csv$/i.test(s))
              .map((f) => ({
                file: f,
                name: f
                  .replace(/\.csv$/i, "")
                  .replace(/[_-]+/g, " ")
                  .trim(),
                description: "",
              }));
          }
          return null;
        } catch {
          return null;
        }
      }

      // Prefer explicit index/manifest
      let entries =
        (await tryJson("data/index.json")) ||
        (await tryJson("data/manifest.json"));

      if (entries && entries.length) return entries;

      // Fallback: directory listing (python -m http.server etc.)
      try {
        const r = await fetch("data/");
        if (r.ok) {
          const html = await r.text();
          const files = [...html.matchAll(/href="([^"]+\.csv)"/gi)].map((m) =>
            decodeURIComponent(m[1])
          );
          entries = Array.from(new Set(files)).map((f) => ({
            file: f,
            name: f
              .replace(/\.csv$/i, "")
              .replace(/[_-]+/g, " ")
              .trim(),
            description: "",
          }));
        }
      } catch {}
      return entries || [];
    }

    // Fetch/parse one CSV and save it as a named list, with optional meta
    async function importCsvAsList(url, meta = null) {
      const bust = url.includes("?") ? "&" : "?";
      const res = await fetch(url + bust + "v=" + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const txt = await res.text();

      const parsed = parseCsv(txt);
      const items = parsed.rows.map(normalizeCsvRow).filter(Boolean);
      if (!items.length) return { name: null, count: 0 };

      // List name from meta or filename (nicely spaced)
      const fallbackName = url
        .split("/")
        .pop()
        .replace(/\.csv$/i, "")
        .replace(/[_-]+/g, " ")
        .trim();
      const displayName = (meta?.name || fallbackName).trim();
      const listKey = fallbackName; // stable key used internally

      // Save list items
      await saveVocabListsToSettings((curr) => ({ ...curr, [listKey]: items }));

      // Save metadata alongside lists (file, pretty name, description)
      const settings = (await db.settings.get("v1")) || { key: "v1" };
      const vocabMeta = { ...(settings.vocabMeta || {}) };
      vocabMeta[listKey] = {
        file: meta?.file || url.replace(/^data\//, ""),
        name: displayName,
        description: meta?.description || "",
      };
      await db.settings.put({ ...settings, vocabMeta, key: "v1" });

      return { name: listKey, count: items.length };
    }

    // Public method you can call once at startup
    async function autoImportCsvListsFromData() {
      const settings = (await db.settings.get("v1")) || { key: "v1" };

      const existingNames = new Set(Object.keys(settings.vocabLists || {}));
      const alreadyImported = new Set(
        (settings.autoImportedDataCsvs || []).map((s) => s.toLowerCase())
      );

      // Discover /data entries (with file/name/description)
      const entries = await listDataEntries();

      const imported = [];
      for (const e of entries) {
        const base = String(e.file || "")
          .split("/")
          .pop()
          .replace(/\.csv$/i, "")
          .replace(/[_-]+/g, " ")
          .trim();

        if (!base) continue;
        if (existingNames.has(base) || alreadyImported.has(base.toLowerCase()))
          continue;

        try {
          const url = e.file.startsWith("data/") ? e.file : "data/" + e.file;
          const { name, count } = await importCsvAsList(url, e);
          if (name && count) imported.push({ name, count });
        } catch (err) {
          console.warn("[AutoCSV] Skipping", e.file, err);
        }
      }

      if (imported.length) {
        const updated = (await db.settings.get("v1")) || { key: "v1" };
        const marker = [
          ...new Set([
            ...(updated.autoImportedDataCsvs || []),
            ...imported.map((x) => x.name),
          ]),
        ];
        await db.settings.put({
          ...updated,
          autoImportedDataCsvs: marker,
          key: "v1",
        });
      }

      // If no active list yet and we imported something, set the first active
      if (!settings.activeReviewList && imported[0]) {
        const s2 = (await db.settings.get("v1")) || { key: "v1" };
        await db.settings.put({
          ...s2,
          activeReviewList: imported[0].name,
          key: "v1",
        });
        state.wordPicker.activeList = imported[0].name;
      }
    }

    // --- SRS row sanitizer: ensure plain JSON cloneable objects for IndexedDB ---
    function sanitizeExample(ex) {
      if (!ex) return null;
      if (typeof ex === "string") return ex; // keep simple FR string
      // allow only {fr, en} if it's an object; drop everything else
      const fr = typeof ex.fr === "string" ? ex.fr : "";
      const en = typeof ex.en === "string" ? ex.en : "";
      if (!fr && !en) return null;
      return { fr, en };
    }

    function sanitizeTags(tags) {
      if (!Array.isArray(tags)) return [];
      return tags.map((t) => (t == null ? "" : String(t))).filter(Boolean);
    }

    function toISO(d) {
      try {
        return new Date(d).toISOString();
      } catch {
        return new Date().toISOString();
      }
    }
    //  Normalize one CSV row into SRS vocab card shape
    function sanitizeSrsRow(c) {
      // Never pass Vue proxies/refs through; copy only allowed fields
      const row = {
        // SRS core fields
        front: (c?.fr || c?.front || "").trim(),
        back: (c?.en || c?.back || "").trim(),
        due: toISO(c?.due || Date.now()),
        ease: Number.isFinite(c?.ease) ? c.ease : 2.5,
        reps: Number.isFinite(c?.reps) ? c.reps : 0,
        interval: Number.isFinite(c?.interval) ? c.interval : 0,
        last: toISO(c?.last || Date.now()),

        // Extras for consistent UI
        fr: (c?.fr || c?.front || "").trim(),
        en: (c?.en || c?.back || "").trim(),
        article: (c?.article || "").trim(),
        example: sanitizeExample(c?.example),
        topic: (c?.topic || "").trim(),
        partOfSpeech: (c?.partOfSpeech || "").trim(),
        gender: (c?.gender || "").trim(),
        tags: sanitizeTags(c?.tags),
      };
      // Strip undefined/null to keep the record tight
      return Object.fromEntries(
        Object.entries(row).filter(([_, v]) => v !== undefined)
      );
    }


    // Auto-resize textarea
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

    // ==================== END // ==================== END STATE ==================== ====================
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
      saveReviewPointer();
    }

    function renderFr(card) {
      const w = (card?.fr ?? card?.front ?? card?.french ?? "").trim();
      if (!w) return w;

      // If the string itself already carries an article, keep it.
      if (/^(l['’]\s*|le\s+|la\s+|les\s+)/i.test(w)) return w;

      const rawArticle = (card?.article ?? "").trim();
      let article = rawArticle.toLowerCase();

      // If an explicit article exists → use it unconditionally.
      if (article) {
        if (article === "l'") article = "l’";
        if (article === "l’") {
          const bare = w.replace(/^l['’]\s*/i, "").trim();
          return `l’${bare}`;
        }
        return `${article} ${w}`;
      }

      // Otherwise fall back to heuristics (gender / elision)
      const posStr = String(
        card?.partOfSpeech || card?.pos || ""
      ).toLowerCase();
      const tagsArr = Array.isArray(card?.tags)
        ? card.tags.map((t) => String(t).toLowerCase())
        : [];
      const hasGender = !!String(card?.gender ?? "").trim();
      const isNoun =
        posStr.includes("noun") ||
        tagsArr.some((t) => t.startsWith("noun")) ||
        hasGender;

      if (!isNoun) return w;

      const startsWithVowelOrMuteH =
        /^[aeiouâêîôûéèëïüœ]/i.test(w) || /^h/i.test(w);
      const gender = String(card?.gender || "").toLowerCase();

      if (startsWithVowelOrMuteH) return `l’${w}`;
      if (gender === "f" || tagsArr.includes("f")) return `la ${w}`;
      if (gender === "m" || tagsArr.includes("m")) return `le ${w}`;

      // Unknown gender → leave bare
      return w;
    }

    // Rebuild vocab deck on prefs change
    watch(
      () => [state.vocab.prefs.randomize, state.vocab.prefs.withoutReplacement],
      () => Vocab.buildVocabDeck(state)
    );

    // ==================== END  ====================
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

    // ==================== END ); ====================
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
        toast.error(
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

    // ==================== END RETURN { LABEL, ANSWER, VERB, PERSONLABEL, TENSELABEL }; ====================
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

    // ==================== END } ====================

    const saveGlobalToSettingsDebounced = (() => {
      let t = null;
      return (delay = 300) => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const existing = (await db.settings.get("v1")) || { key: "v1" };
          await db.settings.put({
            ...existing,
            profileName: state.profileName,
            globalStats: state.globalStats,
            todayStats: state.todayStats,
            ui: {
              ...(existing.ui || {}),
              showVocabTags: !!state.ui.showVocabTags,
            },
            key: "v1",
          });
        }, delay);
      };
    })();

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

    // ==================== END DIR = AWAIT DIR.GETDIRECTORYHANDLE(PARTS[I]); ====================
    // -------------------- Settings persistence helpers --------------------
    const saveSettingsMerged = async (partial) => {
      const existing = (await db.settings.get("v1")) || { key: "v1" };
      await db.settings.put({ ...existing, ...partial, key: "v1" });
    };

    function bumpGlobal(isRight) {
      state.globalStats.total += 1;
      state.todayStats.total += 1;
      if (isRight) {
        state.globalStats.right += 1;
        state.todayStats.right += 1;
      }
      saveGlobalToSettingsDebounced();
    }

    // ==================== END CONST HIT = ROWS.FIND( ====================
    // -------------------- Load-all bootstrap --------------------
    //  Hydrate state from IndexedDB
    // Load dataset + rules + settings + plan + drill prefs
    // Also load external examples if available
    // Restore active Review list or seed from general_vocab.json
    //  =LOAD==================================================================

    async function loadAll() {
      state.dataset = await loadDataset();
      state.rules = await loadRules();

      // ==================== END IF (ISRIGHT) { ====================
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
      // Hydrate settings
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
      // Re-apply UI/prefs from localStorage so they take precedence for UI
      applySettingsToState(state, loadSettings());

      // ==================== END // ALSO LOAD EXTERNAL EXAMPLES IF AVAILABLE ====================
      // -------------------- Vocab Lists hydration --------------------
      await methods.autoImportCsvListsFromData().catch(console.warn);
      await reconcileVocabMetaFromIndex();
      await refreshSavedListsUI();

      // Restore the last-used Review list (if any); otherwise seed from built-in JSON once
      const active = (settings?.activeReviewList || "").trim();

      // Reflect into the UI dropdown so the DataPanel shows the true active list
      state.wordPicker.activeList = active || "";

      // Restore the last-used Review list (if any); otherwise seed from built-in JSON once
      if (active) {
        try {
          await methods.loadListIntoReview(active);
        } catch (e) {
          console.warn(
            "[Lists] failed to restore activeReviewList:",
            active,
            e
          );
        }
      } else {
        // No remembered list → first-run/default: load bundled general_vocab.json
        try {
          const resp = await fetch("general_vocab.json?v=" + Date.now());
          if (resp.ok) {
            const raw = await resp.json();
            const arr = Array.isArray(raw)
              ? raw
              : Array.isArray(raw?.vocab)
              ? raw.vocab
              : null;
            if (arr) {
              state.vocab.cards = arr.map((c, i) => ({
                id: i + 1,
                fr: (c.french ?? c.front ?? c.fr ?? "").trim(),
                en: (c.english ?? c.back ?? c.en ?? "").trim(),
                partOfSpeech: (c.partOfSpeech ?? c.pos ?? "").trim(),
                gender: (c.gender ?? "").trim(),
                topic: (c.topic ?? "").trim(),
                tags: Array.isArray(c.tags)
                  ? c.tags.slice()
                  : c.tags
                  ? String(c.tags)
                      .split(/[;,]/)
                      .map((t) => t.trim())
                      .filter(Boolean)
                  : [],
                example: coerceExample(c.example ?? c.eg ?? null),
              }));

              // build pills + deck
              (function buildPills(cards) {
                const topic = new Set(),
                  tags = new Set(),
                  pos = new Set();
                for (const c of cards) {
                  if (c?.topic) topic.add(c.topic);
                  if (Array.isArray(c?.tags))
                    c.tags.forEach((t) => t && tags.add(t));
                  if (c?.partOfSpeech) pos.add(c.partOfSpeech);
                }
                state.vocabPills.topic = Array.from(topic).sort();
                state.vocabPills.tags = Array.from(tags).sort();
                state.vocabPills.pos = Array.from(pos).sort();
              })(state.vocab.cards);

              if (typeof Vocab?.buildVocabDeck === "function")
                Vocab.buildVocabDeck(state);
              else {
                state.vocab.deck = [...state.vocab.cards];
                state.vocab.deckPtr = 0;
                await saveReviewPointer();
              }
            } else {
              console.warn(
                "general_vocab.json did not contain an array or a {vocab: []} shape."
              );
            }
          } else {
            console.warn("Failed to fetch general_vocab.json:", resp.status);
          }
        } catch (err) {
          console.error("Error loading general_vocab.json:", err);
        }
      }

      // Seed SRS once from Review if DB is empty
      try {
        const srsCount = await db.vocab.count();
        if (
          !srsCount &&
          Array.isArray(state.vocab.cards) &&
          state.vocab.cards.length
        ) {
          const nowISO = new Date().toISOString();
          const seedRows = state.vocab.cards
            .slice(0, 200)
            .map((c) => ({
              // SRS core
              front: (c.fr || "").trim(),
              back: (c.en || "").trim(),
              due: nowISO,
              ease: 2.5,
              reps: 0,
              interval: 0,
              last: nowISO,
              // carry useful metadata to keep Review/SRS “feel” aligned
              fr: c.fr || "",
              en: c.en || "",
              article: c.article || "",
              example: c.example ?? null,
              topic: c.topic || "",
              partOfSpeech: c.partOfSpeech || "",
              gender: c.gender || "",
              tags: Array.isArray(c.tags) ? c.tags.filter(Boolean) : [],
            }))
            .filter((r) => r.front && r.back);

          // ✅ sanitize before writing to Dexie
          const cleanSeedRows = seedRows
            .map(sanitizeSrsRow)
            .filter((r) => r.front && r.back);
          if (cleanSeedRows.length) {
            try {
              await db.vocab.bulkAdd(cleanSeedRows);
            } catch {
              for (const r of cleanSeedRows) {
                try {
                  await db.vocab.add(r);
                } catch {}
              }
            }
          }
        } // <-- closes: if (!srsCount && state.vocab.cards.length)
      } catch (e) {
        console.warn("[SRS seed] failed:", e);
      }

      // --- SRS bootstrap: normalize and load queue on startup ---
      // --- SRS bootstrap: normalize and load queue on startup ---
      try {
        const rows = await db.vocab.toArray();
        if (Array.isArray(rows) && rows.length) {
          const nowISO = new Date().toISOString();

          const isInvalidDate = (v) => {
            if (!v) return true;
            const t = new Date(v).getTime();
            return Number.isNaN(t);
          };

          // Normalize any cards missing/invalid SRS fields so they can be due
          await Promise.all(
            rows.map(async (r) => {
              const invalidDue = isInvalidDate(r.due);

              const needsPatch =
                invalidDue ||
                r.ease == null ||
                r.reps == null ||
                r.interval == null ||
                !r.last;

              if (!needsPatch || r.id == null) return;

              try {
                await db.vocab.update(r.id, {
                  due: invalidDue ? nowISO : r.due,
                  ease: r.ease ?? 2.5,
                  reps: r.reps ?? 0,
                  interval: r.interval ?? 0,
                  last: r.last || nowISO,
                });
              } catch (e) {
                // non-fatal; continue with remaining rows
              }
            })
          );
        }

        // Pull SRS cards + compute first current card
        await Vocab.reloadVocabByTag(db, state.flashcards);
      } catch (e) {
        console.warn("[SRS bootstrap] failed:", e);
      }

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

    // ==================== END  ====================
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

    // ==================== END RESP.STATUS + ====================
    // -------------------- Import helpers (merge-safe upsert for vocab) --------------------
    // Put this near your other helpers in app.js
    async function reconcileVocabMetaFromIndex() {
      const settings = (await db.settings.get("v1")) || { key: "v1" };
      const entries = await listDataEntries(); // [{file,name,description}]
      if (!entries?.length) return;

      const meta = { ...(settings.vocabMeta || {}) };
      for (const e of entries) {
        const base = String(e.file || "")
          .split("/")
          .pop()
          .replace(/\.csv$/i, "")
          .replace(/[_-]+/g, " ")
          .trim();
        if (!base) continue;

        const pretty = (e.name || base).trim();
        const desc = (e.description || e.desc || "").trim();
        const file = e.file.startsWith("data/") ? e.file : "data/" + e.file;

        const m = meta[base] || {};
        if (m.name !== pretty || m.description !== desc || m.file !== file) {
          meta[base] = { name: pretty, description: desc, file };
        }
      }

      await db.settings.put({ ...settings, vocabMeta: meta, key: "v1" });
      state.settings.vocabMeta = meta;
      refreshSavedListsUI();
    }

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

    // ==================== END } ====================
    // -------------------- Methods --------------------
      // ---- Grammar normalizers (map various headers to a common shape) ----
function normRelPronRow(row, idx){
  const g = (k) => (row[k] ?? row[k.toLowerCase()] ?? '').toString().trim();

  // Expected aliases
  const fr      = g('form') || g('lequel') || g('fr') || g('laquelle') || g('lesquels') || g('lesquelles');
  const basePre = g('base_preposition') || g('preposition') || g('prep') || '';
  const anteced = g('antecedent_type') || g('antecedent') || '';
  const meaning = g('meaning_short') || g('meaning') || g('en') || '';
  const notes   = g('notes') || '';
  const exFr    = g('example_fr') || g('ex_fr') || g('exemple_fr') || '';
  const exEn    = g('example_en') || g('ex_en') || g('exemple_en') || '';

  // Compose rule text from base preposition / antecedent when present
  const rule = [basePre && `Base prep: ${basePre}`, anteced && `Antecedent: ${anteced}`]
    .filter(Boolean).join(' — ');

  if (!fr && !meaning && !exFr) return null;
  return {
    _id: 'relpron-'+idx+'-'+(fr||meaning||exFr).slice(0,32),
    type: 'relpron',
    fr, en: '',            // some rows may not need EN headword
    meaning,
    notes,
    example_fr: exFr,
    example_en: exEn,
    rule
  };
}

function normVerbPrepRow(row, idx){
  const g = (k) => (row[k] ?? row[k.toLowerCase()] ?? '').toString().trim();

  // Expected aliases
  const verb    = g('verb') || g('verbe') || '';
  const prep    = g('preposition') || g('prep') || '';
  const fr      = [verb, prep].filter(Boolean).join(' ');
  const en      = g('english_meaning') || g('en') || '';
  const meaning = g('english_meaning') || g('meaning') || g('meaning_short') || '';
  const notes   = g('notes') || '';
  const exFr    = g('example_fr') || g('ex_fr') || g('exemple_fr') || '';
  const exEn    = g('example_en') || g('ex_en') || g('exemple_en') || '';
  const comp    = g('typical_complement') || '';
  const clitic  = g('clitic_replacement') || '';

  const rule = [comp && `Complement: ${comp}`, clitic && `Clitic: ${clitic}`]
    .filter(Boolean).join(' — ');

  if (!fr && !en && !meaning && !exFr) return null;
  return {
    _id: 'verbprep-'+idx+'-'+(fr||en||meaning||exFr).slice(0,32),
    type: 'verbprep',
    fr, en,
    meaning,
    notes,
    example_fr: exFr,
    example_en: exEn,
    rule
  };
}
    // kind ∈ {'relpron','verbprep'}
// Reuses parseCsv(text) already in this file
async function importGrammarCsv(evt, kind){
  const f = evt?.target?.files?.[0];
  if (!f) return;
  try {
    const txt = await f.text();
    const parsed = parseCsv(txt);
    const rows = parsed.rows || [];

    let normalized;
    if (kind === 'relpron') {
      normalized = rows.map((r,i)=>normRelPronRow(r,i)).filter(Boolean);
      state.grammar.relpron = normalized;
      state.grammar.pages.relpron = 1;
      toast?.success?.(`Loaded ${normalized.length} relative-pronoun row(s).`);
    } else if (kind === 'verbprep') {
      normalized = rows.map((r,i)=>normVerbPrepRow(r,i)).filter(Boolean);
      state.grammar.verbprep = normalized;
      state.grammar.pages.verbprep = 1;
      toast?.success?.(`Loaded ${normalized.length} verb+preposition row(s).`);
    } else {
      toast?.warn?.('Unknown grammar import kind: '+kind);
    }
  } catch(e){
    toast?.error?.('Failed to import CSV: ' + (e.message || e));
  } finally {
    if (evt?.target) evt.target.value = '';
  }
}

    // Vocab pills management
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

    async function saveReviewPointer() {
      const existing = (await db.settings.get("v1")) || { key: "v1" };
      await db.settings.put({
        ...existing,
        reviewDeckPtr: state.vocab.deckPtr,
        key: "v1",
      });
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


    // app.js — replace your getScroll/restoreScroll/withScrollLock (around where they are now)
function getScroll() { return { x: window.scrollX, y: window.scrollY }; }
function restoreScroll(pos) { window.scrollTo(pos.x, pos.y); }

async function withScrollLock(run) {
  const before = { pos: getScroll(), tab: state.tab, learn: state.learnTab };
  await run();
  await nextTick();
  const changed = (before.tab !== state.tab) || (before.learn !== state.learnTab);
  if (!changed) restoreScroll(before.pos);
}




    const methods = {
      // vocab
      reloadVocabByTag: () => Vocab.reloadVocabByTag(db, state.flashcards),
      addCard: () => Vocab.addCard(db, state.flashcards),
      deleteCard: (id) => Vocab.deleteCard(db, id, state.flashcards),

      reshuffleVocabDeck: async () => {
        Vocab.reshuffleVocabDeck(state);
        await saveReviewPointer(); // NEW: persist reset to 0
      },

      nextVocabCard: async () => {
        Vocab.nextVocabCard(state); // moves the pointer
        await saveReviewPointer(); // NEW: persist new ptr
      },
      currentVocabCard: () => state.vocab.deck[state.vocab.deckPtr] || null,
      rate,

      // GRAMMAR
      importGrammarCsv,
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
          toast.error("Failed to read file: " + (e.message || e));
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
            toast.error("Recording not supported in this browser.");
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
            toast.error(
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
          toast.error("Microphone permission was denied or unavailable.");
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
          toast.warn(
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

      //     nextDrill: async function
      nextDrill() {
        return withScrollLock(async () => {
          // Try a bunch of times to find a valid Q with current prefs
          let q = null;
          for (let tries = 0; tries < 40 && !q; tries++) {
            q = buildQuestion();
          }

          // If nothing came back, check whether the filtered pool still has verbs
          if (!q) {
            // Recompute the verb pool exactly like buildQuestion() does
            let pool = state.verbs.slice();
            const inc = Array.isArray(state.drillPrefs.includeOnlyTags)
              ? state.drillPrefs.includeOnlyTags.filter(Boolean)
              : [];
            const exc = Array.isArray(state.drillPrefs.excludeTags)
              ? state.drillPrefs.excludeTags.filter(Boolean)
              : [];

            if (inc.length)
              pool = pool.filter((v) =>
                (v.tags || []).some((t) => inc.includes(t))
              );
            if (exc.length)
              pool = pool.filter(
                (v) => !(v.tags || []).some((t) => exc.includes(t))
              );

            if (pool.length > 0) {
              // We *do* have verbs in-scope; just try again shortly (no alert).
              setTimeout(() => methods.nextDrill(), 0);
              return;
            }

            // Truly no drillable items → stop, but keep the original helpful alert
            state.drillSession.running = false;
            toast.warn("No more questions available with current filters.");
            return;
          }

          // We have a question → proceed as before
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
            toast.error("Failed to fetch general_vocab.json: " + resp.status);
            return;
          }
          const raw = await resp.json();
          const arr = Array.isArray(raw)
            ? raw
            : Array.isArray(raw?.vocab)
            ? raw.vocab
            : [];
          if (!arr.length) {
            toast.error("general_vocab.json has no entries.");
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
                // when creating FR→EN
                toAdd.push(
                  sanitizeSrsRow({
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
                  })
                );

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
                // when creating EN→FR
                toAdd.push(
                  sanitizeSrsRow({
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
                  })
                );

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

          toast.success(
            `Imported ${incoming.length} entries; added ${addedSrs} new SRS cards (both directions, deduped; metadata merged).`
          );

          // Optional: take user to Learn → Vocab
          state.tab = "learn";
          state.learnTab = "vocab";
        } catch (e) {
          console.error(e);
          toast.error("Import failed: " + (e.message || e));
        } finally {
          state.newVocabFront = "";
          state.newVocabBack = "";
        }
      },

      // === Load a saved list into the Review deck (non-SRS) ===
      async deleteSavedList(listName) {
        try {
          if (!listName) return;
          if (!confirm(`Delete the list "${listName}"? This cannot be undone.`))
            return;

          const settingsRec = (await db.settings.get("v1")) || { key: "v1" };
          const lists = { ...(settingsRec.vocabLists || {}) };

          if (!(listName in lists)) {
            toast.error("List not found.");
            return;
          }

          // Remove and persist
          delete lists[listName];
          await db.settings.put({
            ...settingsRec,
            vocabLists: lists,
            key: "v1",
          });

          // Refresh savedLists in UI

          // If that list was active in the Review picker, revert to Default (built-in)
          if (state.wordPicker.activeList === listName) {
            state.wordPicker.activeList = "";
            try {
              // Use existing loader to swap Review back to built-in JSON deck
              await methods.loadListIntoReview("");
            } catch (e) {
              console.warn(
                "[Lists] fallback to default review deck failed:",
                e
              );
            }
          }
          refreshSavedListsUI();

          console.log(`[Lists] Deleted "${listName}"`);
        } catch (e) {
          console.error("[Lists] deleteSavedList failed:", e);
          toast.error("Could not delete that list.");
        }
        // If that list was active in the Review picker, revert to Default (built-in)
        if (state.wordPicker.activeList === listName) {
          state.wordPicker.activeList = "";
          const s = (await db.settings.get("v1")) || { key: "v1" };
          await db.settings.put({ ...s, activeReviewList: "", key: "v1" });
          // Keep current deck; the next full reload will seed from built-in
          // (or call methods.loadListIntoReview('') if you want to clear immediately)
        }
      },

      // --- SRS: remove only the cards from a specific saved list ---
      async clearSrsForList(listName) {
        if (!listName) return toast.warn("No list selected.");
        const settingsRec = (await db.settings.get("v1")) || { key: "v1" };
        const list = settingsRec?.vocabLists?.[listName];
        if (!Array.isArray(list) || !list.length)
          return toast.warn("List not found or empty.");

        if (!confirm(`Remove SRS cards matching the list "${listName}"?`))
          return;

        // Build a set of (front,en) keys to match
        const keyOf = (front, back) =>
          (front || "").toLowerCase().trim() +
          "␟" +
          (back || "").toLowerCase().trim();
        const delKeys = new Set(
          list
            .map((it) => ({
              fr: (it.fr || "").trim(),
              en: (it.en || "").trim(),
            }))
            .filter((x) => x.fr && x.en)
            .map((x) => keyOf(x.fr, x.en))
        );

        // Delete matching SRS rows
        const rows = await db.vocab.toArray();
        let removed = 0;
        for (const r of rows) {
          const k = keyOf(r.front || r.fr, r.back || r.en);
          if (delKeys.has(k)) {
            try {
              await db.vocab.delete(r.id);
              removed++;
            } catch {}
          }
        }

        // Refresh SRS pane
        await Vocab.reloadVocabByTag(db, state.flashcards);
        toast.success(`Removed ${removed} SRS card(s) from "${listName}".`);
      },

      // --- SRS maintenance ---
// --- SRS maintenance ---
async clearAllSrs() {
  if (!confirm("Delete ALL SRS cards? This cannot be undone.")) return;
  if (!confirm("Really delete all SRS cards now?")) return;

  try {
    await db.vocab.clear();
  } catch (e) {
    console.warn("[SRS] clearAllSrs failed:", e);
    toast.warn("Failed to clear SRS: " + (e.message || e));
    return;
  }

  // Reset SRS UI
  state.flashcards.allCards = [];
  state.flashcards.dueCards = [];
  state.flashcards.currentCard = null;
  state.flashcards.showBack = false;
  state.flashcards.counts = { total: 0, learned: 0 };

  // ✅ Rebuild SRS view so everything downstream is consistent
  if (Vocab?.reloadVocabByTag) {
    await Vocab.reloadVocabByTag(db, state.flashcards);
  }

  toast.success("SRS cleared. You can re-load a list into SRS from the Data tab.");
},


      async resetSrsScheduling() {
        if (!confirm("Reset SRS scheduling (keep cards, set all due now)?"))
          return;

        const nowISO = new Date().toISOString();
        try {
          const rows = await db.vocab.toArray();
          for (const r of rows) {
            await db.vocab.update(r.id, {
              due: nowISO,
              ease: 2.5,
              reps: 0,
              interval: 0,
              last: nowISO,
            });
          }
        } catch (e) {
          console.warn("[SRS] reset scheduling failed:", e);
          toast.warn("Failed to reset SRS scheduling: " + (e.message || e));
          return;
        }

        // Reload SRS queue and refresh current card
        await Vocab.reloadVocabByTag(db, state.flashcards);
        toast.info("SRS scheduling reset. All cards are now due.");
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
      autoImportCsvListsFromData,

      // END METHODS

      // Load-all
      loadAll,
    };

    //
    // Auto-detect delimiter: comma, semicolon, or tab
    function detectDelimiter(line) {
      const candidates = [",", ";", "\t"];
      let best = ",",
        bestCount = 0;
      for (const d of candidates) {
        // count split parts ignoring empty trailing fields
        const count = line.split(d).length;
        if (count > bestCount) {
          best = d;
          bestCount = count;
        }
      }
      return best;
    }

    //
    function toPlainWord(it) {
      const tags = Array.isArray(it.tags)
        ? it.tags.slice()
        : it.tags && typeof it.tags[Symbol.iterator] === "function"
        ? [...it.tags]
        : typeof it.tags === "string"
        ? it.tags
            .split(/[,;|]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      return {
        fr: String(it.fr || "").trim(),
        en: String(it.en || "").trim(),
        article: String(it.article || "").trim(),
        tags: tags.map((t) => String(t)),
      };
    }

    //
    function parseCsv(text) {
      // strip BOM
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      const linesRaw = text.split(/\r?\n/);
      const lines = linesRaw.filter((l) => l.trim() !== "");
      if (!lines.length) return { headers: [], rows: [], delimiter: "," };

      const delimiter = detectDelimiter(lines[0]);

      const split = (line) => {
        const out = [];
        let cur = "",
          inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i],
            nxt = line[i + 1];
          if (ch === '"' && inQ && nxt === '"') {
            cur += '"';
            i++;
            continue;
          }
          if (ch === '"') {
            inQ = !inQ;
            continue;
          }
          if (ch === delimiter && !inQ) {
            out.push(cur);
            cur = "";
            continue;
          }
          cur += ch;
        }
        out.push(cur);
        return out.map((s) => s.trim());
      };

      const headers = split(lines[0]).map((h) => h.toLowerCase());
      const rows = lines.slice(1).map((l) => {
        const cols = split(l);
        const obj = {};
        headers.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
        return obj;
      });

      return { headers, rows, delimiter };
    }

   // Extend the CSV normalizer to also handle FR_verb + preposition schemas
function normalizeCsvRow(row) {
  const get = (k) => (row[k] ?? row[k.toLowerCase()] ?? "").toString().trim();

  // A) Legacy vocab headers (still supported)
  const frLegacy = get("FR") || get("French") || get("french");
  const enLegacy = get("EN") || get("English") || get("english");
  const rawArticle = get("article") || get("gender") || get("Gender");

  // B) New verb+preposition headers
  const frVerb = get("FR_verb") || get("fr_verb") || get("verb") || get("verbe");
  const prep   = get("preposition") || get("prep");
  const enMean = get("english_meaning") || get("meaning") || get("meaning_short");

  // Build FR/EN with priority: legacy if present, else verb+prep
  const fr = (frLegacy || [frVerb, prep].filter(Boolean).join(" ")).trim();
  const en = (enLegacy || enMean).trim();

  // Examples: accept either single 'example' or split FR/EN examples
  const exStr = get("example") || get("ex"); // legacy single-string
  const exFr  = get("example_fr") || get("ex_fr") || get("exemple_fr");
  const exEn  = get("example_en") || get("ex_en") || get("exemple_en");

  // Tags: still supported (comma/pipe separated or array)
  const tags = Array.isArray(row.tags)
    ? row.tags
    : (get("tags") || "")
        .split(/[,|]/)
        .map((t) => t.trim())
        .filter(Boolean);

  // If nothing useful, skip row
  if (!fr || !en) return null;

  // Compose example object if present
  let example = null;
  if (exFr || exEn) {
    example = { fr: exFr || "", en: exEn || "" };
  } else if (exStr) {
    example = { fr: exStr, en: "" };
  }

  return {
    fr,
    en,
    article: normalizeArticle(fr, rawArticle), // will be "" for verbs; OK
    gender:
      ["m", "masc", "masculin"].includes((rawArticle || "").toLowerCase())
        ? "m"
        : ["f", "fem", "féminin", "feminin", "feminine"].includes(
            (rawArticle || "").toLowerCase()
          )
        ? "f"
        : "",
    example, // {fr,en} or null
    tags,
  };
}


    // helpers (top of app.js near your other helpers)
    const normalizeStr = (s) => (s ?? "").toString().trim();
    const isVowelStart = (s) => /^[aeiouhâêîôûéèëïüAEIOUH]/.test(s || "");

    function normalizeArticle(fr, raw) {
      const a = normalizeStr(raw).toLowerCase();

      // direct articles pass-through (normalize straight apostrophe)
      if (["le", "la", "l'", "l’", "les"].includes(a))
        return a === "l'" ? "l’" : a;

      // plural markers
      if (["pl", "plural", "les"].includes(a)) return "les";

      // mixed gender
      if (
        [
          "mf",
          "m/f",
          "m-f",
          "m&f",
          "masc/fem",
          "masculin/féminin",
          "masculin/feminin",
        ].includes(a)
      ) {
        // show as "le/la" (no elision for mixed)
        return "le/la";
      }

      // gendered
      if (["m", "masc", "masculin"].includes(a))
        return isVowelStart(fr) ? "l’" : "le";
      if (["f", "fem", "féminin", "feminin", "feminine"].includes(a))
        return isVowelStart(fr) ? "l’" : "la";

      return ""; // unknown → no article
    }

    // Coerce example to a { fr, en } or null; keeps UI consistent
    function coerceExample(ex) {
      if (!ex) return null;
      if (typeof ex === "string") return { fr: ex.trim(), en: "" };
      if (typeof ex === "object")
        return { fr: normalizeStr(ex.fr), en: normalizeStr(ex.en) };
      return null;
    }

    async function importVocabCsv(evt) {
      console.log("[CSV]", { file: evt?.target?.files?.[0]?.name });
      const f = evt?.target?.files?.[0];
      if (!f) return;
      try {
        const txt = await f.text();
        const parsed = parseCsv(txt);
        const items = parsed.rows.map(normalizeCsvRow).filter(Boolean);

        state.csv.headers = parsed.headers;
        state.csv.rows = parsed.rows;
        state.csv.meta = {
          delimiter: parsed.delimiter,
          total: parsed.rows.length,
          normalized: items.length,
        };

        state.wordPicker.items = items;
        state.wordPicker.selected = {};
        items.forEach((_, i) => (state.wordPicker.selected[i] = true));
        if (!state.wordPicker.listName) {
          state.wordPicker.listName =
            new Date().toISOString().slice(0, 10) + " list";
        }

        if (!items.length) {
          toast.warn(
            `CSV loaded but 0 usable rows.\n\n` +
              `Detected delimiter: "${parsed.delimiter}"\n` +
              `Headers: [${parsed.headers.join(", ")}]\n\n` +
              `Expected headers include EN/FR/article (case-insensitive). ` +
              `You can also use english/french/front/back or det/déterminant.`
          );
        } else {
          console.log(
            `CSV loaded: ${items.length} row(s) normalized (of ${parsed.rows.length} raw).`
          );
        }
      } catch (e) {
        toast.error("Failed to read CSV: " + (e.message || e));
      } finally {
        if (evt?.target) evt.target.value = "";
      }
    }

    async function saveVocabListsToSettings(updater) {
      const settingsRec = (await db.settings.get("v1")) || { key: "v1" };

      // Start from a plain snapshot (defensive)
      const existingPlain = JSON.parse(JSON.stringify(settingsRec));

      const curr =
        existingPlain.vocabLists && typeof existingPlain.vocabLists === "object"
          ? existingPlain.vocabLists
          : {};

      const next =
        typeof updater === "function" ? updater(curr) : updater || curr;

      const out = {
        ...existingPlain,
        vocabLists: JSON.parse(JSON.stringify(next)),
        key: "v1",
      };

      await db.settings.put(out);
    }

    function togglePickAll(flag) {
      const sel = {};
      state.wordPicker.items.forEach((_, i) => (sel[i] = !!flag));
      state.wordPicker.selected = sel;
    }

    async function savePickedAsList(pickedIdxArr) {
      const name = (state.wordPicker.listName || "").trim();
      if (!name) {
        toast.info("Please enter a list name.");
        return;
      }

      // indices from filteredItems (if passed) or from checkboxes
      let indices;
      if (Array.isArray(pickedIdxArr) && pickedIdxArr.length) {
        indices = pickedIdxArr;
      } else {
        indices = Object.entries(state.wordPicker.selected)
          .filter(([, v]) => !!v)
          .map(([k]) => Number(k));
      }

      // Build normalized entries (PLAIN data only)
      const picked = indices
        .map((i) => state.wordPicker.items[i])
        .filter(Boolean)
        .map((it) => ({
          fr: String(it.fr || "").trim(),
          en: String(it.en || "").trim(),
          article: String(it.article || "").trim(),
          example: coerceExample(it.example), // returns {fr,en} or null → plain
          tags: Array.isArray(it.tags) ? it.tags.map((t) => String(t)) : [],
        }));

      if (!picked.length) {
        toast.warn("No words selected.");
        return;
      }

      // 🚫 Kill any reactive/proxy residue with a JSON round-trip
      const plainPicked = JSON.parse(JSON.stringify(picked));

      await saveVocabListsToSettings((curr) => ({
        ...curr,
        [name]: plainPicked,
      }));

      // Mark this as the active Review list and mirror into UI
      const settings = (await db.settings.get("v1")) || { key: "v1" };
      await db.settings.put({ ...settings, activeReviewList: name, key: "v1" });
      state.wordPicker.activeList = name;

      // ✅ Refresh the Data Panel's Saved Lists immediately (no page reload needed)
      await refreshSavedListsUI();

      toast.success(`Saved list "${name}" with ${plainPicked.length} items.`);
    }

    // === Load a saved sub-list straight into Review (non-SRS) ===

    // Load a saved sub-list straight into Review (non-SRS)
    async function loadListIntoReview(name) {
      const settings = (await db.settings.get("v1")) || { key: "v1" };
      await db.settings.put({
        ...settings,
        activeReviewList: name || "",
        key: "v1",
      });

      const list = settings?.vocabLists?.[name];

      // If blank or missing, keep current deck (lets app fall back during initial hydration)
      if (!Array.isArray(list) || !list.length) {
        console.log(
          `[Lists] loadListIntoReview: list "${name}" not found or empty; keeping existing deck.`
        );
        return;
      }

      const cards = list
        .map((it) => ({
          id: null,
          fr: (it.fr || "").trim(),
          en: (it.en || "").trim(),
          article: (it.article || "").trim(),
          example: coerceExample(it.example),
          tags: Array.isArray(it.tags) ? it.tags : [],
          source: "list:" + name,
        }))
        .filter((c) => c.fr && c.en);

      state.vocab.cards = cards;
      // IMPORTANT: call your deck builder correctly
      if (typeof Vocab?.buildVocabDeck === "function")
        Vocab.buildVocabDeck(state);
      else {
        state.vocab.deck = [...state.vocab.cards];
        state.vocab.deckPtr = 0;
      }
      await saveReviewPointer();
      state.tab = "learn";
    }

    // === Load a saved list into SRS (Dexie-backed) ===f
    async function loadListIntoSrs(name) {
      const settings = (await db.settings.get("v1")) || { key: "v1" };
      const list = settings?.vocabLists?.[name];
      if (!Array.isArray(list) || !list.length) {
        toast.warn("List not found or empty.");
        return;
      }

      const nowISO = new Date().toISOString();
      const existing = await db.vocab.toArray();
      const keyOf = (front, back) =>
        (front || "").toLowerCase().trim() +
        "␟" +
        (back || "").toLowerCase().trim();
      const have = new Set(
        existing.map((r) => keyOf(r.front || r.fr, r.back || r.en))
      );

      const toAdd = [];
      for (const it of list) {
        const fr = (it.fr || "").trim(),
          en = (it.en || "").trim();
        if (!fr || !en) continue;
        const k = keyOf(fr, en);
        if (have.has(k)) continue;
        toAdd.push(
          sanitizeSrsRow({
            front: fr,
            back: en, // SRS core
            fr,
            en,
            article: it.article || "",
            example: it.example || null,
            tags: Array.isArray(it.tags) ? it.tags : [],
            due: nowISO,
            ease: 2.5,
            reps: 0,
            interval: 0,
            last: nowISO,
          })
        );

        have.add(k);
      }

      if (toAdd.length) {
        try {
          await db.vocab.bulkAdd(toAdd);
        } catch {
          for (const r of toAdd) {
            try {
              await db.vocab.add(r);
            } catch {}
          }
        }
      }
      if (Vocab?.reloadVocabByTag)
        await Vocab.reloadVocabByTag(db, state.flashcards);
      toast.success(`Loaded "${name}" into SRS: ${toAdd.length} new card(s).`);
    }

    // ==================== END TAGS = NEW SET(), ====================
    // -------------------- Boot --------------------
    loadAll();

    // Expose refs & methods to template
    const refs = toRefs(state);
    return {
      ...refs,
      state,
      methods,
      toast,
      dismissToast,
      //  
      tagPills,
      // expose helpers the templates use
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

    // ==================== END }); ====================
  },
});

const vm = vueApp.mount("#app");
window.parlApp = vm;

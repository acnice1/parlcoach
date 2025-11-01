// /core/settings.js
// Single source of truth for settings & UI persistence (localStorage), with schema versioning.
// Keeps Vue out of this file (no direct reactive deps). The root passes `watch` when it wants autosave.

const STORAGE_KEY = "parlcoach.settings.v1";
const SCHEMA_VERSION = 1;

// Keep defaults small and generic. You can add more later without breaking callers.
export const DEFAULT_SETTINGS = {
  schema: SCHEMA_VERSION,
  ui: {
    showVocabTags: true,
    vocabMode: "review",   // "review" | "flashcards"
  },
  prefs: {
    vocab: { shuffle: true, filters: [] },
    drill: { voice: "", rate: 1 },
  },
  stats: {},                // keep flexible
};

// ---- basic helpers ----
function clone(x) {
  return x && typeof x === "object" ? JSON.parse(JSON.stringify(x)) : x;
}
function merge(target, source) {
  if (!source || typeof source !== "object") return target;
  const out = Array.isArray(target) ? [...target] : { ...target };
  for (const k of Object.keys(source)) {
    const sv = source[k];
    const tv = out[k];
    if (Array.isArray(sv)) out[k] = sv.slice();
    else if (sv && typeof sv === "object") out[k] = merge(tv && typeof tv === "object" ? tv : {}, sv);
    else out[k] = sv;
  }
  return out;
}
function debounce(fn, ms = 300) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---- load / save / migrate ----
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return migrateSettings(parsed);
  } catch {
    return clone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(partialOrUpdater) {
  const current = loadSettings();
  const next =
    typeof partialOrUpdater === "function"
      ? partialOrUpdater(clone(current))
      : merge(clone(current), partialOrUpdater || {});
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    // non-fatal; storage might be unavailable
    console.warn("saveSettings failed:", e);
  }
  return next;
}

export function migrateSettings(s) {
  // Handle missing/older schemas gracefully; always return a valid shape.
  if (!s || typeof s !== "object") return clone(DEFAULT_SETTINGS);

  // Example migration chain (extend as you bump SCHEMA_VERSION)
  const inSchema = typeof s.schema === "number" ? s.schema : 0;
  let cur = clone(s);

  if (inSchema < 1) {
    // -> v1: ensure required branches exist
    cur = merge(DEFAULT_SETTINGS, cur);
    cur.schema = 1;
  }

  // If future migrations are added, chain them here.

  // Finally, ensure the result matches current defaults shape (fill missing keys)
  cur = merge(DEFAULT_SETTINGS, cur);
  return cur;
}

// ---- bridging: apply <-> extract ----
// These let your root own the app state shape without this module knowing Vue.
export function applySettingsToState(state, settings) {
  if (!state) return;
  const s = settings || DEFAULT_SETTINGS;

  // UI mirror (edit this mapping to match your state tree)
  state.ui = state.ui || {};
  state.ui.showVocabTags = !!(s.ui && s.ui.showVocabTags);
  state.vocabMode = (s.ui && s.ui.vocabMode) || "review";

  // Example prefs mirror (keep loose so it won’t crash if absent)
  state.prefs = state.prefs || {};
  state.prefs.vocab = merge({ shuffle: true, filters: [] }, s.prefs?.vocab || {});
  state.prefs.drill = merge({ voice: "", rate: 1 }, s.prefs?.drill || {});

  // Stats (leave flexible)
  state.stats = merge({}, s.stats || {});
}

// Pull just the parts we persist; this keeps storage minimal and stable over time.
export function extractSettingsFromState(state) {
  if (!state) return clone(DEFAULT_SETTINGS);
  return {
    schema: SCHEMA_VERSION,
    ui: {
      showVocabTags: !!state?.ui?.showVocabTags,
      vocabMode: state?.vocabMode || "review",
    },
    prefs: {
      vocab: merge({ shuffle: true, filters: [] }, state?.prefs?.vocab || {}),
      drill: merge({ voice: "", rate: 1 }, state?.prefs?.drill || {}),
    },
    stats: merge({}, state?.stats || {}),
  };
}

// ---- Vue-friendly autosave hook ----
// Call this from app.js after state exists. Pass Vue's `watch`.
export function startAutoSave(state, watch, { debounceMs = 300 } = {}) {
  if (typeof watch !== "function") return;

  const doSave = debounce(() => {
    const snapshot = extractSettingsFromState(state);
    saveSettings(snapshot);
  }, debounceMs);

  // Persist on any relevant changes; keep deep so nested prefs are saved.
  watch(
    () => extractSettingsFromState(state),
    () => doSave(),
    { deep: true }
  );
}

// js/drills.js
import { clamp, toArr } from './utils.js';
import * as DB from './db.js?v=2';

const COLLATED_URL = DB.COLLATED_URL ?? 'top200_french_verbs_collated.json';
const RULES_URL    = DB.RULES_URL    ?? 'verb_conjugation_rules.json';

export function sm2Schedule(card, q/*0..5*/) {
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
  const now = new Date(); const due = new Date(now); due.setDate(now.getDate() + interval);
  return { ease, reps, interval, due: due.toISOString(), last: now.toISOString() };
}

export function fixedSchedule(card, intervalsDays, q) {
  let reps = card.reps ?? 0; if (q < 3) reps = 0; else reps += 1;
  const idx = clamp(reps, 0, intervalsDays.length - 1), interval = intervalsDays[idx];
  const now = new Date(); const due = new Date(now); due.setDate(now.getDate() + interval);
  return { ease: 2.5, reps, interval, due: due.toISOString(), last: now.toISOString() };
}

export async function loadDataset() {
  try {
    const res = await fetch(COLLATED_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const index = new Map();
    for (const v of (json?.verbs || [])) {
      const inf = (v.verb || '').trim();
      if (inf) index.set(inf, v.tenses || {});
    }
    return index;
  } catch (e) {
    console.warn('[dataset] load failed:', e);
    return null;
  }
}

export async function loadRules() {
  try {
    const res = await fetch(RULES_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('[rules] load failed:', e?.message || e);
    return null;
  }
}

export async function saveDrillPrefs(db, state) {
  const prefs = state.drillPrefs;
  const base = (typeof Vue !== 'undefined' && Vue.toRaw) ? Vue.toRaw(prefs) : prefs;

  const clean = {
    key: base.key || 'v1',
    includeOnlyTags: toArr(base.includeOnlyTags),
    excludeTags:     toArr(base.excludeTags),
    persons: Array.isArray(base.persons) ? base.persons.slice() : [],
    allowedTenses: Array.isArray(base.allowedTenses) ? base.allowedTenses.slice() : [],
    questionTypes: Array.isArray(base.questionTypes) ? base.questionTypes.slice() : [],
    showEnglishTranslation: !!base.showEnglishTranslation,
    showNotesOnCorrect: !!base.showNotesOnCorrect,
    acceptAltPronouns: !!base.acceptAltPronouns,
    acceptNoSubjectShortcut: !!base.acceptNoSubjectShortcut,
    acceptAposVariants: !!base.acceptAposVariants,
    maxQuestions: typeof base.maxQuestions === 'number' ? base.maxQuestions : Number(base.maxQuestions) || 10,
    autoNext: !!base.autoNext,
    tenses: Array.isArray(base.tenses) ? base.tenses.slice() : [],
  };

  const storable = (typeof structuredClone === 'function')
    ? structuredClone(clean)
    : JSON.parse(JSON.stringify(clean));

  await db.drill.put(storable);
}

export function scoreClass(total, right) {
  if (!total) return 'default';
  const pct = (right / total) * 100;
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'ok';
  return 'bad';
}

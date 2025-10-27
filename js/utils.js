// js/utils.js
export function todayISO(){ return new Date().toISOString(); }
export function toDateOnly(iso){ try{ return new Date(iso).toLocaleDateString(); }catch{ return 'n/a'; } }
export function randChoice(a){ return a[Math.floor(Math.random()*a.length)]; }
export function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }
export function isVowelStart(s){ return /^[aeiouhâêîôûéèëïüAEIOUH]/.test(s||''); }

// Accept optional subject pronoun at the start
// Leading "que / qu’ / qu'" OR leading subject pronoun (je/j', tu, il/elle/on, nous, vous, ils/elles)
export const LEAD_TOKEN_RE = /^\s*(?:que\b|qu['’]|(?:j’|j'|je|tu|il|elle|on|nous|vous|ils|elles)\b)\s*/iu;

// crypto-safe random for shuffles
export function rand01() {
  if (window.crypto?.getRandomValues) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 2**32;
  }
  return Math.random();
}

// Fisher–Yates
export function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand01() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function normalize(s){
  return (s || '')
    .replace(/\u00A0|\u202F/g, ' ')
    .replaceAll('’', "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripSubjectPronoun(s){
  let t = normalize(s);
  let prev;
  do {
    prev = t;
    // strip one leading token each pass: "que/qu’/qu'" OR a subject pronoun
    t = t.replace(LEAD_TOKEN_RE, '').trim();
  } while (t !== prev);
  return t;
}

export function answersEqual(userInput, expectedFull){
  const a = normalize(userInput);
  const b = normalize(expectedFull);
  return a === b || stripSubjectPronoun(a) === stripSubjectPronoun(b);
}
export const normalizeStr = s => (s ?? '').toString().trim();
export function normalizeTags(raw){
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(t => normalizeStr(t)).filter(Boolean);
  if (typeof raw === 'string') return raw.split(',').map(t => t.trim()).filter(Boolean);
  return [];
}

// normalize value to array
export function toArr(v) {
  return Array.isArray(v) ? v
    : typeof v === 'string'
      ? v.split(',').map(s => s.trim()).filter(Boolean)
      : [];
}

// cloneable plain object
export function toPlain(obj) {
  try {
    const raw = (typeof Vue !== 'undefined' && Vue.toRaw) ? Vue.toRaw(obj) : obj;
    return typeof structuredClone === 'function'
      ? structuredClone(raw)
      : JSON.parse(JSON.stringify(raw));
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
}

export const days = n => n * 24 * 60 * 60 * 1000;

// Verb helpers
export const IRREGULAR_SET = new Set([
  'être','avoir','aller','faire','pouvoir','vouloir','devoir','savoir','venir','tenir',
  'prendre','mettre','dire','voir','ouvrir','offrir','souffrir','recevoir','vivre',
  'écrire','lire','dormir','sortir','partir','mourir','naître','connaître',
  'croire','courir','boire','envoyer','falloir','pleuvoir','valoir'
]);
export function groupOfInf(inf) {
  if (inf.endsWith('er')) return 'er';
  if (inf.endsWith('ir')) return 'ir';
  if (inf.endsWith('re')) return 're';
  return 'other';
}
export function isIrregularVerbRow(v) {
  if ((v.tags || []).includes('irregular')) return true;
  if (IRREGULAR_SET.has(v.infinitive)) return true;
  const g = groupOfInf(v.infinitive);
  return g === 'other';
}

// Conjugation constants
export const PRONOUNS = ['je','tu','il/elle','nous','vous','ils/elles'];
export const PERSON_KEY = ['je','tu','il/elle/on','nous','vous','ils/elles'];
export const INTERNAL_TENSES = [
  'present','passeCompose','imparfait','plusQueParfait',
  'futur','conditionnelPresent','subjonctifPresent','imperatif'
];
export const DISPLAY_TENSE = {
  present:'Présent', passeCompose:'Passé composé', imparfait:'Imparfait', plusQueParfait:'Plus-que-parfait',
  futur:'Futur simple', conditionnelPresent:'Conditionnel présent', subjonctifPresent:'Subjonctif présent',
  imperatif:'Impératif'
};
export const TENSE_DS_KEY = {
  present: 'Présent',
  imparfait: 'Imparfait',
  passeCompose: 'Passé composé',
  plusQueParfait: 'Plus-que-parfait',
  futur: 'Futur simple',
  conditionnelPresent: 'Conditionnel présent',
  subjonctifPresent: 'Subjonctif présent',
  imperatif: 'Impératif'
};
export const PERSON_LABELS = ['je','tu','il/elle/on','nous','vous','ils/elles'];
export const TENSE_EXAMPLE_KEY = {
  present: 'present',
  passeCompose: 'passeCompose',
  imparfait: 'imparfait',
  plusQueParfait: 'plusQueParfait',
  futur: 'futurSimple',
  conditionnelPresent: 'conditionnelPresent',
  subjonctifPresent: 'subjonctifPresent',
  imperatif: 'imperatif'
};

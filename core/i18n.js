// /core/i18n.js
// Tiny, framework-agnostic i18n for ES modules + Vue 3 globals.
// Features: reactive locale, lazy JSON loading by namespace, interpolation, fallback.

export function createI18n(opts = {}) {
  const {
    locale: initial = 'en',
    fallback = 'en',
    storageKey = 'parl_i18n_locale',
    basePath = 'locales',   // e.g. /locales/en/common.json
    preload = ['common'],    // namespaces to load on init
    Vue // pass the Vue global from app.js
  } = opts;

  const state = Vue.reactive({
    locale: localStorage.getItem(storageKey) || initial,
    fallback,
    messages: {},     // { en: {common:{...}, vocab:{...}}, fr:{...} }
    loaded: {},       // { en: Set(['common','vocab']), fr: ... }
    ready: false
  });

  function pathGet(obj, path) {
    return path.split('.').reduce((o,k)=> (o && k in o) ? o[k] : undefined, obj);
  }

  function format(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
  }

  async function loadNamespace(locale, ns) {
    state.loaded[locale] ||= new Set();
    if (state.loaded[locale].has(ns)) return;
    const url = `${basePath}/${locale}/${ns}.json?v=${(window.APP_VERSION||'1')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`i18n load failed: ${url}`);
    const json = await res.json();
    state.messages[locale] ||= {};
    state.messages[locale][ns] = json;
    state.loaded[locale].add(ns);
  }

  async function ensure(locale, namespaces) {
    await Promise.all((namespaces||[]).map(ns => loadNamespace(locale, ns)));
  }

  async function setLocale(locale) {
    if (locale === state.locale) return;
    state.locale = locale;
    localStorage.setItem(storageKey, locale);
    // Optionally preload 'common' for the new locale
    await ensure(locale, ['common']);
  }

  function t(key, vars) {
    // key form: "ns.path.to.key" (ns required for lazy loading)
    const [ns, ...rest] = key.split('.');
    const path = rest.join('.');
    const cur = pathGet(state.messages[state.locale]?.[ns], path);
    if (typeof cur === 'string') return format(cur, vars);

    const fb = pathGet(state.messages[state.fallback]?.[ns], path);
    if (typeof fb === 'string') return format(fb, vars);

    // last resort: show key
    return key;
  }

  // number/date helpers (very light)
  function n(value, options) {
    try { return new Intl.NumberFormat(state.locale, options).format(value); }
    catch { return String(value); }
  }
  function d(value, options) {
    try { return new Intl.DateTimeFormat(state.locale, options).format(value); }
    catch { return String(value); }
  }

  // init
  (async () => {
    try { await ensure(state.locale, preload); }
    finally { state.ready = true; }
  })();

  return { state, t, n, d, setLocale, loadNamespace, ensure };
}

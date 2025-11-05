// js/components/DrillPanel.js 
const DrillPanel = {
  name: 'DrillPanel',
  props: ['state','methods'],

  setup(props){
    const inputRef = Vue.ref(null);
    const helpRef  = Vue.ref(null);
    const helpMin  = Vue.ref(0);

    // --- tiny debounce utility ---
    const debounce = (fn, ms = 150) => {
      let t; 
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    };

    // Focus the input whenever the question changes
    Vue.watch(() => props.state.drillSession.question, async () => {
      await Vue.nextTick();
      inputRef.value?.focus({ preventScroll: true });
    });

    const scoreCls = Vue.computed(() => {
      const t = props.state.drillSession.total || 0;
      const r = props.state.drillSession.right || 0;
      if (!t) return 'default';
      const pct = (r / t) * 100;
      if (pct >= 80) return 'good';
      if (pct >= 50) return 'ok';
      return 'bad';
    });

    const fullConj = Vue.computed(() => {
      try {
        const sess = props.state.drillSession;
        if (!sess?.question?.meta) return null;

        const inf = sess.question.meta.infinitive;
        const tense = sess.question.meta.tense; // e.g., "Présent"
        if (!inf || !tense) return null;

        // dataset: Map(infinitive -> { "Présent": {...}, "Passé composé": {...}, ... })
        const tensesObj = props.state.dataset?.get(inf);
        if (!tensesObj) return null;
        const block = tensesObj[tense];
        if (!block) return null;

        const persons = ["je", "tu", "il/elle/on", "nous", "vous", "ils/elles"];
        return persons.map(p => ({ person: p, value: block[p] ?? "—" }));
      } catch {
        return null;
      }
    });

    const includeCSV = Vue.computed({
      get(){
        const v = props.state.drillPrefs.includeOnlyTags;
        return Array.isArray(v) ? v.join(', ') : (v || '');
      },
      set(val){
        const arr = String(val).split(',').map(s => s.trim()).filter(Boolean);
        props.state.drillPrefs.includeOnlyTags = arr;
        props.methods.saveDrillPrefs?.();
      }
    });

    const excludeCSV = Vue.computed({
      get(){
        const v = props.state.drillPrefs.excludeTags;
        return Array.isArray(v) ? v.join(', ') : (v || '');
      },
      set(val){
        const arr = String(val).split(',').map(s => s.trim()).filter(Boolean);
        props.state.drillPrefs.excludeTags = arr;
        props.methods.saveDrillPrefs?.();
      }
    });

    // --- autostart / autorefresh wiring ---
    const hasVerbs = () => (props.state.verbs?.length || 0) > 0;

    const refreshSession = () => {
      if (!hasVerbs()) return;
      if (props.state.drillSession?.running && typeof props.methods.refreshDrill === 'function') {
        props.methods.refreshDrill();
      } else {
        props.methods.startDrill?.();
      }
    };

    const debouncedRefresh = debounce(refreshSession, 150);

    // ---- Defaults + normalization for persons/tenses ----
const ALL_PERSONS = [0,1,2,3,4,5];
const ALL_TENSES  = [
  'present','passeCompose','imparfait','plusQueParfait',
  'futur','conditionnelPresent','subjonctifPresent','imperatif'
];

function normalizePersons(arr) {
  const vals = Array.isArray(arr) ? arr : [];
  const nums = vals.map(v => (typeof v === 'string' ? Number(v) : v))
                   .filter(v => ALL_PERSONS.includes(v));
  // de-dupe while preserving order
  return [...new Set(nums)];
}

function normalizeTenses(arr) {
  const vals = Array.isArray(arr) ? arr : [];
  const strs = vals.map(v => String(v)).filter(v => ALL_TENSES.includes(v));
  return [...new Set(strs)];
}

function ensureDrillDefaults({ save = false } = {}) {
  const dp = (props.state.drillPrefs ||= {});
  // Ensure arrays exist
  if (!Array.isArray(dp.persons) || dp.persons.length === 0) dp.persons = [...ALL_PERSONS];
  if (!Array.isArray(dp.tenses)  || dp.tenses.length  === 0) dp.tenses  = [...ALL_TENSES];

  // Normalize types/values
  dp.persons = normalizePersons(dp.persons);
  dp.tenses  = normalizeTenses(dp.tenses);

  if (save && typeof props.methods.saveDrillPrefs === 'function') {
    props.methods.saveDrillPrefs();
  }
}

// Run immediately (initial render / rehydration)
ensureDrillDefaults({ save: false });

// ---- Auto-advance on correct ----
const autoNextTimer = Vue.ref(null);

const autoNextDelay = () => Number(props.state.drillPrefs?.autoNextDelay ?? 650);

Vue.watch(
  () => ({
    auto: !!props.state.drillPrefs?.autoNext,
    ok: props.state.drillSession?.correct === true,
    running: !!props.state.drillSession?.running,
  }),
  ({ auto, ok, running }) => {
    // Clear any pending timer whenever the state changes
    if (autoNextTimer.value) {
      clearTimeout(autoNextTimer.value);
      autoNextTimer.value = null;
    }

    // If enabled, answer is correct, and session is running, queue next question
    if (auto && ok && running && typeof props.methods.nextDrill === 'function') {
      autoNextTimer.value = setTimeout(() => {
        // Guard again right before firing (user may have stopped drill)
        if (props.state.drillPrefs?.autoNext &&
            props.state.drillSession?.correct === true &&
            props.state.drillSession?.running) {
          props.methods.nextDrill();
        }

    // A
      }, autoNextDelay()); // tweak delay to taste
    }
  },
  { deep: false }
);

Vue.onBeforeUnmount(() => {
  if (autoNextTimer.value) clearTimeout(autoNextTimer.value);
});


// If the whole drillPrefs object gets swapped (e.g., load from storage),
// re-assert defaults and normalize.
Vue.watch(
  () => props.state.drillPrefs,
  () => ensureDrillDefaults({ save: false }),
  { deep: false, immediate: false }
);

// Also normalize on array changes (covers user edits / string types coming from DOM)
Vue.watch(() => (props.state.drillPrefs?.persons || []).slice(), (arr) => {
  const norm = normalizePersons(arr);
  if (JSON.stringify(norm) !== JSON.stringify(arr)) {
    props.state.drillPrefs.persons = norm;
  }
}, { deep: false });

Vue.watch(() => (props.state.drillPrefs?.tenses || []).slice(), (arr) => {
  const norm = normalizeTenses(arr);
  if (JSON.stringify(norm) !== JSON.stringify(arr)) {
    props.state.drillPrefs.tenses = norm;
  }
}, { deep: false });

// (Optional) On first mount with verbs present, persist defaults once.
Vue.onMounted(() => {
  ensureDrillDefaults({ save: true });
});

    // 1) Start automatically on mount if verbs are present.
    Vue.onMounted(() => {
      if (hasVerbs() && !props.state.drillSession?.running) {
        props.methods.startDrill?.();
      }
    });

    // 2) Start automatically when verbs list becomes non-empty.
    Vue.watch(() => props.state.verbs?.length, (n) => {
      if ((n || 0) > 0 && !props.state.drillSession?.running) {
        props.methods.startDrill?.();
      }
    });

    // 3) Auto-refresh whenever persons/tenses or include/exclude tag selections change
    //    (covers pill clicks since they mutate includeOnlyTags/excludeTags).
    Vue.watch(
      () => ({
        persons: (props.state.drillPrefs?.persons || []).join(','),
        tenses:  (props.state.drillPrefs?.tenses  || []).join(','),
        inc:     (props.state.drillPrefs?.includeOnlyTags || []).join(','),
        exc:     (props.state.drillPrefs?.excludeTags     || []).join(',')
      }),
      () => debouncedRefresh(),
      { deep: false }
    );

    // Optional: if user toggles showEnglishTranslation we don't need to restart drills.
    // If you ever want that to rebuild prompts, add it to the watched object above.

    // Enter-to-start from settings (kept)
    const handleStartEnter = () => {
      if (!props.state.drillSession.running && hasVerbs()) {
        props.methods.startDrill?.();
      }
    };

    return { inputRef, helpRef, helpMin, scoreCls, includeCSV, excludeCSV, fullConj, handleStartEnter };
  },

  template: `
  <div>
    <details class="box" open tabindex="0" @keydown.enter.stop.prevent="handleStartEnter">
      <summary>
        <div class="summary-bar" style="display:flex; align-items:center; gap:12px;">
          <h3 style="margin:0">{{ $t('drill.settings') }}</h3>
          <button
            class="start-drills-btn small"
            :disabled="state.verbs.length===0"
            @click.stop.prevent="methods.startDrill()"
            :title="$t('drill.startTitle')"
          >▶ {{ $t('drill.startDrills') }}</button>
          <span class="dim" v-if="state.verbs.length===0">{{ $t('drill.addVerbsFirst') }}</span>
        </div>
      </summary>

      <div class="drill-grid" style="margin-top:8px">
        <label>{{ $t('drill.pronouns') }}
          <select multiple v-model="state.drillPrefs.persons">
            <option :value="0">je</option>
            <option :value="1">tu</option>
            <option :value="2">il/elle</option>
            <option :value="3">nous</option>
            <option :value="4">vous</option>
            <option :value="5">ils/elles</option>
          </select>
        </label>

        <label>{{ $t('drill.tenses') }}
          <select multiple v-model="state.drillPrefs.tenses">
            <option value="present">{{ $t('drill.tense.present') }}</option>
            <option value="passeCompose">{{ $t('drill.tense.passeCompose') }}</option>
            <option value="imparfait">{{ $t('drill.tense.imparfait') }}</option>
            <option value="plusQueParfait">{{ $t('drill.tense.plusQueParfait') }}</option>
            <option value="futur">{{ $t('drill.tense.futur') }}</option>
            <option value="conditionnelPresent">{{ $t('drill.tense.conditionnelPresent') }}</option>
            <option value="subjonctifPresent">{{ $t('drill.tense.subjonctifPresent') }}</option>
            <option value="imperatif">{{ $t('drill.tense.imperatif') }}</option>
          </select>
        </label>

        <div class="switch-row" style="grid-column:1/-1; display:flex; gap:12px; flex-wrap:wrap">
          <label class="switch">
            <input type="checkbox" v-model="state.drillPrefs.autoNext" />
            <span class="slider" aria-hidden="true"></span>
            <span class="label-text">{{ $t('drill.autoAdvance') }}</span>
          </label>

          <label class="switch">
            <input type="checkbox" v-model="state.showEnglishTranslation" />
            <span class="slider" aria-hidden="true"></span>
            <span class="label-text">{{ $t('drill.showVerbTranslation') }}</span>
          </label>
        </div>

        <!-- Include-only pills -->
        <div class="tag-pills" style="display:flex; gap:8px; flex-wrap:wrap;">
          <button
            v-for="tag in state.tagPills"
            :key="'inc-'+tag"
            type="button"
            class="pill"
            :class="{ active: state.drillPrefs.includeOnlyTags?.includes(tag) }"
            @click="methods.toggleIncludeTag(tag)">
            {{ tag }}
          </button>
          <button type="button" class="pill muted" @click="methods.clearIncludeTags()">{{ $t('drill.clear') }}</button>
        </div>

        <!-- Exclude pills -->
        <div class="tag-pills" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
          <button
            v-for="tag in state.tagPills"
            :key="'exc-'+tag"
            type="button"
            class="pill"
            :class="{ active: state.drillPrefs.excludeTags?.includes(tag) }"
            @click="methods.toggleExcludeTag(tag)">
            {{ $t('drill.excludePrefix') }} {{ tag }}
          </button>
            <button type="button" class="pill muted" @click="methods.clearExcludeTags()">{{ $t('drill.clear') }}</button>
        </div>

        <div class="row" style="grid-column:1/-1; display:flex; gap:8px; flex-wrap:wrap">
          <input
            class="fixed-input"
            v-model="includeCSV"
            :placeholder="$t('drill.includePlaceholder')"
            @keyup.enter.stop.prevent="handleStartEnter"
          />
          <input
            class="fixed-input"
            v-model="excludeCSV"
            :placeholder="$t('drill.excludePlaceholder')"
            @keyup.enter.stop.prevent="handleStartEnter"
          />
          <!-- Start button now lives in the summary (left-aligned) -->
        </div>
      </div>
    </details>

    <div v-if="state.drillSession.running && state.drillSession.question" class="box card drill-card">
      <div :class="['score-display', scoreCls]">🧠 {{ $t('drill.score') }} {{ state.drillSession.right }} / {{ state.drillSession.total }}</div>

      <div class="prompt" v-if="state.drillSession.side">
        <div class="drill-side">
          <div v-if="state.showEnglishTranslation"><strong>{{ $t('drill.en') }}</strong> {{ state.drillSession.side.english || '—' }}</div>
        </div>

        <div class="label">{{ state.drillSession.question.prompt.label }}</div>

        <input ref="inputRef"
               v-model="state.drillSession.input"
               @keyup.enter.prevent.stop="methods.checkDrill"
               :placeholder="$t('drill.inputPlaceholder')"
               class="drill-input"
               autocomplete="off"
               autocapitalize="off"
               spellcheck="false" />

        <div class="accent-buttons">
          <button v-for="char in ['à','â','ç','é','è','ê','ë','î','ï','ô','ù','û','ü','œ']"
                  :key="char"
                  type="button"
                  class="accent-btn"
                  @click="state.drillSession.input += char">
            {{ char }}
          </button>
        </div>

        <div class="controls">
          <button @click="methods.checkDrill" :title="$t('drill.keyEnter')">{{ $t('drill.check') }}</button>
          <button @click="methods.nextDrill" :title="$t('drill.keyN')">{{ $t('drill.next') }}</button>
          <button @click="methods.stopDrill" :title="$t('drill.keyEsc')">{{ $t('drill.stop') }}</button>
        </div>

        <div v-if="state.drillSession.correct === true" class="feedback correct">
          ✅ {{ $t('drill.correct') }}<span v-if="state.drillPrefs.autoNext"> {{ $t('drill.nextLoading') }}</span>
        </div>
        <div v-else-if="state.drillSession.correct === false" class="feedback wrong">
          {{ $t('drill.expected') }} <strong>{{ state.drillSession.question.answer }}</strong>
        </div>

        <div :style="{ minHeight: (helpMin || 0) + 'px' }">
          <div class="rule-help"
               ref="helpRef"
               v-if="(state.drillSession.correct === false) ||
                      (state.drillSession.correct === true && !state.drillPrefs.autoNext)">
            <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:flex-start">
              <div style="flex:1 1 280px; min-width:260px">
                <h4 style="margin:8px 0 4px">{{ $t('drill.examples') }}</h4>
                <div><strong>{{ $t('drill.fr') }}</strong> {{ state.drillSession.side.fr || '—' }}</div>
                <div><strong>{{ $t('drill.en') }}</strong> {{ state.drillSession.side.en || '—' }}</div>

                <h4 style="margin:8px 0 4px">{{ $t('drill.howToForm') }}</h4>
                <ul style="margin:0; padding-left:18px">
                  <li v-for="(ln,i) in state.drillSession.help?.lines" :key="i" v-html="ln"></li>
                </ul>
              </div>

              <div style="flex:1 1 320px; min-width:280px" v-if="fullConj?.length">
                <h4 style="margin:8px 0 4px">
                  {{ $t('drill.allPersons') }} ({{ state.drillSession.question.meta.tense }})
                </h4>

                <div class="conj-row" style="display:flex; flex-wrap:wrap; gap:12px;">
                  <div v-for="(row,i) in fullConj" :key="i"
                       class="conj-cell"
                       style="min-width:140px; padding:6px 8px; border:1px solid #ccc; border-radius:6px; background:#fafafa">
                    <div style="font-weight:600">{{ row.person }}</div>
                    <div>{{ row.value }}</div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>

    <div v-else class="box empty">
      <p>{{ $t('drill.emptyPrompt') }} <strong>{{ $t('drill.startDrillShort') }}</strong> {{ $t('drill.orPressEnter') }}</p>
    </div>
  </div>
  `
};

export default DrillPanel;

// js/components/DrillPanel.js
const DrillPanel = {
  name: 'DrillPanel',
  props: ['state','methods'],
 setup(props){
  const inputRef = Vue.ref(null);
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

  const includeCSV = Vue.computed({
    get(){
      const v = props.state.drillPrefs.includeOnlyTags;
      return Array.isArray(v) ? v.join(', ') : (v || '');
    },
    set(val){
      const arr = String(val)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      props.state.drillPrefs.includeOnlyTags = arr;
      props.methods.saveDrillPrefs();
    }
  });

  const excludeCSV = Vue.computed({
    get(){
      const v = props.state.drillPrefs.excludeTags;
      return Array.isArray(v) ? v.join(', ') : (v || '');
    },
    set(val){
      const arr = String(val)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      props.state.drillPrefs.excludeTags = arr;
      props.methods.saveDrillPrefs();
    }
  });

  return { inputRef, scoreCls, includeCSV, excludeCSV };
},

  template: `
  <div>
    <details class="box" open>
      <summary><h3 style="display:inline">Drill Settings</h3></summary>
      <div class="drill-grid" style="margin-top:8px">
        <label>Pronoms
          <select multiple v-model="state.drillPrefs.persons">
            <option :value="0">je</option>
            <option :value="1">tu</option>
            <option :value="2">il/elle</option>
            <option :value="3">nous</option>
            <option :value="4">vous</option>
            <option :value="5">ils/elles</option>
          </select>
        </label>

        <label>Tenses
          <select multiple v-model="state.drillPrefs.tenses">
            <option value="present">présent</option>
            <option value="passeCompose">passé composé</option>
            <option value="imparfait">imparfait</option>
            <option value="plusQueParfait">plus-que-parfait</option>
            <option value="futur">futur simple</option>
            <option value="conditionnelPresent">conditionnel présent</option>
            <option value="subjonctifPresent">subjonctif présent</option>
            <option value="imperatif">impératif</option>
          </select>
        </label>

        <div class="switch-row" style="grid-column:1/-1; display:flex; gap:12px; flex-wrap:wrap">
          <label class="switch">
            <input type="checkbox" v-model="state.drillPrefs.autoNext" />
            <span class="slider" aria-hidden="true"></span>
            <span class="label-text">Auto-advance on correct</span>
          </label>

          <label class="switch">
            <input type="checkbox" v-model="state.showEnglishTranslation" />
            <span class="slider" aria-hidden="true"></span>
            <span class="label-text">Show Verb Translation in English</span>
          </label>
        </div>

        <!-- Include-only pills -->
<div class="tag-pills" style="display:flex; gap:8px; flex-wrap:wrap;">
  <button
    v-for="tag in tagPills"
    :key="'inc-'+tag"
    type="button"
    class="pill"
    :class="{ active: state.drillPrefs.includeOnlyTags?.includes(tag) }"
    @click="methods.toggleIncludeTag(tag)">
    {{ tag }}
  </button>
  <button type="button" class="pill muted" @click="methods.clearIncludeTags()">Clear</button>
</div>

<!-- Exclude pills (optional second row) -->
<div class="tag-pills" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
  <button
    v-for="tag in tagPills"
    :key="'exc-'+tag"
    type="button"
    class="pill"
    :class="{ active: state.drillPrefs.excludeTags?.includes(tag) }"
    @click="methods.toggleExcludeTag(tag)">
    exclude: {{ tag }}
  </button>
  <button type="button" class="pill muted" @click="methods.clearExcludeTags()">Clear</button>
</div>


        <div class="row" style="grid-column:1/-1; display:flex; gap:8px; flex-wrap:wrap">
         <input
  class="fixed-input"
  v-model="includeCSV"
  placeholder="Include-only tags (comma-sep)"
/>
<input
  class="fixed-input"
  v-model="excludeCSV"
  placeholder="Exclude tags (comma-sep)"
/>
 <button class="start-drills-btn" @click="methods.startDrill()">▶ Start Drills</button>
          <span class="dim" v-if="state.verbs.length===0">Add verbs first (My Verbs or Seed).</span>
        </div>
      </div>
    </details>

    <div v-if="state.drillSession.running && state.drillSession.question" class="box card drill-card">
      <div :class="['score-display', scoreCls]">🧠 Score: {{ state.drillSession.right }} / {{ state.drillSession.total }}</div>

      <div class="prompt" v-if="state.drillSession.side">
        <div class="drill-side">
          <div v-if="state.showEnglishTranslation"><strong>EN:</strong> {{ state.drillSession.side.english || '—' }}</div>
        </div>

        <div class="label">{{ state.drillSession.question.prompt.label }}</div>

        <input ref="inputRef"
               v-model="state.drillSession.input"
               @keyup.enter.prevent.stop="methods.checkDrill"
               placeholder="Type it exactly (e.g., j’ai parlé ou parlé)"
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
          <button @click="methods.checkDrill" title="Enter">Check</button>
          <button @click="methods.nextDrill" title="N">Next</button>
          <button @click="methods.stopDrill" title="Esc">Stop</button>
        </div>

        <div v-if="state.drillSession.correct === true" class="feedback correct">
          ✅ Correct<span v-if="state.drillPrefs.autoNext">! Next question loading...</span>
        </div>
        <div v-else-if="state.drillSession.correct === false" class="feedback wrong">
          Expected: <strong>{{ state.drillSession.question.answer }}</strong>
        </div>


        <!-- Help wrapper reserves previous height to stop page jump -->
<div :style="{ minHeight: (helpMin || 0) + 'px' }">
  <div class="rule-help"
       ref="helpRef"
       v-if="(state.drillSession.correct === false) ||
              (state.drillSession.correct === true && !state.drillPrefs.autoNext)">
    <h4 style="margin:8px 0 4px">Examples</h4>
    <div><strong>FR:</strong> {{ state.drillSession.side.fr || '—' }}</div>
    <div><strong>EN:</strong> {{ state.drillSession.side.en || '—' }}</div>

    <h4 style="margin:8px 0 4px">How to form it</h4>
    <ul style="margin:0; padding-left:18px">
      <li v-for="(ln,i) in state.drillSession.help?.lines" :key="i" v-html="ln"></li>
    </ul>
  </div>
</div>

    </div>

    <div v-else class="box empty">
      <p>Choose persons/tenses and click <strong>Start Drill</strong>.</p>
    </div>
  </div>
  `
};

export default DrillPanel;

// js/components/PlanPanel.js
export default {
  name: "PlanPanel",
  props: ["state", "methods"],
  computed: {
    plan() {
      return this.state.plan || {};
    },
    weeklyTotalMinutes() {
      const n = Number(this.plan?.dailyMinutes ?? 0);
      return Number.isFinite(n) ? n * 7 : 0;
    },
    // string proxy for comma-separated focus list
    focusString: {
      get() {
        return this.plan?.focus ?? "";
      },
      set(v) {
        if (this.plan) this.plan.focus = v;
        this.persist();
      },
    },
  },
  methods: {
    persist() {
      if (this.methods?.savePlan) {
        // preferred: your app-level persistence
        this.methods.savePlan();
      } else {
        // fallback: localStorage keyed by plan.key (default v1)
        try {
          const k = `bap.plan.${this.plan?.key || "v1"}`;
          localStorage.setItem(k, JSON.stringify(this.plan));
        } catch (e) {
          console.warn("PlanPanel: fallback save failed", e);
        }
      }
    },
    onChange() {
      this.persist();
    },
  },
  template: `
  <section class="panel" id="panel-plan">
    <header class="panel-head"><h2>{{ $t('plan.title') }}</h2></header>

    <div class="plan-grid">
      <label>
        <span class="lbl">{{ $t('plan.goalLabel') }}</span>
        <select v-model="plan.goal" @change="onChange">
          <option>Government B</option>
          <option>Government C</option>
          <option>DELF B1</option>
          <option>DELF B2</option>
          <option>Custom</option>
        </select>
      </label>

      <label>
        <span class="lbl">{{ $t('plan.dailyMinutes') }}</span>
        <input type="number" min="10" step="5"
               v-model.number="plan.dailyMinutes"
               @change="onChange" />
        <small class="dim">{{ $t('plan.weeklyTotal') }}: {{ weeklyTotalMinutes }} {{ $t('plan.minutes') }}</small>
      </label>

      <label>
        <span class="lbl">{{ $t('plan.focus') }}</span>
        <input v-model="focusString"
               @change="onChange"
               :placeholder="$t('plan.focus')" />
      </label>
    </div>

    <h3>{{ $t('plan.weeklySchedule') }}</h3>
    <textarea class="plan-text"
              v-model="plan.weeklySchedule"
              @change="onChange"
              :placeholder="$t('plan.weeklySchedule')"></textarea>

    <h3>{{ $t('plan.notes') }}</h3>
    <textarea class="plan-text"
              v-model="plan.notes"
              @change="onChange"
              :placeholder="$t('plan.notes')"></textarea>
  </section>
  `,
};

// js/components/GrammarPanel.js
//
// Drop-in Grammar panel
// - Two datasets: relative pronouns (relpron) and verb+preposition (verbprep)
// - Uses state.grammar.{relpron, verbprep, filters:{q}, pages:{...}, pageSize}
// - Relies on methods.importGrammarCsv(evt, kind) defined in app.js
// - Styling hooks: .grammar-toolbar .g-btn .grammar-actions .grammar-table
//
export default {
  name: "GrammarPanel",
  props: ["state", "methods"],
  data() {
    return {
      mode: "relpron", // 'relpron' | 'verbprep'
    };
  },

  computed: {
    q: {
      get() {
        return this.state?.grammar?.filters?.q ?? "";
      },
      set(v) {
        if (this.state?.grammar?.filters) this.state.grammar.filters.q = v;
      },
    },

    pageSize() {
      return this.state?.grammar?.pageSize || 20;
    },

    // ---------- filtered rows ----------
    filteredRelPron() {
      const rows = Array.isArray(this.state?.grammar?.relpron)
        ? this.state.grammar.relpron
        : [];
      const q = (this.q || "").toLowerCase().trim();
      if (!q) return rows;

      return rows.filter((r) => {
        return [
          r.fr,
          r.en,
          r.meaning,
          r.notes,
          r.rule,
          r.example_fr,
          r.example_en,
        ]
          .map((x) => (x || "").toString().toLowerCase())
          .some((s) => s.includes(q));
      });
    },

    filteredVerbPrep() {
      const rows = Array.isArray(this.state?.grammar?.verbprep)
        ? this.state.grammar.verbprep
        : [];
      const q = (this.q || "").toLowerCase().trim();
      if (!q) return rows;

      return rows.filter((r) => {
        return [
          r.fr, // e.g., "se fier à"
          r.en,
          r.meaning,
          r.notes,
          r.rule,
          r.example_fr,
          r.example_en,
        ]
          .map((x) => (x || "").toString().toLowerCase())
          .some((s) => s.includes(q));
      });
    },

    // ---------- pagination ----------
    pageRelPron: {
      get() {
        return this.state?.grammar?.pages?.relpron ?? 1;
      },
      set(v) {
        if (this.state?.grammar?.pages) this.state.grammar.pages.relpron = v;
      },
    },
    pageVerbPrep: {
      get() {
        return this.state?.grammar?.pages?.verbprep ?? 1;
      },
      set(v) {
        if (this.state?.grammar?.pages) this.state.grammar.pages.verbprep = v;
      },
    },

    pagedRelPron() {
      const start = (this.pageRelPron - 1) * this.pageSize;
      return this.filteredRelPron.slice(start, start + this.pageSize);
    },
    pagedVerbPrep() {
      const start = (this.pageVerbPrep - 1) * this.pageSize;
      return this.filteredVerbPrep.slice(start, start + this.pageSize);
    },

    countRelPron() {
      return this.filteredRelPron.length;
    },
    countVerbPrep() {
      return this.filteredVerbPrep.length;
    },

    pageCountRelPron() {
      return Math.max(1, Math.ceil(this.countRelPron / this.pageSize));
    },
    pageCountVerbPrep() {
      return Math.max(1, Math.ceil(this.countVerbPrep / this.pageSize));
    },
  },

  methods: {
    setMode(m) {
      this.mode = m;
      // reset page when switching
      if (m === "relpron") this.pageRelPron = 1;
      if (m === "verbprep") this.pageVerbPrep = 1;
    },

    onImport(kind, evt) {
      if (typeof this.methods?.importGrammarCsv === "function") {
        this.methods.importGrammarCsv(evt, kind);
      }
    },

    exportCsv(kind) {
      const rows =
        kind === "relpron" ? this.filteredRelPron : this.filteredVerbPrep;

      // Build a compact CSV with common columns
      const headers = [
        "fr",
        "meaning",
        "rule",
        "notes",
        "example_fr",
        "example_en",
      ];
      const esc = (s) => {
        const v = (s ?? "").toString();
        if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
        return v;
      };
      const lines = [
        headers.join(","),
        ...rows.map((r) =>
          [
            r.fr || "",
            r.meaning || r.en || "",
            r.rule || "",
            r.notes || "",
            r.example_fr || "",
            r.example_en || "",
          ]
            .map(esc)
            .join(",")
        ),
      ];
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        (kind === "relpron" ? "relative_pronouns" : "verb_prepositions") +
        ".csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },

    // cheap clipboard helper
    copy(text) {
      try {
        navigator.clipboard?.writeText?.(text);
      } catch {}
    },

    nextPage() {
      if (this.mode === "relpron") {
        if (this.pageRelPron < this.pageCountRelPron) this.pageRelPron++;
      } else {
        if (this.pageVerbPrep < this.pageCountVerbPrep) this.pageVerbPrep++;
      }
    },
    prevPage() {
      if (this.mode === "relpron") {
        if (this.pageRelPron > 1) this.pageRelPron--;
      } else {
        if (this.pageVerbPrep > 1) this.pageVerbPrep--;
      }
    },
  },

  template: `
  <div>
    <header class="panel-head">
      <h2>Grammar</h2>
      <p class="dim" style="margin-top:4px;">
        Load CSVs for quick reference. Filter with the search box; click rows to copy FR.
      </p>
    </header>

    <!-- Toolbar -->
    <div class="grammar-toolbar">
      <button class="g-btn" :class="{active: mode==='relpron'}"
              @click="setMode('relpron')">Relative pronouns</button>
      <button class="g-btn" :class="{active: mode==='verbprep'}"
              @click="setMode('verbprep')">Verb + preposition</button>

      <span class="grammar-actions">
        <input type="search" v-model="q" placeholder="Filter…"
               aria-label="Filter grammar entries" />
        <label class="g-btn" :title="mode==='relpron' ? 'Import relative-pronoun CSV' : 'Import verb+preposition CSV'">
          Import CSV
          <input type="file" accept=".csv"
                 @change="onImport(mode, $event)"
                 style="display:none" />
        </label>
        <button class="g-btn" @click="exportCsv(mode)">Export (filtered)</button>
      </span>
    </div>

    <!-- RELATIVE PRONOUNS -->
    <div v-if="mode==='relpron'">
      <div class="dim" style="margin-bottom:6px;">
        Showing {{ pagedRelPron.length }} of {{ countRelPron }} item(s).
      </div>
      <table class="grammar-table" v-if="countRelPron">
        <thead>
          <tr>
            <th style="width:18%">FR</th>
            <th style="width:22%">Meaning</th>
            <th style="width:24%">Rule</th>
            <th style="width:36%">Example</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in pagedRelPron" :key="r._id || r.fr + r.example_fr"
              @click="copy(r.fr)" style="cursor: pointer;">
            <td>
              <strong>{{ r.fr }}</strong>
              <div class="dim" v-if="r.notes">{{ r.notes }}</div>
            </td>
            <td>{{ r.meaning || r.en || '—' }}</td>
            <td>{{ r.rule || '—' }}</td>
            <td>
              <div v-if="r.example_fr"><em>{{ r.example_fr }}</em></div>
              <div class="dim" v-if="r.example_en">{{ r.example_en }}</div>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-else class="dim" style="margin:8px 0 0;">
        No entries yet. Import a CSV with columns like
        <code>form</code>, <code>base_preposition</code>, <code>antecedent_type</code>,
        <code>meaning_short</code>, <code>notes</code>, <code>example_fr</code>, <code>example_en</code>.
      </p>

      <div style="display:flex; gap:8px; align-items:center; margin-top:10px;">
        <button class="g-btn" @click="prevPage" :disabled="pageRelPron<=1">Prev</button>
        <div class="dim">Page {{ pageRelPron }} / {{ pageCountRelPron }}</div>
        <button class="g-btn" @click="nextPage" :disabled="pageRelPron>=pageCountRelPron">Next</button>
      </div>
    </div>

    <!-- VERB + PREPOSITION -->
    <div v-else>
      <div class="dim" style="margin-bottom:6px;">
        Showing {{ pagedVerbPrep.length }} of {{ countVerbPrep }} item(s).
      </div>
      <table class="grammar-table" v-if="countVerbPrep">
        <thead>
          <tr>
            <th style="width:22%">FR (verb + prep)</th>
            <th style="width:24%">Meaning</th>
            <th style="width:22%">Rule</th>
            <th style="width:32%">Example</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in pagedVerbPrep" :key="r._id || r.fr + r.example_fr"
              @click="copy(r.fr)" style="cursor: pointer;">
            <td><strong>{{ r.fr }}</strong></td>
            <td>{{ r.meaning || r.en || '—' }}</td>
            <td>
              <div>{{ r.rule || '—' }}</div>
              <div class="dim" v-if="r.notes">{{ r.notes }}</div>
            </td>
            <td>
              <div v-if="r.example_fr"><em>{{ r.example_fr }}</em></div>
              <div class="dim" v-if="r.example_en">{{ r.example_en }}</div>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-else class="dim" style="margin:8px 0 0;">
        No entries yet. Import a CSV with columns like
        <code>verb</code>, <code>preposition</code>, <code>english_meaning</code>,
        <code>typical_complement</code>, <code>clitic_replacement</code>,
        <code>notes</code>, <code>example_fr</code>, <code>example_en</code>.
      </p>

      <div style="display:flex; gap:8px; align-items:center; margin-top:10px;">
        <button class="g-btn" @click="prevPage" :disabled="pageVerbPrep<=1">Prev</button>
        <div class="dim">Page {{ pageVerbPrep }} / {{ pageCountVerbPrep }}</div>
        <button class="g-btn" @click="nextPage" :disabled="pageVerbPrep>=pageCountVerbPrep">Next</button>
      </div>
    </div>
  </div>
  `,
};

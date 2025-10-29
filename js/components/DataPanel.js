// js/components/DataPanel.js — fully merged version with tag filter for the picker
const DataPanel = {
  name: 'DataPanel',
  props: ['state', 'methods'],
  template: `
    <div class="panel">
      <h2 style="margin-bottom:10px">Data loaders &amp; tools</h2>

      <!-- ===== Built-in JSON seeding (unchanged) ===== -->
      <div class="box" style="padding:12px">
        <h3>Vocabulary import (built-in JSON)</h3>
        <div class="actions" style="flex-wrap:wrap; margin-top:6px">
          <button @click="methods.importNotesAndSeedCards({ frToEn:true, enToFr:true })">
            Import general_vocab → Notes + FR↔EN Cards
          </button>
          <input
            class="fixed-input"
            v-model="state.notesTagFilter"
            @input="methods.loadNotesByTag ? methods.loadNotesByTag() : null"
            placeholder="Filter notes by tag"
          />
        </div>
        <p class="dim" style="margin-top:8px">
          Use this if you want to seed from the bundled JSON file.
        </p>
      </div>

      <!-- ===== CSV/TSV Upload ===== -->
      <div class="box" style="padding:12px; margin-top:12px;">
        <h3>Upload CSV/TSV (EN, FR, article)</h3>
        <p class="dim" style="margin-top:4px">
          Expected headers (case-insensitive): <code>EN</code>, <code>FR</code>, <code>article</code>. Optional: <code>tags</code>.
        </p>

        <div class="actions" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:8px;">
          <input
            type="file"
            accept=".csv,text/csv,.tsv,text/tab-separated-values"
            @change="methods.importVocabCsv"
          />
          <span class="dim" v-if="state.wordPicker.items && state.wordPicker.items.length">
            Loaded: {{ state.wordPicker.items.length }} rows
          </span>
          <button
            v-if="state.wordPicker.items && state.wordPicker.items.length"
            class="small"
            @click="methods.togglePickAll(true)"
          >
            Select all
          </button>
          <button
            v-if="state.wordPicker.items && state.wordPicker.items.length"
            class="small"
            @click="methods.togglePickAll(false)"
          >
            Clear all
          </button>
        </div>

        <!-- Parse/normalize meta -->
        <div class="dim" style="margin-top:6px;" v-if="state.csv && state.csv.headers && state.csv.headers.length">
          Detected delimiter: <code>{{ state.csv.meta?.delimiter || ',' }}</code> •
          Raw rows: {{ state.csv.meta?.total || state.csv.rows?.length || 0 }} •
          Normalized: {{ state.csv.meta?.normalized || state.wordPicker.items?.length || 0 }} •
          Headers: <code>{{ state.csv.headers.join(', ') }}</code>
        </div>

        <!-- Word Picker -->
        <div v-if="state.wordPicker.items && state.wordPicker.items.length" style="margin-top:12px;">
          <h4 style="margin-bottom:6px;">Pick words to include</h4>

          <!-- TAG FILTER UI -->
          <div style="margin-bottom:10px;">
            <input
              class="fixed-input"
              v-model="tagFilter"
              placeholder="Filter by tag (comma-sep)"
              @input="applyTagFilter"
            />
          </div>

          <div class="list" style="max-height:320px; overflow:auto; border:1px solid var(--muted); border-radius:8px; padding:8px;">
            <div
              v-for="({item, idx}) in filteredItems"
              :key="idx"
              style="display:grid; grid-template-columns:auto 1fr; gap:8px; align-items:center; padding:4px 2px;"
            >
              <input type="checkbox" v-model="state.wordPicker.selected[idx]" />
              <div>
                <div><strong>FR:</strong> {{ item.article ? (item.article + ' ') : '' }}{{ item.fr || '—' }}</div>
                <div class="dim"><strong>EN:</strong> {{ item.en || '—' }}</div>
                 <div class="dim" v-if="item.example"><strong>Ex:</strong> {{ item.example }}</div>
                <div class="dim" v-if="item.tags && item.tags.length">tags: {{ item.tags.join(', ') }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Always-visible save row -->
        <div class="row" style="display:flex; gap:8px; align-items:center; margin-top:10px; flex-wrap:wrap;">
          <input
            class="fixed-input"
            v-model="state.wordPicker.listName"
            placeholder="List name (e.g., Week 1 – Meetings)"
          />
<button
  :disabled="!state.wordPicker.items || !state.wordPicker.items.length"
  title="Upload a CSV/TSV and select words first"
  @click="methods.savePickedAsList(filteredItems.map(f => f.idx))"
>
  Save as Named Sub-list
</button>
        </div>
      </div>

      <!-- ===== Saved Lists ===== -->
      <div class="box" style="padding:12px; margin-top:12px;">
        <h3>Saved Vocab Sub-lists</h3>
        <p class="dim">These are stored locally (settings). You can load any list into the SRS deck or use it in Review.</p>
<!-- === Active List Picker === -->
<div class="row" style="display:flex; gap:8px; align-items:center; margin-top:10px; flex-wrap:wrap;">
  <label style="min-width:160px;"><strong>Active list</strong></label>
  <select v-model="state.wordPicker.activeList" class="fixed-input" style="min-width:240px;">
    <option value="">Default (built-in)</option>
    <option v-for="l in state.wordPicker.savedLists" :key="l.name" :value="l.name">
      {{ l.name }} ({{ l.count }})
    </option>
  </select>

  <!-- Apply the picked list -->
  <button class="small" @click="methods.loadListIntoReview(state.wordPicker.activeList)">
    Use in Review
  </button>
  <button class="small" @click="methods.loadListIntoSrs(state.wordPicker.activeList)">
    Load into SRS
  </button>
</div>


        <div v-if="!state.wordPicker.savedLists || !state.wordPicker.savedLists.length" class="dim" style="margin-top:6px;">
          No saved lists yet. Upload a CSV/TSV and save a list above.
        </div>

        <div v-else class="list" style="margin-top:8px;">
          <div
            v-for="l in state.wordPicker.savedLists"
            :key="l.name"
            class="list-row"
            style="display:flex; gap:10px; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--muted);"
          >
            <div>
              <strong>{{ l.name }}</strong>
              <span class="dim">• {{ l.count }} item(s)</span>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="small" @click="methods.loadListIntoSrs(l.name)">Load into SRS</button>
              <button class="small" @click="methods.loadListIntoReview(l.name)">Use in Review</button>
              <button class="small danger" @click="methods.deleteSavedList(l.name)">Delete</button>

            </div>
          </div>
        </div>
      </div>

    </div>
  `,

  // ====== Added reactive state for the filter input ======
  data() {
    return {
      tagFilter: ''
    };
  },

  // ====== Filtering logic (case-insensitive, AND across comma-separated tags) ======
  computed: {
    filteredItems() {
      const items = this.state.wordPicker.items || [];
      if (!this.tagFilter || !this.tagFilter.trim()) {
        return items.map((it, idx) => ({ item: it, idx }));
      }

      const wanted = this.tagFilter
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

      return items
        .map((it, idx) => ({ item: it, idx }))
        .filter(({ item }) => {
          const tags = (item.tags || []).map(t => String(t).toLowerCase());
          // AND logic: every wanted tag must be present on the item
          return wanted.every(t => tags.includes(t));
        });
    }
  },

  methods: {
    applyTagFilter() {
      // No-op; v-model triggers computed recompute. Kept for future expansions (debounce, persist, etc.)
    }
  }
};
export default DataPanel;

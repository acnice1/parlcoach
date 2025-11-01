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

        <!-- Word Picker (CSV preview area) -->
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

          <!-- (Your existing picker table/grid would live here, unchanged) -->
          <!-- Keep whatever you already render for filteredItems -->
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
              {{ l.displayName || l.name }} ({{ l.count }})
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

        <!-- Single, valid table (no orphan v-else) -->
        <div v-else style="margin-top:8px;">
          <table class="data-table" style="width:100%; border-collapse:collapse;">
            <thead>
  <tr>
    <th style="text-align:left;">List</th>
    <th style="text-align:left; white-space:nowrap;">Items</th>
    <th style="text-align:left; white-space:nowrap;">Actions</th>
  </tr>
</thead>

            <tbody>
              <tr v-for="l in state.wordPicker.savedLists" :key="l.name" style="border-bottom:1px solid var(--muted);">
           <td style="padding:6px 0; vertical-align:top;">
  <strong>{{ l.displayName || l.name }}</strong>
  <div v-if="(l.description || l.desc)" class="dim" style="font-size:12px; margin-top:2px;">
    {{ l.description || l.desc }}
  </div>
</td>

<td style="padding:6px 0; vertical-align:top; white-space:nowrap;">
  {{ l.count }}
</td>

<td style="padding:6px 0; vertical-align:top; white-space:nowrap;">
  <button class="small"
          @click="methods.loadListIntoSrs(l.name)"
          :title="(l.description || l.desc) || ''">
    Load into SRS
  </button>
  <button class="small"
          @click="methods.loadListIntoReview(l.name)"
          :title="(l.description || l.desc) || ''">
    Use in Review
  </button>
  <button class="small danger"
          @click="methods.deleteSavedList(l.name)">
    Delete
  </button>
</td>
   </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  `,

  data() {
    return { tagFilter: '' };
  },

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
          return wanted.every(t => tags.includes(t)); // AND logic
        });
    }
  },

  methods: {
    applyTagFilter() {}
  }
};
export default DataPanel;
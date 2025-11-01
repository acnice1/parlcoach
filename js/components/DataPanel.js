// js/components/DataPanel.js

const DataPanel = {
  name: 'DataPanel',
  props: ['state', 'methods'],
  template: `
    <div class="panel">
      <h2 style="margin-bottom:10px">Data loaders &amp; tools</h2>

      <!-- ===== Built-in JSON seeding ===== -->
      <div class="box" style="padding:12px">
        <h3>Vocabulary import (built-in JSON)</h3>
        <div class="actions" style="flex-wrap:wrap; margin-top:6px">
          <button @click="methods.importNotesAndSeedCards ? methods.importNotesAndSeedCards({ frToEn:true, enToFr:true }) : null">
            Import general_vocab → Notes + FR↔EN Cards
          </button>
          <input
            class="fixed-input"
            v-model="state.notesTagFilter"
            @input="methods.loadNotesByTag ? methods.loadNotesByTag() : null"
            placeholder="Filter notes by tag"
          />
        </div>
        <p class="dim" style="margin-top:8px">Use this if you want to seed from the bundled JSON file.</p>
      </div>

      <!-- ===== CSV/TSV Upload ===== -->
      <div class="box" style="padding:12px; margin-top:12px;">
        <h3>Upload CSV/TSV (EN, FR, article)</h3>
        <p class="dim" style="margin-top:4px">
          Expected headers (case-insensitive): <code>EN</code>, <code>FR</code>, <code>article</code>. Optional: <code>tags</code>.
        </p>

        <div class="actions" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:8px;">
          <label for="csvUpload"><strong>Choose a CSV/TSV file</strong></label>
          <input
            id="csvUpload"
            type="file"
            accept=".csv,text/csv,.tsv,text/tab-separated-values"
            @change="methods.importVocabCsv ? methods.importVocabCsv($event) : null"
          />

          <span class="dim" v-if="rowCount">Loaded: {{ rowCount }} rows</span>

          <button
            v-if="rowCount"
            class="small"
            @click="methods.togglePickAll ? methods.togglePickAll(true) : selectAllLocal(true)">
            Select all
          </button>
          <button
            v-if="rowCount"
            class="small"
            @click="methods.togglePickAll ? methods.togglePickAll(false) : selectAllLocal(false)">
            Clear all
          </button>

          <span v-if="state.csv && state.csv.parsing" aria-live="polite" class="dim">Parsing…</span>
        </div>

        <!-- Parse/normalize meta -->
        <div class="dim" style="margin-top:6px;" v-if="hasHeaders">
          Detected delimiter: <code>{{ state.csv.meta?.delimiter || ',' }}</code> •
          Raw rows: {{ state.csv.meta?.total || state.csv.rows?.length || 0 }} •
          Normalized: {{ state.csv.meta?.normalized || rowCount || 0 }} •
          Headers: <code>{{ state.csv.headers.join(', ') }}</code>
        </div>

        <!-- CSV empty/error state -->
        <p v-if="state.csv && !rowCount" class="dim" style="margin-top:6px;">
          File parsed but no rows matched the required headers (EN, FR). Check column names and try again.
        </p>

        <!-- Word Picker (CSV preview area) -->
        <div v-if="rowCount" style="margin-top:12px;">
          <h4 style="margin-bottom:6px;">Pick words to include</h4>

          <!-- TAG FILTER UI -->
          <div class="row" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
            <input
              class="fixed-input"
              v-model="tagFilter"
              placeholder="Filter by tag (comma-sep)"
              @input="goToFirstPage"
            />
            <label style="display:flex; gap:6px; align-items:center;">
              <input type="radio" value="AND" v-model="tagLogic" /> AND
            </label>
            <label style="display:flex; gap:6px; align-items:center;">
              <input type="radio" value="OR" v-model="tagLogic" /> OR
            </label>

            <button class="small" @click="toggleFilteredSelection(true)" :disabled="!filteredItems.length">
              Select filtered ({{ filteredItems.length }})
            </button>
            <button class="small" @click="toggleFilteredSelection(false)" :disabled="!filteredItems.length">
              Deselect filtered
            </button>

            <span class="dim" style="margin-left:auto;" v-if="rowCount">
              Selected: {{ selectedCount }} / {{ rowCount }}
            </span>
          </div>

          <!-- Pagination status -->
          <div class="dim" style="margin:4px 0 8px 0;" v-if="filteredTotal">
            Showing {{ rangeStart }}–{{ rangeEnd }} of {{ filteredTotal }} (filtered). Page {{ currentPage }} of {{ totalPages }}.
          </div>

          <!-- Table preview (paginated, 20 per page) -->
          <div style="overflow-x:auto;">
            <table class="data-table" style="width:100%; border-collapse:collapse; min-width:640px;">
              <caption class="dim" style="text-align:left; padding:4px 0;">Uploaded entries (filtered view; 20 per page)</caption>
              <thead>
                <tr>
                  <th scope="col" style="text-align:left; width:44px;">Pick</th>
                  <th scope="col" style="text-align:left;">FR</th>
                  <th scope="col" style="text-align:left; white-space:nowrap;">Article</th>
                  <th scope="col" style="text-align:left;">EN</th>
                  <th scope="col" style="text-align:left;">Tags</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in pageItems" :key="row.idx" style="border-bottom:1px solid var(--muted);">
                  <td style="padding:6px 0; vertical-align:top;">
                    <!-- Bind directly to the parent-selected map -->
                    <input type="checkbox" v-model="state.wordPicker.selected[row.idx]" />
                  </td>
                  <td style="padding:6px 0; vertical-align:top;">
                    {{ row.item.fr || row.item.FR || '' }}
                  </td>
                  <td style="padding:6px 0; vertical-align:top; white-space:nowrap;">
                    {{ normalizeArticle(row.item.article || row.item.Article) }}
                  </td>
                  <td style="padding:6px 0; vertical-align:top;">
                    {{ row.item.en || row.item.EN || '' }}
                  </td>
                  <td style="padding:6px 0; vertical-align:top;">
                    {{ formatTags(row.item.tags) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination controls -->
          <div class="row" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:10px;">
            <button class="small" @click="firstPage" :disabled="currentPage === 1">« First</button>
            <button class="small" @click="prevPage"  :disabled="currentPage === 1">‹ Prev</button>
            <span class="dim">Page {{ currentPage }} / {{ totalPages }}</span>
            <button class="small" @click="nextPage"  :disabled="currentPage === totalPages">Next ›</button>
            <button class="small" @click="lastPage"  :disabled="currentPage === totalPages">Last »</button>
          </div>

          <!-- Save picked as sub-list -->
          <div class="row" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:10px;">
            <input class="fixed-input" style="min-width:220px;"
                   v-model="newListName"
                   :placeholder="state.wordPicker.listName ? 'List name' : 'New sub-list name (e.g., Admin Set A)'" />
            <button class="small"
                    :disabled="!selectedCount"
                    @click="onSavePicked">
              Save picked as sub-list ({{ selectedCount }})
            </button>
          </div>
        </div>
      </div>

      <!-- ===== Saved Lists ===== -->
      <div class="box" style="padding:12px; margin-top:12px;">
        <h3>Saved Vocab Sub-lists</h3>
        <p class="dim">These are stored locally (settings). You can load any list into the SRS deck or use it in Review.</p>

        <!-- SRS maintenance -->
        <div class="row" style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
          <button class="danger"
                  @click="confirm('Delete ALL SRS cards? This cannot be undone.') && (methods.clearAllSrs ? methods.clearAllSrs() : null)"
                  title="Delete all SRS cards from the database">
            Clear SRS (delete all)
          </button>

          <button
                  @click="confirm('Reset scheduling for ALL SRS cards to Due Now?') && (methods.resetSrsScheduling ? methods.resetSrsScheduling() : null)"
                  title="Keep cards; reset due dates/ease/reps so everything is due now">
            Reset SRS scheduling
          </button>
        </div>

        <div v-if="!savedLists || !savedLists.length" class="dim" style="margin-top:6px;">
          No saved lists yet. Upload a CSV/TSV and save a list above.
        </div>

        <!-- Saved lists table -->
        <div v-else style="margin-top:8px; overflow-x:auto;">
          <table class="data-table" style="width:100%; border-collapse:collapse; min-width:520px;">
            <caption class="dim" style="text-align:left; padding:4px 0;">Saved vocabulary sub-lists (local)</caption>
            <thead>
              <tr>
                <th scope="col" style="text-align:left;">List</th>
                <th scope="col" style="text-align:left; white-space:nowrap;">Items</th>
                <th scope="col" style="text-align:left; white-space:nowrap;">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in savedLists" :key="l.name" style="border-bottom:1px solid var(--muted);">
                <td style="padding:6px 0; vertical-align:top;">
                  <strong>{{ l.displayName || l.name }}</strong>
                  <div v-if="(l.description || l.desc)" class="dim" style="font-size:12px; margin-top:2px;">
                    {{ l.description || l.desc }}
                  </div>
                </td>
                <td style="padding:6px 0; vertical-align:top; white-space:nowrap;">{{ l.count }}</td>
                <td style="padding:6px 0; vertical-align:top; white-space:nowrap;">
                  <button class="small"
                          @click="methods.loadListIntoSrs ? methods.loadListIntoSrs(l.name) : null"
                          :title="(l.description || l.desc) || ''">
                    Load into SRS
                  </button>
                  <button class="small"
                          @click="methods.loadListIntoReview ? methods.loadListIntoReview(l.name) : null"
                          :title="(l.description || l.desc) || ''">
                    Use in Review
                  </button>
                  <button class="small"
                          @click="methods.clearSrsForList ? methods.clearSrsForList(l.name) : null"
                          title="Remove only the SRS cards that came from this list">
                    Remove from SRS
                  </button>
                  <button class="small danger"
                          @click="methods.deleteSavedList ? methods.deleteSavedList(l.name) : null">
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
    return {
      // filtering
      tagFilter: '',
      tagLogic: 'AND', // AND | OR
      // naming
      newListName: '',
      // pagination
      currentPage: 1,
      pageSize: 20
    };
  },

  computed: {
    // csv meta
    hasHeaders(){
      return !!(this.state?.csv?.headers && this.state.csv.headers.length);
    },
    rowCount(){
      return (this.state?.wordPicker?.items || []).length || 0;
    },
    // saved lists
    savedLists(){
      return this.state?.wordPicker?.savedLists || [];
    },
    // selection (from parent map)
    selectedCount(){
      const sel = this.state?.wordPicker?.selected || {};
      return Object.values(sel).reduce((n, v) => n + (v ? 1 : 0), 0);
    },
    // filter
    filteredItems() {
      const items = this.state?.wordPicker?.items || [];
      const list = items.map((it, idx) => ({ item: it, idx }));
      const q = (this.tagFilter || '').trim();
      if (!q) return list;

      const wanted = q.split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
      if (!wanted.length) return list;

      return list.filter(({ item }) => {
        const tags = (item.tags || []).map(t => String(t).toLowerCase());
        if (!tags.length) return false;
        return this.tagLogic === 'AND'
          ? wanted.every(t => tags.includes(t))
          : wanted.some(t => tags.includes(t));
      });
    },
    // pagination
    filteredTotal(){ return this.filteredItems.length; },
    totalPages(){ return Math.max(1, Math.ceil(this.filteredTotal / this.pageSize)); },
    rangeStart(){ return this.filteredTotal ? (this.currentPage - 1) * this.pageSize + 1 : 0; },
    rangeEnd(){ return Math.min(this.filteredTotal, this.currentPage * this.pageSize); },
    pageItems(){
      const start = (this.currentPage - 1) * this.pageSize;
      const end   = start + this.pageSize;
      return this.filteredItems.slice(start, end);
    }
  },

  watch: {
    tagFilter(){ this.currentPage = 1; },
    tagLogic(){ this.currentPage = 1; },
    rowCount(){ this.currentPage = 1; }
  },

  methods: {
    // util
    goToFirstPage(){ this.currentPage = 1; },
    // article/tag formatting
    normalizeArticle(a){
      if (!a) return '';
      const s = String(a).trim().toLowerCase();
      if (s === 'm') return 'le';
      if (s === 'f') return 'la';
      if (s === 'mf' || s === 'm/f') return 'le/la';
      if (s === 'pl' || s === 'p' || s === 'les') return 'les';
      return a;
    },
    formatTags(tags){
      if (!tags) return '';
      if (Array.isArray(tags)) return tags.join(', ');
      return String(tags);
    },

    // selection helpers (operate on parent map)
    selectAllLocal(val){
      const items = this.state?.wordPicker?.items || [];
      const sel = {};
      items.forEach((_, i) => { sel[i] = !!val; });
      this.state.wordPicker.selected = sel;
    },
    toggleFilteredSelection(val){
      const sel = { ...(this.state?.wordPicker?.selected || {}) };
      this.filteredItems.forEach(({ idx }) => { sel[idx] = !!val; });
      this.state.wordPicker.selected = sel;
    },

    // save
    onSavePicked(){
      // If user typed a name here, mirror it to app.js state before calling the app method.
      const n = (this.newListName || '').trim();
      if (n) this.state.wordPicker.listName = n;
      if (this.methods?.savePickedAsList) {
        try { this.methods.savePickedAsList(); }
        catch(e){ console.error('[DataPanel] savePickedAsList failed', e); alert('Save failed.'); }
      }
    },

    // pagination methods
    goToPage(p){ this.currentPage = Math.min(this.totalPages, Math.max(1, p)); },
    firstPage(){ this.goToPage(1); },
    lastPage(){ this.goToPage(this.totalPages); },
    nextPage(){ this.goToPage(this.currentPage + 1); },
    prevPage(){ this.goToPage(this.currentPage - 1); }
  }
};

export default DataPanel;

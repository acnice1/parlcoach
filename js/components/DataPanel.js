// js/components/DataPanel.js
// Full rewrite with Favourites support (chips + star toggle + sorted table)

import {
  makeCsvFromItems,
  exportFilename,
  downloadText,
  viewSavedListIntoPicker
} from '../data.js';

const DataPanel = {
  name: 'DataPanel',
  props: ['state', 'methods'],

  template: `
<!-- ===== Import CSV/TSV (clean) ===== -->
<div class="box" style="padding:12px; margin-top:12px;">
  <div class="row" style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
    <button
      class="small"
      @click="$refs.csvFile.click()"
      title="Import a CSV or TSV file">
      Import CSV/TSV
    </button>

    <input
      ref="csvFile"
      id="csvUpload"
      type="file"
      accept=".csv,text/csv,.tsv,text/tab-separated-values"
      style="display:none"
      @change="methods.importVocabCsv ? methods.importVocabCsv($event) : null"
    />

    <!-- lightweight status -->
    <span class="dim" v-if="state.csv && state.csv.name">Selected: {{ state.csv.name }}</span>
    <span class="dim" v-if="rowCount">Loaded: {{ rowCount }} rows</span>
    <span class="dim" v-if="state.csv && state.csv.parsing" aria-live="polite">Parsing…</span>

    <!-- actions float to the right when there are rows -->
    <div v-if="rowCount" style="margin-left:auto; display:flex; gap:8px;">
      <button
        class="small"
        @click="methods.togglePickAll ? methods.togglePickAll(true) : selectAllLocal(true)">
        Select all
      </button>
      <button
        class="small"
        @click="methods.togglePickAll ? methods.togglePickAll(false) : selectAllLocal(false)">
        Clear all
      </button>
      <button
        class="small"
        @click="cancelLoadedView"
        title="Cancel the current loaded view (CSV or previewed list)">
        Cancel
      </button>
    </div>
  </div>

  <!-- tiny helper text, tucked underneath -->
  <div class="dim" style="font-size:12px; margin-top:6px;">
    Headers: <code>EN</code>, <code>FR</code>  (optional: <code>article, Example_FR, Example_EN, Tags</code>)
  </div>
</div>
<p v-if="state.csv?.status === 'empty'" class="dim" style="margin-top:6px;">
  File parsed but no rows matched the required headers (EN, FR). Check column names and try again.
</p>
<p v-else-if="state.csv?.status === 'badHeaders'" class="dim" style="margin-top:6px;">
  Missing required headers. Expected: EN, FR (optional: article, Example_FR, Example_EN, Tags).
</p>

        <!-- Parse/normalize meta -->
        <div class="dim" style="margin-top:6px;" v-if="hasHeaders">
          Detected delimiter: <code>{{ state.csv.meta?.delimiter || ',' }}</code> •
          Raw rows: {{ state.csv.meta?.total || state.csv.rows?.length || 0 }} •
          Normalized: {{ state.csv.meta?.normalized || rowCount || 0 }} •
          Headers: <code>{{ state.csv.headers.join(', ') }}</code>
        </div>



        <!-- Word Picker (CSV preview area) -->
        <div v-if="rowCount" style="margin-top:12px;">
          <h4 style="margin-bottom:6px;">Pick Tags to include</h4>

          <!-- TAG FILTER UI -->
          <div class="row" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
            <input
              class="fixed-input"
              v-model="tagFilter"
              placeholder="Filter by Tag"
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
            <p class="dim" style="margin-top:8px">Comma-separated ; * wildcards ok</p>
            Showing {{ rangeStart }}–{{ rangeEnd }} of {{ filteredTotal }} (filtered). Page {{ currentPage }} of {{ totalPages }}.
          </div>

          <!-- Table preview (paginated, 20 per page) -->
          <div style="overflow-x:auto;">
            <table class="data-table" style="width:100%; border-collapse:collapse; min-width:640px;">
              <caption class="dim" style="text-align:left; padding:4px 0;">Uploaded entries (filtered view; 20 per page)</caption>
              <thead>
                <tr>
                  <th scope="col" style="text-align:left; width:44px;">Pick</th>
                  <th scope="col" style="text-align:center;">FR</th>
                  <th scope="col" style="text-align:left; white-space:nowrap;">Article</th>
                  <th scope="col" style="text-align:center;">EN</th>
                  <th scope="col" style="text-align:center;">Tags</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in pageItems" :key="row.idx" style="border-bottom:1px solid var(--muted);">
                  <td style="padding:6px 0; vertical-align:top;">
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

      <!-- ===== Favourites (starred lists) ===== -->
      <div class="box" style="padding:12px; margin-top:12px;" v-if="favoriteLists.length">
        <h3 style="display:flex; align-items:center; gap:8px;">
          <span>Favourites</span>
          <span aria-hidden="true" title="Starred lists">⭐</span>
        </h3>
        <div class="dim" style="margin-top:4px;">Quick access to your starred sub-lists.</div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
          <div v-for="l in favoriteLists" :key="l.name"
               class="chip"
               style="display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid var(--muted); border-radius:999px;">
            <button class="small" title="Unstar" @click="clearFavorite(l.name)" aria-label="Unstar this list">⭐</button>
            <strong>{{ l.displayName || l.name }}</strong>
            <span class="dim">({{ l.count }})</span>
            <span style="width:8px;"></span>
            <button class="small" @click="viewSavedList(l.name)" title="Preview">View</button>
            <button class="small" @click="methods.loadListIntoReview ? methods.loadListIntoReview(l.name) : null">Review</button>
            <button class="small" @click="loadIntoSrsAndRefresh(l.name)">SRS</button>
          </div>
        </div>
      </div>

      <!-- ===== Saved Lists ===== -->
      <div class="box" style="padding:12px; margin-top:12px;">
        <h3>Saved Vocab Lists</h3>
        <p class="dim">These are stored locally (settings). You can load any list into the SRS deck or use it in Review.</p>

        <!-- SRS maintenance -->
        <div class="row" style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
          <button class="danger"
                  @click="safeConfirm('Delete ALL SRS cards? This cannot be undone.') && clearAllSrsAndRefresh()"
                  title="Delete all SRS cards from the database">
            Clear SRS (delete all)
          </button>

          <button
                  @click="safeConfirm('Reset scheduling for ALL SRS cards to Due Now?') && resetSrsSchedulingAndRefresh()"
                  title="Keep cards; reset due dates/ease/reps so everything is due now">
            Reset SRS scheduling
          </button>
        </div>

        <!-- List table -->
        <table class="data-table" style="width:100%; border-collapse:collapse; min-width:640px; margin-top:12px;">
          <thead>
            <tr>
              <th scope="col" style="text-align:center;">List</th>
              <th scope="col" style="text-align:right; white-space:nowrap;">Count</th>
              <th scope="col" style="text-align:center;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in savedListsSorted" :key="l.name" style="border-bottom:1px solid var(--muted);">
              <td style="padding:6px 0; vertical-align:top;">
                <div style="display:flex; align-items:start; gap:8px; flex-wrap:wrap;">
                  <button class="small"
                          :aria-pressed="isFavorite(l.name) ? 'true' : 'false'"
                          :title="isFavorite(l.name) ? 'Unstar favourite' : 'Star as favourite'"
                          @click="toggleFavorite(l.name)">
                    {{ isFavorite(l.name) ? '⭐' : '☆' }}
                  </button>

                  <div>
                    <strong>{{ l.displayName || l.name }}</strong>
                    <div v-if="(l.description || l.desc)" class="dim" style="font-size:12px; margin-top:2px;">
                      {{ l.description || l.desc }}
                    </div>
                  </div>
                </div>
              </td>

              <td
                style="padding:8px 16px 8px 0; vertical-align:top; white-space:nowrap; text-align:right; min-width:72px;">
                {{ l.count }}
              </td>

              <td
                style="padding:8px 0 8px 16px; vertical-align:top; white-space:nowrap;">
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <button class="small"
                          @click="viewSavedList(l.name)"
                          title="Preview this list in the table above">
                    View
                  </button>
                  <button class="small"
                          @click="methods.loadListIntoReview ? methods.loadListIntoReview(l.name) : null"
                          :title="(l.description || l.desc) || ''">
                    Use in Review
                  </button>
                  <button class="small" @click="loadIntoSrsAndRefresh(l.name)">
                    Load into SRS
                  </button>

                  <button class="small"
                          @click="clearSrsForListAndRefresh(l.name)"
                          title="Remove only the SRS cards that came from this list">
                    Remove from SRS
                  </button>
                  <button class="small"
                          @click="downloadSavedList(l.name, l.displayName || l.name)"
                          title="Download this sub-list as CSV">
                    Download
                  </button>
                  <button class="small danger"
                          @click="methods.deleteSavedList ? methods.deleteSavedList(l.name) : null">
                    Delete
                  </button>
                </div>
              </td>
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  `,

  data() {
    return {
      // filtering
      tagFilter: '',
      tagLogic: 'AND',
      // naming
      newListName: '',
      // pagination
      currentPage: 1,
      pageSize: 20,
      // srs count fallback cache
      localSrsCount: null,
    };
  },

  computed: {
    // --- CSV / picker state ---
    hasHeaders() {
      return !!(this.state?.csv?.headers && this.state.csv.headers.length);
    },
    rowCount() {
      return (this.state?.wordPicker?.items || []).length || 0;
    },

    // --- Selection count ---
    selectedCount() {
      const sel = this.state?.wordPicker?.selected || {};
      return Object.values(sel).reduce((n, v) => n + (v ? 1 : 0), 0);
    },

    // --- Tag filtering + pagination ---
    filteredItems() {
      const items = this.state?.wordPicker?.items || [];
      const list = items.map((it, idx) => ({ item: it, idx }));
      const q = (this.tagFilter || '').trim();
      if (!q) return list;

      const wanted = q.split(',').map(s => s.trim()).filter(Boolean);
      if (!wanted.length) return list;

      const patterns = wanted.map(w => this.globToRegex(w));
      return list.filter(({ item }) => {
        const tags = (item.tags || []).map(t => String(t).toLowerCase());
        if (!tags.length) return false;
        const patternHits = patterns.map(rx => tags.some(tag => rx.test(tag)));
        return this.tagLogic === 'AND' ? patternHits.every(Boolean) : patternHits.some(Boolean);
      });
    },
    filteredTotal() { return this.filteredItems.length; },
    totalPages()    { return Math.max(1, Math.ceil(this.filteredTotal / this.pageSize)); },
    rangeStart()    { return this.filteredTotal ? (this.currentPage - 1) * this.pageSize + 1 : 0; },
    rangeEnd()      { return Math.min(this.filteredTotal, this.currentPage * this.pageSize); },
    pageItems() {
      const start = (this.currentPage - 1) * this.pageSize;
      const end   = start + this.pageSize;
      return this.filteredItems.slice(start, end);
    },

    // --- Favourites: set + derived lists + sorted list for table ---
    favoriteSet() {
      const favs = this.state?.wordPicker?.favorites;
      return new Set(Array.isArray(favs) ? favs : []);
    },
    favoriteLists() {
      const lists = this.state?.wordPicker?.savedLists || [];
      const favs  = this.favoriteSet;
      return lists.filter(l => favs.has(l.name));
    },
    savedListsSorted() {
      const lists = this.state?.wordPicker?.savedLists || [];
      const favs  = this.favoriteSet;

      return [...lists].sort((a,b) => {
        const aFav = favs.has(a.name) ? 1 : 0;
        const bFav = favs.has(b.name) ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav; // favourites first
        const aLabel = (a.displayName || a.name || '').toLowerCase();
        const bLabel = (b.displayName || b.name || '').toLowerCase();
        return aLabel.localeCompare(bLabel);
      });
    },

    // --- SRS badge with fallbacks ---
    srsCount() {
      const fromFlashcards =
        this.state?.flashcards?.cards?.length ??
        this.state?.flashcards?.allCards?.length;

      const fromSrs =
        this.state?.srs?.cards?.length ??
        this.state?.srsDeck?.length ??
        this.state?.srsQueue?.length;

      const fromStats =
        this.state?.stats?.srsCount ??
        this.state?.globalStats?.srsCount ??
        this.state?.todayStats?.srsCount;

      return (
        fromFlashcards ??
        fromSrs ??
        fromStats ??
        this.localSrsCount ??
        0
      );
    },
  },

  watch: {
    tagFilter() { this.currentPage = 1; },
    tagLogic()  { this.currentPage = 1; },
    rowCount()  { this.currentPage = 1; },

    // Live updates if your app keeps SRS arrays in memory
    'state.srs.cards': { handler() { this.refreshSrsCount(); }, deep: false },
    'state.flashcards.cards': { handler() { this.refreshSrsCount(); }, deep: false },
  },

  methods: {
    // ---------- FAVOURITES ----------
    ensureFavoritesArray() {
      const wp = this.state?.wordPicker;
      if (wp && !Array.isArray(wp.favorites)) wp.favorites = [];
    },
    isFavorite(name) {
      return this.favoriteSet.has(name);
    },
    toggleFavorite(name) {
      this.ensureFavoritesArray();
      const favs = this.state.wordPicker.favorites;
      const idx = favs.indexOf(name);
      if (idx === -1) favs.push(name);
      else favs.splice(idx, 1);
    },
    clearFavorite(name) {
      this.ensureFavoritesArray();
      const favs = this.state.wordPicker.favorites;
      const idx = favs.indexOf(name);
      if (idx !== -1) favs.splice(idx, 1);
    },

    // ---------- VIEW / DOWNLOAD ----------
    async viewSavedList(name) {
      try {
        await viewSavedListIntoPicker(this.state, name, this.methods);
        // Reset local view filters/paging
        this.tagFilter = '';
        this.currentPage = 1;
      } catch (e) {
        console.error('[DataPanel] viewSavedList failed', e);
        alert(e?.message || 'View failed.');
      }
    },

    async downloadSavedList(name, displayName) {
      try {
        let items = await this.methods?.getSavedListItems?.(name);

        if (!items || !items.length) {
          const wp = this.state?.wordPicker || {};
          const dict = wp.savedDict || wp.savedMap;
          if (dict && dict[name]?.items?.length) items = dict[name].items;
          if ((!items || !items.length) && Array.isArray(wp.savedListsFull)) {
            const hit = wp.savedListsFull.find(x => x.name === name);
            if (hit?.items?.length) items = hit.items;
          }
          if ((!items || !items.length) && Array.isArray(wp.savedLists)) {
            const hit = wp.savedLists.find(x => x.name === name && Array.isArray(x.items) && x.items.length);
            if (hit) items = hit.items;
          }
        }

        if (!items || !items.length) {
          alert('Could not locate items for this list. Expose methods.getSavedListItems(name) to enable downloads.');
          return;
        }

        const csv = makeCsvFromItems(items, this.normalizeArticle);
        const fname = exportFilename((displayName || name).replace(/[^\w-]+/g, '_'));

        downloadText(fname, csv, 'text/csv');
      } catch (e) {
        console.error('[DataPanel] downloadSavedList failed', e);
        alert('Download failed.');
      }
    },

    // ---------- CSV / PICKER UTILS ----------
    cancelLoadedView() {
      // Reset the Word Picker view (does NOT delete saved lists/SRS)
      if (this.state?.wordPicker) {
        this.state.wordPicker.items = [];
        this.state.wordPicker.selected = {};
        this.state.wordPicker.listName = "";
        this.state.wordPicker.activeList = "";
      }
      // Clear CSV parse state (so the preview table disappears)
      if (this.state?.csv) this.state.csv = null;

      // Reset local filters/paging
      this.tagFilter = '';
      this.currentPage = 1;

      // (Optional) clear the file input control if present
      try {
        const el = document.getElementById('csvUpload');
        if (el) el.value = '';
      } catch {}
    },

globToRegex(glob) {
  // Lower-case, escape regex special chars, then turn * into .*
  const esc = String(glob).trim().toLowerCase()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // correct escape set
    .replace(/\*/g, '.*');                 // * -> .*
  return new RegExp(`^${esc}$`, 'i');      // correct template literal
},

    // ---------- CONFIRMATIONS ----------
    safeConfirm(msg) {
      try {
        const fn =
          (typeof window !== 'undefined' && typeof window.confirm === 'function' && window.confirm) ||
          (typeof globalThis !== 'undefined' && typeof globalThis.confirm === 'function' && globalThis.confirm);
        return fn ? fn(msg) : true; // default to true if not available (e.g., tests)
      } catch {
        return true;
      }
    },

    // ---------- FORMATTING ----------
    normalizeArticle(a) {
      if (!a) return '';
      const s = String(a).trim().toLowerCase();
      if (s === 'm') return 'le';
      if (s === 'f') return 'la';
      if (s === 'mf' || s === 'm/f') return 'le/la';
      if (s === 'pl' || s === 'p' || s === 'les') return 'les';
      return a;
    },
    formatTags(tags) {
      if (!tags) return '';
      if (Array.isArray(tags)) return tags.join(', ');
      return String(tags);
    },

    // ---------- SELECTION ----------
    selectAllLocal(val) {
      const items = this.state?.wordPicker?.items || [];
      const sel = {};
      items.forEach((_, i) => { sel[i] = !!val; });
      if (this.state?.wordPicker) this.state.wordPicker.selected = sel;
    },
    toggleFilteredSelection(val) {
      const sel = { ...(this.state?.wordPicker?.selected || {}) };
      this.filteredItems.forEach(({ idx }) => { sel[idx] = !!val; });
      if (this.state?.wordPicker) this.state.wordPicker.selected = sel;
    },

    // ---------- SAVE PICKED ----------
    onSavePicked() {
      const n = (this.newListName || '').trim();
      if (n && this.state?.wordPicker) this.state.wordPicker.listName = n;
      if (this.methods?.savePickedAsList) {
        try { this.methods.savePickedAsList(); }
        catch (e) { console.error('[DataPanel] savePickedAsList failed', e); alert('Save failed.'); }
      }
    },

    // ---------- PAGINATION ----------
    goToFirstPage() { this.currentPage = 1; },
    goToPage(p) { this.currentPage = Math.min(this.totalPages, Math.max(1, p)); },
    firstPage() { this.goToPage(1); },
    lastPage() { this.goToPage(this.totalPages); },
    nextPage() { this.goToPage(this.currentPage + 1); },
    prevPage() { this.goToPage(this.currentPage - 1); },

    // ---------- SRS HELPERS ----------
    async refreshSrsCount() {
      if (this.methods?.countSrsCards) {
        try {
          const n = await this.methods.countSrsCards();
          this.localSrsCount = Number.isFinite(n) ? n : 0;
          return;
        } catch (e) {
          console.warn('[DataPanel] countSrsCards failed; falling back', e);
        }
      }
      this.localSrsCount = this.srsCount || 0;
    },

    // Wrappers so the badge updates after changes
    async loadIntoSrsAndRefresh(name) {
      try { await this.methods?.loadListIntoSrs?.(name); }
      finally { await this.refreshSrsCount(); }
    },
    async clearAllSrsAndRefresh() {
      try { await this.methods?.clearAllSrs?.(); }
      finally { await this.refreshSrsCount(); }
    },
    async resetSrsSchedulingAndRefresh() {
      try { await this.methods?.resetSrsScheduling?.(); }
      finally { await this.refreshSrsCount(); }
    },
    async clearSrsForListAndRefresh(name) {
      try { await this.methods?.clearSrsForList?.(name); }
      finally { await this.refreshSrsCount(); }
    },
  },

  mounted() {
    this.ensureFavoritesArray(); // self-heal legacy states
    this.refreshSrsCount();
  },
};

export default DataPanel;

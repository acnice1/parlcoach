// js/components/DataPanel.js
const DataPanel = {
  name: 'DataPanel',
  props: ['state','methods'],
  template: `
    <div class="panel">
      <h2 style="margin-bottom:10px">Data loaders &amp; tools</h2>

      <!-- ===== Existing import from JSON ===== -->
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

      <!-- ===== NEW: CSV Upload (EN, FR, article) ===== -->
      <div class="box" style="padding:12px; margin-top:12px;">
        <h3>Upload CSV (EN, FR, article)</h3>
        <p class="dim" style="margin-top:4px">
          Expected headers (case-insensitive): <code>EN</code>, <code>FR</code>, <code>article</code>. Optional: <code>tags</code>.
        </p>
        <div class="actions" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:8px;">
          <input type="file" accept=".csv,text/csv" @change="methods.importVocabCsv" />
          <span class="dim" v-if="state.wordPicker.items.length">
            Loaded: {{ state.wordPicker.items.length }} rows
          </span>
          <button v-if="state.wordPicker.items.length" class="small" @click="methods.togglePickAll(true)">Select all</button>
          <button v-if="state.wordPicker.items.length" class="small" @click="methods.togglePickAll(false)">Clear all</button>
        </div>

        <!-- ===== Word Picker ===== -->
        <div v-if="state.wordPicker.items.length" style="margin-top:12px;">
          <h4 style="margin-bottom:6px;">Pick words to include</h4>
          <div class="list" style="max-height:320px; overflow:auto; border:1px solid var(--muted); border-radius:8px; padding:8px;">
            <div v-for="(it, idx) in state.wordPicker.items" :key="idx"
                 style="display:grid; grid-template-columns:auto 1fr; gap:8px; align-items:center; padding:4px 2px;">
              <input type="checkbox" v-model="state.wordPicker.selected[idx]" />
              <div>
                <div><strong>FR:</strong> {{ it.article ? (it.article + ' ') : '' }}{{ it.fr || '—' }}</div>
                <div class="dim"><strong>EN:</strong> {{ it.en || '—' }}</div>
                <div class="dim" v-if="it.tags && it.tags.length">tags: {{ it.tags.join(', ') }}</div>
              </div>
            </div>
          </div>

          <div class="row" style="display:flex; gap:8px; align-items:center; margin-top:10px; flex-wrap:wrap;">
            <input class="fixed-input" v-model="state.wordPicker.listName" placeholder="List name (e.g., Week 1 – Meetings)" />
            <button @click="methods.savePickedAsList">Save as Named Sub-list</button>
          </div>
        </div>
      </div>

      <!-- ===== Saved Lists (manage / load into SRS) ===== -->
      <div class="box" style="padding:12px; margin-top:12px;">
        <h3>Saved Vocab Sub-lists</h3>
        <p class="dim">These are stored locally (settings). You can load any list into the SRS deck.</p>
        <div v-if="!state.wordPicker.savedLists.length" class="dim" style="margin-top:6px;">
          No saved lists yet. Upload a CSV and save a list above.
        </div>
        <div v-else class="list" style="margin-top:8px;">
          <div v-for="l in state.wordPicker.savedLists" :key="l.name"
               class="list-row"
               style="display:flex; gap:10px; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--muted);">
            <div>
              <strong>{{ l.name }}</strong>
              <span class="dim">• {{ l.count }} item(s)</span>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="small" @click="methods.loadListIntoSrs(l.name)">Load into SRS</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  `
};
export default DataPanel;

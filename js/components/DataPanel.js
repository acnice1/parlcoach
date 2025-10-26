// js/components/DataPanel.js
const DataPanel = {
  name: 'DataPanel',
  props: ['state','methods'],
  template: `
    <div class="panel">
      <h2 style="margin-bottom:10px">Data loaders &amp; tools</h2>

      <div class="box" style="padding:12px">
        <h3>Vocabulary import</h3>
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
          All imports and utilities have been moved here to save space in Learn pages.
        </p>
      </div>
    </div>
  `
};
export default DataPanel;

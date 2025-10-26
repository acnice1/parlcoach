// js/components/VocabPanel.js
const VocabPanel = {
  name: 'VocabPanel',
  props: ['state','methods'],
  template: `
  <div>
    <div class="actions" style="flex-wrap:wrap">
      <button @click="methods.importNotesAndSeedCards({ frToEn:true, enToFr:true })">
        Import general_vocab → Notes + FR↔EN Cards
      </button>
      <input class="fixed-input" v-model="state.vocabTagFilter" @input="methods.reloadVocabByTag" placeholder="Filter cards by tag" />
      <input class="fixed-input" v-model="state.notesTagFilter" @input="methods.loadNotesByTag" placeholder="Filter notes by tag" />
    </div>

    <div class="add-row">
      <input v-model="state.newVocabFront" placeholder="Front (e.g., deviner)" />
      <input v-model="state.newVocabBack" placeholder="Back (e.g., to guess)" />
      <button @click="methods.addCard">Add</button>
    </div>

    <button @click="methods.reshuffleVocabDeck()" :disabled="!state.vocab.deck.length">Reshuffle</button>
    <button @click="methods.nextVocabCard()" :disabled="!state.vocab.deck.length">Next</button>

    <div class="vocab-card" v-if="methods.currentVocabCard()">
    <div class="fr">{{ methods.renderFr ? methods.renderFr(methods.currentVocabCard()) : (methods.currentVocabCard().fr) }}</div>
    <div class="en" v-if="state.showEnglishTranslation">{{ methods.currentVocabCard().en }}</div>
    </div>
    <span v-if="state.vocab.deck.length">{{ state.vocab.deckPtr + 1 }} / {{ state.vocab.deck.length }}</span>

    <div v-if="state.dueCards.length" class="card">
      <div class="front">{{ state.currentCard.front }}</div>
      <div class="back" v-if="state.showBack">{{ state.currentCard.back }}</div>
      <div class="card-actions">
        <button v-if="!state.showBack" @click="state.showBack=true">Show</button>
        <template v-else>
          <button @click="methods.rate(0)">Again</button>
          <button @click="methods.rate(3)">Hard</button>
          <button @click="methods.rate(4)">Good</button>
          <button @click="methods.rate(5)">Easy</button>
        </template>
        <span v-if="state.currentCard?.tags?.length" class="answer">tags: {{ state.currentCard.tags.join(', ') }}</span>
      </div>
      <div class="meta">
        Due: {{ state.dueCards.length }} • Total: {{ state.counts.total }} • Learned: {{ state.counts.learned }}
      </div>
    </div>
    <p v-else class="empty">No cards due. 🎉 Add more above or import from <code>general_vocab.json</code>.</p>
  </div>
  `
};
export default VocabPanel;

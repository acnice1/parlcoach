// js/components/VocabPanel.js
const VocabPanel = {
  name: 'VocabPanel',
  props: ['state','methods'],
  template: `
  <div>
    <!-- Show/Hide tags toggle -->
    <div class="row" style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
      <label class="switch">
        <input type="checkbox" v-model="state.ui.showVocabTags" aria-label="Show tags on cards" />
        <span class="slider" aria-hidden="true"></span>
        <span class="label-text">Show tags on cards</span>
      </label>
    </div>

    <!-- Collapsible Filters -->
    <details class="filters box" style="margin:12px 0;">
      <summary style="cursor:pointer;"><h3 style="display:inline">Filters</h3></summary>

      <!-- Topic pills -->
      <div style="margin-top:10px;">
        <div style="font-weight:600; margin-bottom:6px;">Topic</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          <button
            v-for="t in state.vocabPills.topic"
            :key="'vtopic-'+t"
            @click="methods.toggleVocabPill('topic', t)"
            :class="['pill', state.vocabFilters.topic.includes(t) ? 'active' : '']"
            title="Filter by topic">
            {{ t }}
          </button>
          <button v-if="state.vocabFilters.topic.length" class="pill clear" @click="methods.clearVocabPills('topic')">Clear</button>
        </div>
      </div>

      <!-- Tags pills -->
      <div style="margin-top:14px;">
        <div style="font-weight:600; margin-bottom:6px;">Tags</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          <button
            v-for="tg in state.vocabPills.tags"
            :key="'vtags-'+tg"
            @click="methods.toggleVocabPill('tags', tg)"
            :class="['pill', state.vocabFilters.tags.includes(tg) ? 'active' : '']"
            title="Filter by tag">
            {{ tg }}
          </button>
          <button v-if="state.vocabFilters.tags.length" class="pill clear" @click="methods.clearVocabPills('tags')">Clear</button>
        </div>
      </div>

      <!-- Part of Speech pills -->
      <div style="margin-top:14px;">
        <div style="font-weight:600; margin-bottom:6px;">Part of Speech</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          <button
            v-for="p in state.vocabPills.pos"
            :key="'vpos-'+p"
            @click="methods.toggleVocabPill('pos', p)"
            :class="['pill', state.vocabFilters.pos.includes(p) ? 'active' : '']"
            title="Filter by part of speech">
            {{ p }}
          </button>
          <button v-if="state.vocabFilters.pos.length" class="pill clear" @click="methods.clearVocabPills('pos')">Clear</button>
        </div>
      </div>

      <!-- All clear -->
      <div style="margin-top:12px;">
        <button class="pill clear" @click="methods.clearAllVocabPills()">Clear all</button>
      </div>
    </details>

    <!-- Quick add row -->
    <div class="add-row">
      <input v-model="state.newVocabFront" placeholder="Front (e.g., deviner)" />
      <input v-model="state.newVocabBack"  placeholder="Back (e.g., to guess)" />
      <button @click="methods.addCard">Add</button>
    </div>

    <div class="button-group">
      <button @click="methods.reshuffleVocabDeck()" :disabled="!state.vocab.deck.length">Reshuffle</button>
      <button @click="methods.nextVocabCard()"      :disabled="!state.vocab.deck.length">Next</button>
    </div>

    <div class="vocab-card" v-if="methods.currentVocabCard()">
      <div class="fr">{{ methods.renderFr ? methods.renderFr(methods.currentVocabCard()) : (methods.currentVocabCard().fr) }}</div>
      <div class="en" v-if="state.showEnglishTranslation">{{ methods.currentVocabCard().en }}</div>
      <div class="dim" v-if="state.ui.showVocabTags && methods.currentVocabCard()?.tags?.length" style="margin-top:6px;">
        tags: {{ methods.currentVocabCard().tags.join(', ') }}
      </div>
    </div>
    <span v-if="state.vocab.deck.length">{{ state.vocab.deckPtr + 1 }} / {{ state.vocab.deck.length }}</span>

    <!-- SRS due card area (unchanged behavior) -->
    <div v-if="state.dueCards.length" class="card" style="margin-top:16px;">
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
        <span v-if="state.ui.showVocabTags && state.currentCard?.tags?.length" class="answer">
          tags: {{ state.currentCard.tags.join(', ') }}
        </span>
      </div>
      <div class="meta">
        Due: {{ state.dueCards.length }} • Total: {{ state.counts.total }} • Learned: {{ state.counts.learned }}
      </div>
    </div>

    <p v-else class="empty">No cards due. 🎉 Add more above or go to the <strong>Data</strong> page to import.</p>
  </div>
  `
};
export default VocabPanel;

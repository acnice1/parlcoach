  // js/components/VocabPanel.js
const VocabPanel = {
  name: 'VocabPanel',
  props: ['state','methods'],

  computed: {
    // ...your existing exFr/exEn
        exFr() {
      const card = this.methods.currentVocabCard?.();
      const ex = card?.example;
      if (typeof ex === 'string') return ex || '';
      return ex?.fr || '';
    },
    exEn() {
      const card = this.methods.currentVocabCard?.();
      const ex = card?.example;
      if (typeof ex === 'string') return ''; // no EN if example is a plain FR string
      return ex?.en || '';
    }
  },

  methods: {
    onKeydown(e) {
      // don’t trigger while typing
      const t = e.target;
      const tag = (t?.tagName || '').toLowerCase();
      const typing = t?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
      if (typing) return;

      // only on Review mode, and only if there’s a deck
      if (this.state.vocabMode !== 'review') return;
      if (!this.state?.vocab?.deck?.length) return;

      // Space → Next; (optional) Enter/ArrowRight too
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();                 // stop page from scrolling
        this.methods.nextVocabCard();       // advance
      } else if (e.key === 'Enter' || e.code === 'ArrowRight') {
        e.preventDefault();
        this.methods.nextVocabCard();
      }
    },
  },

  mounted() {
    window.addEventListener('keydown', this.onKeydown, { passive: false });
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.onKeydown);
  },    
  template: `
    <div>

    <!-- Mode toggle -->
  <div class="row" style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
    <label class="switch">
      <input type="checkbox"
            :checked="state.vocabMode==='flashcards'"
            @change="state.vocabMode = $event.target.checked ? 'flashcards' : 'review'"
            aria-label="Switch between Review (JSON) and Flashcards (SRS)" />
      <span class="slider" aria-hidden="true"></span>
      <span class="label-text">
        {{ state.vocabMode === 'review' ? 'Mode: Review (JSON)' : 'Mode: Flashcards (SRS)' }}
      </span>
    </label>
  </div>

      <!-- Show/Hide tags toggle -->
      <div class="row" style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
        <label class="switch">
          <input type="checkbox" v-model="state.ui.showVocabTags" aria-label="Show tags on cards" />
          <span class="slider" aria-hidden="true"></span>
          <span class="label-text">Show tags on cards</span>
        </label>
      </div>
  <div v-if="state.vocabMode==='review'">
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
  </div>
  <div v-if="state.vocabMode==='review'">
    <!-- Quick add row 
    <div class="add-row">
      <input v-model="state.newVocabFront" placeholder="Front (e.g., deviner)" />
      <input v-model="state.newVocabBack"  placeholder="Back (e.g., to guess)" />
      <button @click="methods.addCard">Add</button>
    </div>
    -->

    <div class="button-group">
      <button @click="methods.reshuffleVocabDeck()" :disabled="!state.vocab.deck.length">Reshuffle</button>
      <button @click="methods.nextVocabCard()"      :disabled="!state.vocab.deck.length">Next</button>
    </div>

    <div class="vocab-card" v-if="methods.currentVocabCard()">
      <div class="fr boxy">{{ methods.renderFr ? methods.renderFr(methods.currentVocabCard()) : (methods.currentVocabCard().fr) }}</div>
      <div class="en boxy" v-if="state.showEnglishTranslation">{{ methods.currentVocabCard().en }}</div>
  <!-- TEMPLATE -->
  <div
    v-if="exFr || (state.showEnglishTranslation && exEn)"
    class="example-block"
    role="note"
    aria-label="Exemple"
  >
    <span class="ex-label">Exemple</span>

    <p v-if="exFr" class="ex-fr">« {{ exFr }} »</p>

    <p v-if="state.showEnglishTranslation && exEn" class="ex-en">
      — {{ exEn }}
    </p>
  </div>


      <div class="dim" v-if="state.ui.showVocabTags && methods.currentVocabCard()?.tags?.length" style="margin-top:6px;">
        tags: {{ methods.currentVocabCard().tags.join(', ') }}
      </div>
    </div>
    <span v-if="state.vocab.deck.length">{{ state.vocab.deckPtr + 1 }} / {{ state.vocab.deck.length }}</span>
  </div>

    <!-- Flashcards (SRS) -->
 <!-- Flashcards (SRS) – SAME CARD LAYOUT AS REVIEW -->
<div v-if="state.vocabMode==='flashcards'">
  <div class="vocab-card" v-if="state.flashcards.currentCard">
    <div class="fr boxy">
      {{ methods.renderFr
          ? methods.renderFr({
              fr: (state.flashcards.currentCard.fr || state.flashcards.currentCard.front),
              article: state.flashcards.currentCard.article
            })
          : (state.flashcards.currentCard.front) }}
    </div>

    <!-- Show EN only after “Show” (mirrors Review’s EN block & showEnglishTranslation) -->
    <div class="en boxy"
         v-if="state.flashcards.showBack && state.showEnglishTranslation">
      {{ state.flashcards.currentCard.back }}
    </div>

    <!-- Example block — same pattern as Review -->
    <div
      v-if="state.flashcards.currentCard.example"
      class="example-block"
      role="note"
      aria-label="Exemple"
    >
      <span class="ex-label">Exemple</span>

      <template v-if="typeof state.flashcards.currentCard.example==='string'">
        <p class="ex-fr">« {{ state.flashcards.currentCard.example }} »</p>
      </template>
      <template v-else>
        <p v-if="state.flashcards.currentCard.example?.fr" class="ex-fr">
          « {{ state.flashcards.currentCard.example.fr }} »
        </p>
        <p v-if="state.showEnglishTranslation && state.flashcards.currentCard.example?.en" class="ex-en">
          — {{ state.flashcards.currentCard.example.en }}
        </p>
      </template>
    </div>

    <div class="dim"
         v-if="state.ui.showVocabTags && state.flashcards.currentCard?.tags?.length"
         style="margin-top:6px;">
      tags: {{ state.flashcards.currentCard.tags.join(', ') }}
    </div>
  </div>

  <!-- Controls mimic Review’s button group, but with Show / rate -->
  <div class="button-group">
    <button v-if="!state.flashcards.showBack" @click="state.flashcards.showBack=true">Show</button>
    <template v-else>
      <button @click="methods.rate(0)">Again</button>
      <button @click="methods.rate(3)">Hard</button>
      <button @click="methods.rate(4)">Good</button>
      <button @click="methods.rate(5)">Easy</button>
    </template>
    <span class="dim" style="margin-left:8px;">
      Due: {{ state.flashcards.dueCards.length }} • Total: {{ state.flashcards.counts.total }}
    </span>
  </div>
</div>

    <p v-else class="empty">No cards due. 🎉 Add more above or go to the <strong>Data</strong> page to import.</p>
  </div>

    `
  };
  export default VocabPanel;

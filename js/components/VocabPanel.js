// js/components/VocabPanel.js
const VocabPanel = {
  name: 'VocabPanel',
  props: ['state','methods'],

  data() {
    return {
      flashKey: null,
      flashMs: 240,
      btnRefs: {},
      // Pulse/tint colors — tweak to taste
      flashColors: {
        show:  'rgba(64, 64, 64, 0.15)',   // neutral gray
        again: 'rgba(220, 38, 38, 0.25)',  // red
        hard:  'rgba(234, 179, 8, 0.25)',  // amber
        good:  'rgba(59, 130, 246, 0.25)', // blue
        easy:  'rgba(34, 197, 94, 0.25)',  // green
      }
    };
  },

  computed: {
    // ---------- REVIEW: stable current card (reactive) ----------
    currentReviewCard() {
      return this.methods.currentVocabCard?.() || null;
    },

    // ---------- REVIEW: example helpers (robust) ----------
    exFr() {
      const c = this.currentReviewCard || {};
      // Accept many shapes: exampleFr, example.fr, examples.fr, plain string, etc.
      const candidates = [
        c.exampleFr,
        c.examples?.fr,
        c.example?.fr,
        (typeof c.example === 'string' ? c.example : ''), // FR-only string
        c.exFr,
        c.frExample,
        c.example_fr
      ];
      const v = candidates.find(v => typeof v === 'string' && v.trim());
      return v ? v.trim() : '';
    },
    exEn() {
      const c = this.currentReviewCard || {};
      // Accept many shapes: exampleEn, example.en, examples.en, englishExample, etc.
      const candidates = [
        c.exampleEn,
        c.examples?.en,
        c.example?.en,
        c.englishExample,
        c.enExample,
        c.exEn,
        c.example_en
      ];
      const v = candidates.find(v => typeof v === 'string' && v.trim());
      return v ? v.trim() : '';
    },

    // ---------- SRS: safe getters ----------
    srsCard() {
      // prefer SRS currentCard; soft-fallback to Review current (visual continuity)
      return this.state?.flashcards?.currentCard || this.methods.currentVocabCard?.() || null;
    },
    srsFront() {
      const c = this.srsCard;
      return (c?.fr || c?.front || '').trim();
    },
    srsBack() {
      const c = this.srsCard;
      // back side string for SRS (shown after "Show")
      return (c?.back || c?.en || '').trim();
    },
    srsArticle() {
      const c = this.srsCard;
      return (c?.article || '').trim();
    },
    srsTags() {
      const c = this.srsCard;
      return Array.isArray(c?.tags) ? c.tags.filter(Boolean) : [];
    },
    srsExFr() {
      const c = this.srsCard;
      const ex = c?.example;
      if (!ex) return '';
      return (typeof ex === 'string') ? ex : (ex.fr || '');
    },
    srsExEn() {
      const c = this.srsCard;
      const ex = c?.example;
      if (!ex || typeof ex === 'string') return '';
      return ex.en || '';
    },
  },

  methods: {
    // style helper for the brief flash effect
    flashStyle(key) {
      if (this.flashKey !== key) return {};
      const tint = this.flashColors?.[key] || 'rgba(0,0,0,0.12)';
      return {
        transform: 'scale(0.94)',
        backgroundColor: tint,
        boxShadow: `0 0 0 4px ${tint}`,
        transition: 'transform 150ms ease, box-shadow 150ms ease, background-color 150ms ease'
      };
    },

    async flashThen(key, fn) {
      this.flashKey = key;
      await this.$nextTick();

      // Force reflow on the *actual* button so the style paints
      const el = this.btnRefs?.[key];
      if (el && el instanceof HTMLElement) { void el.offsetWidth; }
      else { void document.body.offsetHeight; }

      // Two RAFs → guarantee a paint, then wait flashMs before acting
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      setTimeout(() => {
        try { fn && fn(); } finally { this.flashKey = null; }
      }, this.flashMs);
    },

    // SRS actions with flash
    flashShow() {
      if (this.state.flashcards.showBack) return;
      this.flashThen('show', () => { this.state.flashcards.showBack = true; });
    },
    flashRate(score, key) {
      // if back is hidden, reveal first (like your keyboard handler)
      if (!this.state.flashcards.showBack) {
        this.flashThen('show', () => { this.state.flashcards.showBack = true; });
        return;
      }
      this.flashThen(key, () => this.methods.rate(score));
    },

    onKeydown(e) {
      // don’t trigger while typing
      const t = e.target;
      const tag = (t?.tagName || '').toLowerCase();
      const typing = t?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
      if (typing) return;

      // --- REVIEW shortcuts ---
      if (this.state.vocabMode === 'review') {
        if (!this.state?.vocab?.deck?.length) return;
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter' || e.code === 'ArrowRight') {
          e.preventDefault();
          this.methods.nextVocabCard();
        }
        return;
      }

      // --- FLASHCARDS (SRS) shortcuts ---
      if (this.state.vocabMode === 'flashcards') {
        const hasCard = !!this.state?.flashcards?.currentCard;
        if (!hasCard) return;

        // Show back (if hidden): Space / Enter / ArrowRight
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter' || e.code === 'ArrowRight') {
          if (!this.state.flashcards.showBack) {
            e.preventDefault();
            return this.flashShow();
          }
          return;
        }

        // Rating keys: 1 Again(0), 2 Hard(3), 3 Good(4), 4 Easy(5)
        const k = e.key, c = e.code;
        const is1 = k === '1' || c === 'Digit1' || c === 'Numpad1';
        const is2 = k === '2' || c === 'Digit2' || c === 'Numpad2';
        const is3 = k === '3' || c === 'Digit3' || c === 'Numpad3';
        const is4 = k === '4' || c === 'Digit4' || c === 'Numpad4';

        if (is1 || is2 || is3 || is4) {
          e.preventDefault();
          if (is1) return this.flashRate(0, 'again');
          if (is2) return this.flashRate(3, 'hard');
          if (is3) return this.flashRate(4, 'good');
          if (is4) return this.flashRate(5, 'easy');
        }
      }
    },
  },

  mounted() {
    // bind once so removeEventListener works reliably
    this._keyHandler = (e) => this.onKeydown(e);

    // capture on document to intercept early (Space/Arrow can be eaten by the page)
    document.addEventListener('keydown', this._keyHandler, { capture: true });

    // also listen on window for safety, and allow preventDefault
    window.addEventListener('keydown', this._keyHandler, { passive: false });
  },

  beforeUnmount() {
    document.removeEventListener('keydown', this._keyHandler, { capture: true });
    window.removeEventListener('keydown', this._keyHandler);
    this._keyHandler = null;
  },

  template: `
    <div>
      <!-- Mode toggle -->
      <div class="row" style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
        <label class="switch">
          <input
            type="checkbox"
            :checked="state.vocabMode==='flashcards'"
            @change="state.vocabMode = $event.target.checked ? 'flashcards' : 'review'"
            aria-label="Switch between Review and Flashcards (SRS)"
          />
          <span class="slider" aria-hidden="true"></span>
          <span class="label-text">
            {{ state.vocabMode === 'review' ? 'Current Mode: Review' : 'Current Mode: Flashcards (SRS)' }}
          </span>
        </label>

        <!-- Show Examples (global) -->
        <label class="switch" style="margin-left:8px">
          <input
            type="checkbox"
            :checked="!!state.ui.showExamples"
            @change="state.ui.showExamples = $event.target.checked"
            aria-label="Toggle: Show examples"
          />
          <span class="slider" aria-hidden="true"></span>
          <span class="label-text">{{ $t('toggle.showExamples') }}</span>
        </label>

        <!-- Show/Hide tags toggle -->
        <label class="switch">
          <input type="checkbox" v-model="state.ui.showVocabTags" aria-label="Show tags on cards" />
          <span class="slider" aria-hidden="true"></span>
          <span class="label-text">Show tags on cards</span>
        </label>

        <!-- Direction (SRS + tags: dir:FR_EN/dir:EN_FR) -->
        <label class="switch">
          <select
            :value="state.vocab.direction"
            @change="state.vocab.direction = $event.target.value"
            aria-label="Card direction"
            style="padding:6px 8px; border-radius:8px; background:var(--bg, #111827); color:inherit;"
            title="Filter SRS due-cards by direction"
          >
            <option value="FR_EN">FR → EN</option>
            <option value="EN_FR">EN → FR</option>
          </select>
          <span class="label-text" style="margin-left:8px;">Direction</span>
        </label>
      </div>

      <!-- ==================== REVIEW MODE ==================== -->
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

        <!-- Card (keyed so pointer changes force re-render) -->
        <div class="vocab-card" v-if="currentReviewCard" :key="'rev-'+state.vocab.deckPtr">
          <!-- FRONT (Review): respect direction -->
          <div class="fr boxy">
            <template v-if="state.vocab.direction==='FR_EN'">
              {{ methods.renderFr ? methods.renderFr(currentReviewCard) : (currentReviewCard.fr || '') }}
            </template>
            <template v-else>
              <!-- EN_FR: do NOT call renderFr; show English plainly -->
              {{ currentReviewCard.en || '' }}
            </template>
          </div>

          <!-- TRANSLATION (Review): opposite side -->
          <div class="en boxy" v-if="state.showEnglishTranslation">
            <template v-if="state.vocab.direction==='FR_EN'">
              {{ currentReviewCard.en || '' }}
            </template>
            <template v-else>
              {{ currentReviewCard.fr || '' }}
            </template>
          </div>

          <!-- Examples (Review): both shown when toggle is on -->
          <div
            v-if="state.ui.showExamples && (exFr || exEn)"
            class="example-block"
            role="note"
            aria-label="Exemple"
          >
            <span class="ex-label">Exemple</span>
            <p v-if="exFr" class="ex-fr">« {{ exFr }} »</p>
            <p v-if="exEn" class="ex-en">— {{ exEn }} </p>
          </div>

          <div class="dim" v-if="state.ui.showVocabTags && currentReviewCard?.tags?.length" style="margin-top:6px;">
            tags: {{ currentReviewCard.tags.join(', ') }}
          </div>
        </div>

        <span v-if="state.vocab.deck.length">{{ state.vocab.deckPtr + 1 }} / {{ state.vocab.deck.length }}</span>

        <!-- Controls -->
        <div class="button-group" style="margin-top:8px;">
          <button @click="methods.reshuffleVocabDeck()" :disabled="!state.vocab.deck.length">Reshuffle</button>
          <button @click="methods.nextVocabCard()"      :disabled="!state.vocab.deck.length">Next</button>
        </div>
      </div>

      <!-- ==================== FLASHCARDS (SRS) ==================== -->
      <div v-if="state.vocabMode==='flashcards'">
        <div class="vocab-card" v-if="srsCard">
          <!-- FRONT (SRS): respect direction; no renderFr on English -->
          <div class="fr boxy">
            <template v-if="state.vocab.direction==='FR_EN'">
              {{ methods.renderFr ? methods.renderFr({ fr: srsFront, article: srsArticle }) : srsFront }}
            </template>
            <template v-else>
              {{ srsFront }}
            </template>
          </div>

          <!-- English/French translation: only after Show/back (unchanged) -->
          <div class="en boxy" v-if="state.flashcards.showBack && state.showEnglishTranslation">
            {{ srsBack }}
          </div>

          <!-- Examples (SRS): direction-aware -->
<div v-if="state.ui.showExamples" class="example-block" role="note" aria-label="Exemple">
  <span class="ex-label">Exemple</span>

  <!-- If FR→EN, show FR example on the front; EN only after reveal -->
  <template v-if="state.vocab.direction==='FR_EN'">
    <p v-if="srsExFr" class="ex-fr">« {{ srsExFr }} »</p>
    <p v-if="state.flashcards.showBack && srsExEn" class="ex-en">— {{ srsExEn }}</p>
  </template>

  <!-- If EN→FR, show EN example on the front; FR only after reveal -->
  <template v-else>
    <p v-if="srsExEn" class="ex-en">— {{ srsExEn }}</p>
    <p v-if="state.flashcards.showBack && srsExFr" class="ex-fr">« {{ srsExFr }} »</p>
  </template>
</div>

          <div class="dim" v-if="state.ui.showVocabTags && srsTags.length" style="margin-top:6px;">
            tags: {{ srsTags.join(', ') }}
          </div>
        </div>

        <!-- Empty state -->
        <p v-else class="empty">No cards due. 🎉 Add more above or go to the <strong>Data</strong> page to import.</p>

        <!-- Controls mirror Review (with SRS Show/rate) -->
        <div class="button-group">
          <button
            v-if="!state.flashcards.showBack"
            @click="flashShow()"
            :style="flashStyle('show')"
            :ref="el => (btnRefs.show = el)"
          >Show</button>

          <template v-else>
            <button @click="flashRate(0, 'again')" :style="flashStyle('again')" :ref="el => (btnRefs.again = el)">Again</button>
            <button @click="flashRate(3, 'hard')"  :style="flashStyle('hard')"  :ref="el => (btnRefs.hard  = el)">Hard</button>
            <button @click="flashRate(4, 'good')"  :style="flashStyle('good')"  :ref="el => (btnRefs.good  = el)">Good</button>
            <button @click="flashRate(5, 'easy')"  :style="flashStyle('easy')"  :ref="el => (btnRefs.easy  = el)">Easy</button>
          </template>

          <span class="dim" style="margin-left:8px;">
            Due: {{ state.flashcards.dueCards.length }} • Total: {{ state.flashcards.counts.total }}
          </span>
          <div class="dim" style="margin-left:8px;">Shortcuts: 1=Again, 2=Hard, 3=Good, 4=Easy</div>
        </div>
      </div>
    </div>
  `
};

export default VocabPanel;

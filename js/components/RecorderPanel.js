// js/components/RecorderPanel.js
export default {
  name: 'RecorderPanel',
  props: ['state','methods'],
  template: /*html*/`
  <div class="recorder-panel">

    <header class="panel-head recorder-head" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <h2 style="margin:0">Record & Save</h2>

      <div class="rec-actions-bar" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
        <button :disabled="state.isRecording" @click="methods.startRecording">🎙️ Start</button>
        <button :disabled="!state.isRecording" @click="methods.stopRecording">⏹ Stop</button>

        <span class="sep" style="width:1px;height:20px;background:#ddd;"></span>

        <select v-model="state.speech.lang"
                @change="methods.setSpeechLang(state.speech.lang)"
                title="Transcription language">
          <option value="fr-FR">fr-FR</option>
          <option value="en-US">en-US</option>
          <option value="en-GB">en-GB</option>
          <option value="es-ES">es-ES</option>
          <option value="de-DE">de-DE</option>
        </select>

        <button v-if="!state.speech.isOn" @click="methods.startTranscription">📝 Start Transcribe</button>
        <button v-else @click="methods.stopTranscription">📝 Stop Transcribe</button>

        <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px">
          <input type="checkbox" v-model="state.speech.appendToQA">
          append to Answer
        </label>
      </div>
    </header>

    <!-- ===== Question Picker (Optional) ===== -->
    <details class="box qb" open style="margin-bottom:10px">
<summary class="qb-summary">
  <span class="qb-arrow" :class="{open: $el?.parentElement?.open}">▶</span>
  <strong>Pick a Question (optional)</strong>
</summary>


      <!-- Importers 
      <div class="qb-import-row">
        <label class="qb-file">
          <input type="file" accept=".json,application/json" @change="methods.importQuestionBankFromFile($event)" />
          Import JSON file
        </label>
        <button class="small" @click="state._showPaste = !state._showPaste">
          {{ state._showPaste ? 'Hide' : 'Paste' }} JSON
        </button>
        <button class="small" @click="methods.clearQuestionBank" :disabled="!state.questionBank.length">Clear</button>
        <span class="dim" v-if="!state.questionBank.length">No questions loaded yet.</span>
        <span class="dim" v-else>{{ state.questionBank.length }} loaded</span>
      </div>

      <div v-if="state._showPaste" class="qb-paste">
        <textarea v-model="state._pasteText" placeholder='Paste your JSON array here…' class="json-area"></textarea>
        <div class="modal-actions">
          <button @click="methods.importQuestionBankFromText(state._pasteText)">Load</button>
          <button class="danger" @click="state._pasteText=''">Clear</button>
          <span class="err" v-if="state._pasteErr">{{ state._pasteErr }}</span>
        </div>
      </div>
-->
      <!-- Filters + toggles -->
      <div class="qb-filters">
        <label>Category
          <select v-model="state.qFilters.category">
            <option value="">(all)</option>
            <option v-for="c in methods.qbCategories()" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>

        <label>Tag
          <select v-model="state.qFilters.tag">
            <option value="">(all)</option>
            <option v-for="t in methods.qbTags()" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>

        <label class="switch" title="Toggle visibility of sample answers in the list">
          <input type="checkbox" v-model="state.qFilters.showSample" />
          <span class="slider" aria-hidden="true"></span>
          <span class="label-text">Show sample answers in list</span>
        </label>

        <label class="switch" title="When picking a question, also insert its sample answer into the Answer field">
          <input type="checkbox" v-model="state.qFilters.insertSampleOnPick" />
          <span class="slider" aria-hidden="true"></span>
          <span class="label-text">Insert sample answer on pick</span>
        </label>
      </div>

      <!-- Results -->
      <div class="qb-grid" v-if="methods.qbFiltered().length">
        <div class="qb-item" v-for="q in methods.qbFiltered()" :key="q.id || q.prompt">
          <div class="qb-head">
            <div class="qb-cat">{{ q.category || '—' }}</div>
            <div class="qb-tags">
              <span v-for="tg in (q.tags || [])" :key="tg" class="qb-pill">{{ tg }}</span>
            </div>
          </div>

          <div class="qb-prompt">{{ q.prompt }}</div>

          <ul class="qb-followups" v-if="Array.isArray(q.followUps) && q.followUps.length">
            <li v-for="(fu,i) in q.followUps" :key="i">{{ fu }}</li>
          </ul>

          <details v-if="state.qFilters.showSample && q.sampleAnswer" class="qb-sample">
            <summary>Sample answer</summary>
            <p style="margin:6px 0 0">{{ q.sampleAnswer }}</p>
          </details>

          <div class="qb-actions">
            <button @click="methods.pickQuestion(q)">Use this</button>
          </div>
        </div>
      </div>

      <div class="empty" v-else>Nothing matches the current filters.</div>
    </details>

    <!-- ===== Q/A Inputs ===== -->
    <div class="qa" style="display:grid; gap:8px; margin-top:8px">
<!-- Bigger, wrapping Question textarea -->
<textarea
  v-model="state.newQA.q"
  placeholder="Question (EN/FR)"
  rows="5"
  class="qa-text"
  @input="methods.autosizeTextarea"
/>

<!-- Answer textarea (also auto-grows) -->
<textarea
  v-model="state.newQA.a"
  placeholder="Your answer / Notes"
  rows="6"
  class="qa-text"
  @input="methods.autosizeTextarea"
/>

      <!-- Live transcript panel -->
      <details class="box" open style="padding:8px">
        <summary>
          <strong>Live transcript</strong>
          <span v-if="state.speech.isOn" style="color:green; margin-left:6px">● listening</span>
        </summary>
        <div style="display:grid; gap:6px; margin-top:6px">
          <div><em>Interim</em>: <span style="opacity:.8">{{ state.speech.interim }}</span></div>
          <div><em>Final</em>: <span>{{ state.speech.final }}</span></div>
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <button @click="methods.clearTranscript">Clear transcript</button>
            <button
              @click="state.newQA.a = (state.newQA.a ? state.newQA.a + (state.newQA.a.endsWith(' ') ? '' : ' ') : '') + state.speech.final"
              :disabled="!state.speech.final">
              Append Final → Answer
            </button>
          </div>
        </div>
      </details>

      <button @click="methods.saveQA">Save Q/A</button>
    </div>

    <h3>My Recordings</h3>
    <div v-if="state.recordings.length===0" class="empty">No recordings yet.</div>

    <div class="recording" v-for="r in state.recordings" :key="r.id || r.name">
      <audio :src="r.url" controls></audio>

      <div class="rec-meta">
        <span>{{ r.name }}</span>
        <span class="dim">({{ (r.size/1024).toFixed(1) }} KB)</span>
      </div>

      <div v-if="r.transcript" class="rec-transcript" style="margin:6px 0; font-size:13px">
        <strong>Transcript:</strong> <span>{{ r.transcript }}</span>
      </div>

      <div v-if="r.question || r.answer" class="rec-qa" style="margin:6px 0; font-size:13px">
        <div v-if="r.question"><strong>Q:</strong> <span>{{ r.question }}</span></div>
        <div v-if="r.answer"><strong>A:</strong> <span>{{ r.answer }}</span></div>
      </div>

      <div class="rec-actions" style="display:flex; gap:12px; align-items:center; flex-wrap:wrap">
        <a :href="r.url" :download="r.name">Download</a>
        <button class="danger small" @click="methods.deleteRecording(r)">Delete</button>
      </div>
    </div>

  </div>
  `
};

// js/components/RecorderPanel.js
export default {
  name: 'RecorderPanel',
  props: ['state','methods'],
  template: `
  <div class="recorder-panel">

  <header class="panel-head recorder-head" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
  <h2 style="margin:0">Record & Save</h2>

  <!-- rename 'actions' to 'rec-actions-bar' -->
  <div class="rec-actions-bar" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
    <button :disabled="state.isRecording" @click="methods.startRecording">🎙️ Start</button>
    <button :disabled="!state.isRecording" @click="methods.stopRecording">⏹ Stop</button>

    <span class="sep" style="width:1px;height:20px;background:#ddd;"></span>


    <select v-model="state.speech.lang" 
        @change="methods.setSpeechLang(state.speech.lang)" 
        title="Transcription language">
        class="lang-select"
    > 
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


    <!-- Optional availability notice -->
    <div v-if="!state.speech.supported" class="empty" style="margin-top:6px">
    Live transcription unavailable. {{ state.speech.why }}
    </div>

    <div class="qa" style="display:grid; gap:8px; margin-top:8px">
      <input v-model="state.newQA.q" placeholder="Question (EN/FR)" />
      <textarea v-model="state.newQA.a" placeholder="Your answer / Notes"></textarea>

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

  <!-- Persisted transcript -->
  <div v-if="r.transcript" class="rec-transcript" style="margin:6px 0; font-size:13px">
    <strong>Transcript:</strong> <span>{{ r.transcript }}</span>
  </div>

  <!-- NEW: Persisted Question / Answer snapshot -->
  <div v-if="r.question || r.answer" class="rec-qa" style="margin:6px 0; font-size:13px">
    <div v-if="r.question"><strong>Q:</strong> <span>{{ r.question }}</span></div>
    <div v-if="r.answer"><strong>A:</strong> <span>{{ r.answer }}</span></div>
  </div>

<div class="rec-actions" style="display:flex; gap:12px; align-items:center; flex-wrap:wrap">
  <a :href="r.url" :download="r.name">Download</a>
  <button class="danger small" @click="methods.deleteRecording(r)">Delete</button>
</div>

</div>

  `
};

// js/components/RecorderPanel.js
export default {
  name: 'RecorderPanel',
  props: ['state','methods'],
  template: `
  <div>
    <header class="panel-head">
      <h2>Record & Save</h2>
      <div class="actions">
        <button :disabled="state.isRecording" @click="methods.startRecording">🎙️ Start</button>
        <button :disabled="!state.isRecording" @click="methods.stopRecording">⏹ Stop</button>
      </div>
    </header>

    <div class="qa">
      <input v-model="state.newQA.q" placeholder="Question (EN/FR)" />
      <textarea v-model="state.newQA.a" placeholder="Your answer / Notes"></textarea>
      <button @click="methods.saveQA">Save Q/A</button>
    </div>

    <h3>My Recordings</h3>
    <div v-if="state.recordings.length===0" class="empty">No recordings yet.</div>
    <div class="recording" v-for="r in state.recordings" :key="r.id">
      <audio :src="r.url" controls></audio>
      <div class="rec-meta">
        <span>{{ r.name }}</span>
        <span class="dim">({{ (r.size/1024).toFixed(1) }} KB)</span>
      </div>
      <div class="rec-actions">
        <a :href="r.url" :download="r.name">Download</a>
        <button class="danger small" @click="methods.deleteRecording(r)">Delete</button>
      </div>
    </div>
  </div>
  `
};

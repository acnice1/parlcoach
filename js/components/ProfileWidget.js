// js/components/ProfileWidget.js
const ProfileWidget = {
  name: 'ProfileWidget',
  props: ['state','methods'],
  setup(){
    const open = Vue.ref(false);
    const toggle = () => open.value = !open.value;
    const close = (e) => {
      if (!e || !e.target.closest('.profile-widget')) open.value = false;
    };
    // close on outside click
    Vue.onMounted(() => document.addEventListener('click', close));
    Vue.onBeforeUnmount(() => document.removeEventListener('click', close));

    const pct = Vue.computed(() => {
      const t = Number(this?.state?.globalStats?.total || 0);
      const r = Number(this?.state?.globalStats?.right || 0);
      return t ? Math.round((r / t) * 100) : 0;
    });

    return { open, toggle, pct };
  },
  template: `
  <div class="profile-widget" style="position:fixed; top:10px; right:10px; z-index:9999;">
    <button @click.stop="toggle" class="pw-btn"
      style="display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; background:#111; color:#fff; border:1px solid #333; box-shadow:0 1px 2px rgba(0,0,0,.15)">
      <span class="avatar" style="width:22px; height:22px; border-radius:50%; background:#444; display:inline-grid; place-items:center; font-size:12px;">
        {{ (state.profileName || 'You').slice(0,1).toUpperCase() }}
      </span>
      <span class="label" style="font-size:12px; opacity:.85;">Profile</span>
      <span class="sep" style="width:1px; height:16px; background:#333;"></span>
      <span class="score" style="font-size:12px;">
        {{ state.globalStats.right }} / {{ state.globalStats.total }} <span style="opacity:.7">({{ (state.globalStats.total ? Math.round((state.globalStats.right/state.globalStats.total)*100) : 0) }}%)</span>
      </span>
    </button>

    <div v-if="open" class="menu"
      style="position:absolute; right:0; margin-top:6px; min-width:240px; background:#111; color:#fff; border:1px solid #333; border-radius:12px; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,.35)">
      <div style="padding:10px 12px; border-bottom:1px solid #222; display:flex; align-items:center; gap:10px">
        <div class="avatar" style="width:28px; height:28px; border-radius:50%; background:#444; display:grid; place-items:center;">
          {{ (state.profileName || 'You').slice(0,1).toUpperCase() }}
        </div>
        <div style="display:flex; flex-direction:column;">
          <strong style="font-size:13px">{{ state.profileName || 'You' }}</strong>
          <span class="muted" style="opacity:.7; font-size:11px">Global drills counter</span>
        </div>
      </div>

      <button @click="methods.promptProfileName" style="display:block; width:100%; text-align:left; padding:10px 12px; background:none; border:none; color:#fff; font-size:13px">Edit display name…</button>
      <button @click="methods.exportGlobalStats" style="display:block; width:100%; text-align:left; padding:10px 12px; background:none; border:none; color:#fff; font-size:13px">Export global stats (JSON)</button>
      <button @click="methods.resetTodayStats" style="display:block; width:100%; text-align:left; padding:10px 12px; background:none; border:none; color:#fff; font-size:13px">Reset today’s session stats</button>
      <div style="padding:10px 12px; border-top:1px solid #222; font-size:11px; opacity:.7">
        Lifetime: {{ state.globalStats.right }} right / {{ state.globalStats.total }} total
      </div>
    </div>
  </div>
  `
};
export default ProfileWidget;

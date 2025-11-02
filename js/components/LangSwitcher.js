export default {
  name: 'LangSwitcher',
  props: ['state'],
  template: `
    <label class="switch">
      <select
        :value="state.i18n?.locale || 'en'"
        @change="state.i18n?.setLocale($event.target.value)"
        aria-label="Language"
        style="padding:4px 8px; border-radius:8px;">
        <option value="en">English</option>
        <option value="fr">Français</option>
      </select>
      <span style="margin-left:8px;">🌐</span>
    </label>
  `
};

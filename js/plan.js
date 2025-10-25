// js/plan.js
export async function saveSettings(db, state){
  await db.settings.put({ ...state.settings, translator: state.translator });
}
export async function savePlan(db, state){
  await db.plan.put(state.plan);
}

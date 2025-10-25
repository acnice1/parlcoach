// js/verbs.js
import { normalizeTags } from './utils.js';
import { COLLATED_URL } from './db.js';

function englishGlossDefault(){ return ''; }

export async function loadTop200AndNormalize(){
  const resp = await fetch(COLLATED_URL, { cache: 'no-store' });
  const json = await resp.json();
  const arr = json?.verbs || json || [];

  return arr.map(v => {
    const inf = (v.verb || '').trim();
    const conj = v.tenses || {};
    const english = v.english || englishGlossDefault(inf);
    const incomingTags = normalizeTags(v.tags);
    const tags = Array.from(new Set([...(incomingTags || []), 'top200']));
    return { infinitive: inf, english, tags, conj };
  });
}

// js/verbs.js
export async function maybeSeedVerbsFromTop200(db) {
  const count = await db.verbs.count();
  if (count > 0) return;
  let rows = [];
  try { rows = await loadTop200AndNormalize(); }
  catch (e) { console.warn('[Top200] loader crashed:', e); }
  if (rows.length) await db.verbs.bulkAdd(rows);
}

//export async function ensureSeedTaggingAndImport(db) { /* … */ }


export async function ensureSeedTaggingAndImport(db){
  const all = await db.verbs.toArray();
  let seedCount = all.filter(v => (v.tags || []).includes('top200')).length;
  if (seedCount > 0) return;

  // backfill tags for existing conj
  let modified = 0;
  for (const v of all) {
    if (v && v.conj && typeof v.conj === 'object') {
      const tags = Array.isArray(v.tags) ? v.tags.slice() : [];
      if (!tags.includes('top200')) { tags.push('top200'); await db.verbs.update(v.id, { tags }); modified++; }
    }
  }
  if (modified > 0) return;

  // merge/reimport
  const rows = await loadTop200AndNormalize();
  if (!rows.length) return;
  const byInf = new Map(all.map(v => [v.infinitive, v]));
  for (const r of rows) {
    const existing = byInf.get(r.infinitive);
    if (existing) {
      const incomingTags = Array.isArray(r.tags) ? r.tags : [];
      const tags = Array.from(new Set([...(existing.tags || []), ...incomingTags, 'top200']));
      await db.verbs.update(existing.id, { tags, conj: r.conj, english: existing.english || r.english });
    } else {
      await db.verbs.add(r);
    }
  }
}

export async function loadExternalVerbs(){
  try{
    const res = await fetch(COLLATED_URL, { cache:'no-store' });
    if(!res.ok) throw new Error(`Failed to load ${COLLATED_URL}`);
    const json = await res.json();
    const list = json?.verbs || [];
    const map = new Map();
    list.forEach(v => {
      const inf = (v.verb || '').trim();
      if (!inf) return;
      map.set(inf.normalize('NFC').toLowerCase().trim(), {
        infinitive: v.verb, english: v.english || '', examples: v.examples || null
      });
    });
    return { list, map };
  } catch(e){
    console.error(e);
    return { list: [], map: new Map() };
  }
}

export async function addVerb(db, newVerb){
  const inf = newVerb.infinitive.trim(); if (!inf) return null;
  const english = newVerb.english.trim() || '';
  const tags = (newVerb.tags||'').split(',').map(s=>s.trim()).filter(Boolean);
  const id = await db.verbs.add({ infinitive: inf, english, tags, conj: null });
  return id;
}
export async function deleteVerb(db, v){
  await db.verbs.delete(v.id);
}

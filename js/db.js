// js/db.js

export const COLLATED_URL = 'top200_french_verbs_collated.json';
export const RULES_URL = 'verb_conjugation_rules.json'; // optional help


// Fixed list of tag pills you want to show in the UI
export const TAG_PILL_OPTIONS = [
  'Top30',
  'auxiliary',
  'irregular',
  'very-common',
  'state-of-being',
  'vandertramp'
];
export const USE_TOP200_ONLY = true;

export function initDexie(){
  if (!window.Dexie) {
    alert('Dexie failed to load. Check your connection or CDN.');
    throw new Error('Dexie missing');
  }
  const db = new Dexie('parlcoach');

  // v3 (historic)
  db.version(3).stores({
    vocab: '++id,front,back,due,ease,reps,interval,last',
    qa: '++id,createdAt',
    audio: '++id,name,createdAt,size,storage,urlHint',
    verbs: '++id,infinitive,english,*tags',
    settings: 'key',
    plan: 'key',
    drill: 'key'
  });

  // v4 (add tags index + vocab_notes)
  db.version(4).stores({
    vocab: '++id,front,back,due,ease,reps,interval,last,*tags',
    qa: '++id,createdAt',
    audio: '++id,name,createdAt,size,storage,urlHint',
    verbs: '++id,infinitive,english,*tags',
    settings: 'key',
    plan: 'key',
    drill: 'key',
    vocab_notes: '++id,french,english,partOfSpeech,gender,topic,*tags'
  }).upgrade(async (tx) => {
    try {
      const table = tx.table('vocab');
      const rows = await table.toArray();
      for (const r of rows) {
        if (!Array.isArray(r.tags)) await table.update(r.id, { tags: [] });
      }
    } catch (e) {
      console.warn('v4 upgrade note:', e);
    }
  });

  db.version(5).stores({
  // your existing tables...
  // e.g. settings: 'key', plan: 'key', drill: 'key', vocab: '++id', verbs: '++id',
  recordings: '++id, name, createdAt' // meta only; audio kept in OPFS
}).upgrade(tx => {
  // no migration needed for new table; keep as a placeholder
  return;
});

  return db;
}

// OPFS helpers
export const opfs = {
  supported: !!(navigator.storage && navigator.storage.getDirectory),
  root: null,
  async ensure(){ if(!this.supported) return null; if(!this.root) this.root = await navigator.storage.getDirectory(); return this.root; },
  async dir(name){ const root = await this.ensure(); if(!root) return null; return await root.getDirectoryHandle(name, { create:true }); },
  async saveFile(path, blob){
    const [dirName, fileName] = path.split('/');
    const dir = await this.dir(dirName); if(!dir) return null;
    const fh = await dir.getFileHandle(fileName, { create:true });
    const w = await fh.createWritable(); await w.write(blob); await w.close(); return fh;
  },
  async readURL(path){
    const [d,f] = path.split('/'); const dir = await this.dir(d); if(!dir) return null;
    const fh = await dir.getFileHandle(f); const file = await fh.getFile(); return URL.createObjectURL(file);
  },
  async delete(path){ const [d,f] = path.split('/'); const dir = await this.dir(d); if(!dir) return false; await dir.removeEntry(f); return true; }
};

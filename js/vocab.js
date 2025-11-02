// js/vocab.js
import { todayISO, shuffleInPlace, normalizeStr, normalizeTags } from './utils.js';

export function computeDue(state){
  const now = Date.now();
  state.counts.total = state.allCards.length;
  state.counts.learned = state.allCards.filter(c => new Date(c.due).getTime() > now && (c.reps ?? 0) >= 2).length;
  state.dueCards = state.allCards.filter(c => new Date(c.due).getTime() <= now).sort((a,b)=>new Date(a.due)-new Date(b.due));
  state.currentCard = state.dueCards[0] || null;
  state.showBack = false;
}

export async function reloadVocabByTag(db, flash) {
  const rows = flash.vocabTagFilter
    ? await db.vocab.where('tags').equals(flash.vocabTagFilter).toArray()
    : await db.vocab.toArray();

  rows.sort((a, b) => new Date(a.due) - new Date(b.due));

  // Populate SRS-only subtree
  flash.allCards = rows;
  computeDue(flash);

  // IMPORTANT: do NOT touch any Review fields (no state.vocab.* writes here)
}


export function currentVocabCard(state) { return state.vocab.deck[state.vocab.deckPtr] || null; }

export function buildVocabDeck(state) {
  // vocab.js — fix this line
// const src = Array.isArray(state.vocab.cards) ? [.state.vocab.cards] : [];
const src = Array.isArray(state.vocab.cards) ? [...state.vocab.cards] : [];

  if (state.vocab.prefs.randomize) shuffleInPlace(src);
  state.vocab.deck = src;
  state.vocab.deckPtr = 0;       // stay pure; app.js will persist
}

export function nextVocabCard(state) {
  const n = state.vocab.deck.length;
  if (!n) return;
  if (state.vocab.prefs.withoutReplacement) {
    state.vocab.deckPtr++;
    if (state.vocab.deckPtr >= n) {
      if (state.vocab.prefs.randomize) shuffleInPlace(state.vocab.deck);
      state.vocab.deckPtr = 0;
    }
  } else {
    state.vocab.deckPtr = Math.floor(Math.random() * n);
  }
}

export function reshuffleVocabDeck(state) {
  if (!state.vocab.deck.length) return;
  shuffleInPlace(state.vocab.deck);
  state.vocab.deckPtr = 0;
}

export async function addCard(db, state){
  const front = state.newVocabFront.trim(), back = state.newVocabBack.trim();
  if (!front || !back) return;
  const now = todayISO();
  const id = await db.vocab.add({ front, back, due: now, ease: 2.5, reps: 0, interval: 0, last: now, tags: [] });
  state.allCards.push({ id, front, back, due: now, ease: 2.5, reps: 0, interval: 0, last: now, tags: [] });
  state.newVocabFront=''; state.newVocabBack=''; computeDue(state);
}

export async function deleteCard(db, id, state){
  await db.vocab.delete(id);
  state.allCards = state.allCards.filter(c=>c.id!==id);
  computeDue(state);
}

export function seedCard(front, back, tags) {
  const now = todayISO();
  return { front, back, due: now, ease: 2.5, reps: 0, interval: 0, last: now, tags: Array.isArray(tags) ? tags : [] };
}

export async function upsertVocabNote(db, entry) {
  const note = {
    french: normalizeStr(entry.french || entry.fr || entry.term || entry.word),
    english: normalizeStr(entry.english || entry.en || entry.translation),
    partOfSpeech: normalizeStr(entry.partOfSpeech || entry.pos),
    gender: normalizeStr(entry.gender || entry.g),
    topic: normalizeStr(entry.topic || entry.domain || entry.category),
    tags: normalizeTags(entry.tags || entry.labels || entry.topics),
    ipa: normalizeStr(entry.ipa || entry.IPA),
    image: normalizeStr(entry.image || entry.imageUrl || entry.img),
    audio: normalizeStr(entry.audio || entry.audioUrl),
    exampleFr: normalizeStr(entry.exampleFr || entry.example?.fr || entry.examples?.fr),
    exampleEn: normalizeStr(entry.exampleEn || entry.example?.en || entry.examples?.en),
    frequencyRank: entry.frequencyRank ?? entry.freq ?? null,
    variants: Array.isArray(entry.variants) ? entry.variants : [],
  };
  if (!note.french && !note.english) return null;

  const existing = await db.vocab_notes.where({ french: note.french, english: note.english }).first();
  if (existing) { await db.vocab_notes.update(existing.id, note); return existing.id; }
  return await db.vocab_notes.add(note);
}

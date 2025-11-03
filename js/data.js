// js/data.js

export function escapeCell(v, delim = ',') {
  let s = v == null ? '' : String(v);
  const needsQuote = s.includes('"') || s.includes('\n') || s.includes('\r') || (delim === ',' && s.includes(','));
  if (s.includes('"')) s = s.replace(/"/g, '""');
  return needsQuote ? `"${s}"` : s;
}

export function makeDelimited(rows, headers = null, delim = ',') {
  const H = headers || (rows.length ? Object.keys(rows[0]) : []);
  const lines = [H.join(delim)];
  for (const r of rows) {
    const line = H.map(h => escapeCell(r[h], delim)).join(delim);
    lines.push(line);
  }
  return lines.join('\r\n');
}

// --- Normalize one saved-list item → DataPanel picker row
export function normalizeItemForPicker(it) {
  const fr = (it?.fr ?? it?.FR ?? '').trim();
  const en = (it?.en ?? it?.EN ?? '').trim();
  const article = (it?.article ?? it?.Article ?? '').trim();
  const tags =
    Array.isArray(it?.tags)
      ? it.tags.slice()
      : (it?.tags ? String(it.tags).split(/[;,|]/).map(s => s.trim()).filter(Boolean) : []);
  return { fr, en, article, tags };
}

/**
 * Load a saved list by name and push it into the existing DataPanel picker:
 * - fills state.wordPicker.items
 * - selects all rows
 * - sets state.wordPicker.listName to the display name
 */
export async function viewSavedListIntoPicker(state, name, methods) {
  if (!state?.wordPicker) return;

  // 1) Prefer the app-provided getter
  let items = await methods?.getSavedListItems?.(name);

  // 2) Fallbacks to common local caches (mirrors Download logic)
  if (!items || !items.length) {
    const wp = state.wordPicker || {};
    const dict = wp.savedDict || wp.savedMap;
    if (dict && dict[name]?.items?.length) items = dict[name].items;

    if ((!items || !items.length) && Array.isArray(wp.savedListsFull)) {
      const hit = wp.savedListsFull.find(x => x.name === name);
      if (hit?.items?.length) items = hit.items;
    }
    if ((!items || !items.length) && Array.isArray(wp.savedLists)) {
      const hit = wp.savedLists.find(x => x.name === name && Array.isArray(x.items) && x.items.length);
      if (hit) items = hit.items;
    }
  }

  if (!items || !items.length) {
    throw new Error('Could not locate items for this list. Expose methods.getSavedListItems(name) to enable preview.');
  }

  // Normalize + push into picker model
  const rows = items.map(normalizeItemForPicker);
  state.wordPicker.items = rows;

  // Select all
  const sel = {};
  rows.forEach((_, i) => { sel[i] = true; });
  state.wordPicker.selected = sel;

  // Set list name shown in the input
  const display = (state.wordPicker.savedLists || []).find(l => l.name === name)?.displayName || name;
  state.wordPicker.listName = display;
}


export function makeCsvFromItems(items, normalizeArticle) {
  // Detect available columns
  let hasFR=false, hasEN=false, hasArticle=false, hasTags=false, hasExFR=false, hasExEN=false;

  for (const it of items) {
    if (it.FR != null || it.fr != null) hasFR = true;
    if (it.EN != null || it.en != null) hasEN = true;
    if (it.Article != null || it.article != null) hasArticle = true;
    if (it.tags != null) hasTags = true;
    if (it.Example_FR != null || it.example_fr != null || it.Example != null || it.example != null) hasExFR = true;
    if (it.Example_EN != null || it.example_en != null || it.EN_example != null) hasExEN = true;
  }

  // Build header order
  const headers = [];
  if (hasFR) headers.push('FR');
  if (hasArticle) headers.push('Article');
  if (hasEN) headers.push('EN');
  if (hasTags) headers.push('Tags');
  if (hasExFR) headers.push('Example_FR');
  if (hasExEN) headers.push('Example_EN');

  if (!headers.length) {
    // Nothing recognizable; stringify each object for inspection
    return makeDelimited(items.map(x => ({ FR: JSON.stringify(x) })), ['FR'], ',');
  }

  // Normalize rows to headers
  const norm = items.map(it => {
    const row = {};
    if (hasFR) row.FR = it.FR ?? it.fr ?? '';
    if (hasArticle) row.Article = normalizeArticle ? normalizeArticle(it.Article ?? it.article ?? '') : (it.Article ?? it.article ?? '');
    if (hasEN) row.EN = it.EN ?? it.en ?? '';
    if (hasTags) row.Tags = Array.isArray(it.tags) ? it.tags.join(', ') : (it.tags ?? '');
    if (hasExFR) row.Example_FR = it.Example_FR ?? it.example_fr ?? it.Example ?? it.example ?? '';
    if (hasExEN) row.Example_EN = it.Example_EN ?? it.example_en ?? it.EN_example ?? '';
    return row;
  });

  return makeDelimited(norm, headers, ',');
}

export function exportFilename(base = 'vocab_list') {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${base}_${stamp}.csv`;
}

// Optional: tiny DOM helper so DataPanel's method stays lean
export function downloadText(filename, text, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

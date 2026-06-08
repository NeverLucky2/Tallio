// Pure search helpers for categories. filterCategoriesByQuery powers the Manage
// screen list search; a category matches if its name or any sub name contains
// the query (case-insensitive). Empty query returns the list unchanged.
export function filterCategoriesByQuery(categories, query) {
  const list = Array.isArray(categories) ? categories : [];
  const q = (query || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter(c => {
    if ((c.name || '').toLowerCase().includes(q)) return true;
    return (c.subcategories || []).some(s => (s.name || '').toLowerCase().includes(q));
  });
}

const FLOW_ORDER = ['income', 'expense', 'savings', 'transfer'];

// Ordered picker options: per flow (FLOW_ORDER), categories A→Z, each immediately
// followed by its subs A→Z. Subs inherit the parent's icon and flow.
export function flattenForPicker(categories) {
  const list = Array.isArray(categories) ? categories : [];
  const byFlow = (c) => FLOW_ORDER.indexOf(c.flow || 'expense');
  const cats = [...list].sort((a, b) => {
    const fa = byFlow(a), fb = byFlow(b);
    if (fa !== fb) return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb);
    return (a.name || '').localeCompare(b.name || '');
  });
  const out = [];
  for (const c of cats) {
    out.push({ kind: 'category', categoryId: c.id, subId: null, name: c.name || '', path: c.name || '', flow: c.flow || 'expense', icon: c.icon });
    const subs = [...(c.subcategories || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    for (const s of subs) {
      out.push({ kind: 'sub', categoryId: c.id, subId: s.id, name: s.name || '', path: `${c.name || ''} › ${s.name || ''}`, flow: c.flow || 'expense', icon: c.icon });
    }
  }
  return out;
}

// Filter the flat options by query. Empty query → all. A category stays if its
// name matches or any of its subs match; a sub stays if its name matches or its
// parent matches (so the parent header is always present for context).
export function filterOptions(options, query) {
  const list = Array.isArray(options) ? options : [];
  const q = (query || '').trim().toLowerCase();
  if (!q) return list;
  const parentMatch = new Set();
  const hasSubMatch = new Set();
  for (const o of list) {
    if (o.kind === 'category' && o.name.toLowerCase().includes(q)) parentMatch.add(o.categoryId);
    if (o.kind === 'sub' && o.name.toLowerCase().includes(q)) hasSubMatch.add(o.categoryId);
  }
  return list.filter(o => {
    if (o.kind === 'category') return parentMatch.has(o.categoryId) || hasSubMatch.has(o.categoryId);
    return parentMatch.has(o.categoryId) || o.name.toLowerCase().includes(q);
  });
}

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

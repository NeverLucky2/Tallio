// Pure functions for the categories rule engine.
// Kept separate from the React hook so they can be tested in node and reused.

export function autoCategorize(description, categories, fallbackCategoryId) {
  if (typeof description !== 'string' || description.length === 0) {
    return fallbackCategoryId;
  }
  const upper = description.toUpperCase();
  let bestId = fallbackCategoryId;
  let bestLen = 0;
  for (const cat of categories || []) {
    for (const kw of cat.keywords || []) {
      if (typeof kw !== 'string' || kw.length === 0) continue;
      if (kw.length > bestLen && upper.includes(kw)) {
        bestLen = kw.length;
        bestId = cat.id;
      }
    }
  }
  return bestId;
}

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

// Returns the subset of items where adding `keyword` to category `targetCategoryId`
// would actually change the item's auto-categorization under longest-wins rules.
// Each entry: { billId, item }.
export function findItemsMatchingKeyword(keyword, targetCategoryId, bills, categories) {
  if (typeof keyword !== 'string' || keyword.trim().length === 0) return [];
  const kw = keyword.trim().toUpperCase();
  const out = [];
  for (const bill of bills || []) {
    for (const item of bill.items || []) {
      if (!item || typeof item.description !== 'string') continue;
      const upper = item.description.toUpperCase();
      if (!upper.includes(kw)) continue;
      // Skip if already in the target category and the new rule wouldn't change anything.
      if (item.categoryId === targetCategoryId) continue;
      // Compute current best match length for this item (across ALL categories).
      let currentBest = 0;
      for (const cat of categories) {
        for (const k of cat.keywords || []) {
          if (typeof k !== 'string' || k.length === 0) continue;
          if (k.length > currentBest && upper.includes(k)) currentBest = k.length;
        }
      }
      if (kw.length > currentBest) {
        out.push({ billId: bill.id, item });
      }
    }
  }
  return out;
}

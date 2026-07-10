// src/payeesMigration.js
import { nanoid } from 'nanoid';

// One-time storage v4 → v5 conversion: promote free-text `payee` strings on
// transactions and template payloads into id-referenced payee entities.
// Pure — takes plain arrays, returns new arrays; never mutates its inputs.
//
// Grouping is case-insensitive on the trimmed string; first-seen casing
// (transaction order, then template order) becomes the entity name. Defaults
// are seeded from history: ≥ 2 categorized transactions with one
// (categoryId, subId) pair holding a strict majority. Transfer legs carry
// payee null so they never contribute; split parents contribute their own
// (main) categoryId.
export function migrateToPayees({ transactions = [], templates = [] } = {}) {
  const byKey = new Map(); // trimmed lower-cased name → payee entity
  const ensurePayee = (raw) => {
    const name = (raw == null ? '' : String(raw)).trim();
    if (!name) return null;
    const key = name.toLowerCase();
    if (byKey.has(key)) return byKey.get(key);
    const p = { id: nanoid(8), name, defaultCategoryId: null, defaultSubcategoryId: null };
    byKey.set(key, p);
    return p;
  };

  const outTxns = transactions.map(t => {
    if (!t) return t;
    const { payee, ...rest } = t;
    const entity = ensurePayee(payee);
    return { ...rest, payeeId: entity ? entity.id : (rest.payeeId ?? null) };
  });

  const outTemplates = templates.map(tpl => {
    if (!tpl || tpl.kind !== 'transaction' || !tpl.payload || !('payee' in tpl.payload)) return tpl;
    const { payee, ...payload } = tpl.payload;
    const entity = ensurePayee(payee);
    return { ...tpl, payload: { ...payload, payeeId: entity ? entity.id : (payload.payeeId ?? null) } };
  });

  // Seed defaults: tally (categoryId, subId) pairs per payee over categorized rows.
  const tally = new Map(); // payeeId → Map<"catId|subId", count>
  for (const t of outTxns) {
    if (!t || !t.payeeId || !t.categoryId) continue;
    const pairKey = `${t.categoryId}|${t.subId || ''}`;
    const counts = tally.get(t.payeeId) || new Map();
    counts.set(pairKey, (counts.get(pairKey) || 0) + 1);
    tally.set(t.payeeId, counts);
  }
  for (const p of byKey.values()) {
    const counts = tally.get(p.id);
    if (!counts) continue;
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    if (total < 2) continue;
    let bestKey = null, bestCount = 0;
    for (const [k, n] of counts) if (n > bestCount) { bestKey = k; bestCount = n; }
    if (bestCount * 2 <= total) continue; // strict majority required
    const [categoryId, subId] = bestKey.split('|');
    p.defaultCategoryId = categoryId;
    p.defaultSubcategoryId = subId || null;
  }

  return { payees: [...byKey.values()], transactions: outTxns, templates: outTemplates };
}

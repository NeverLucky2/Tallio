// src/accountsMigration.js
import { nanoid } from 'nanoid';
import { getItemDate } from './spendingMath.js';
import { flowSign } from './accountsModel.js';

// One-time v3 → v4 conversion. Each distinct vendor name becomes one `untyped`
// account; each bill item becomes a flat transaction with a SIGNED amount
// (flowSign(category.flow) * item.amount). Pure; vendor matching is
// case-insensitive so monthly statements for the same card merge.
export function migrateToV4(bills, categories) {
  const catsById = new Map((categories || []).map(c => [c.id, c]));
  const byName = new Map();
  const accounts = [];
  const transactions = [];

  const ensureAccount = (vendor) => {
    const name = (vendor && String(vendor).trim()) || 'Unnamed';
    const key = name.toLowerCase();
    if (byName.has(key)) return byName.get(key);
    const acct = { id: nanoid(8), name, icon: '🏦', type: 'untyped', openingBalance: 0 };
    accounts.push(acct);
    byName.set(key, acct);
    return acct;
  };

  for (const bill of bills || []) {
    if (!bill || !Array.isArray(bill.items)) continue;
    const acct = ensureAccount(bill.vendor);
    for (const item of bill.items) {
      if (!item) continue;
      const amt = Number.isFinite(item.amount) ? item.amount : 0;
      const cat = catsById.get(item.categoryId);
      const flow = (cat && cat.flow) || 'expense';
      transactions.push({
        id: nanoid(8),
        accountId: acct.id,
        date: getItemDate(bill, item),
        amount: flowSign(flow) * amt,
        categoryId: item.categoryId,
        description: item.description || '',
        payee: null,
        checkNumber: null,
        transferId: null,
      });
    }
  }
  return { accounts, transactions };
}

// src/initializeFromStorage.js
import { migrateBills, migrateToV2, migrateToV3 } from './spendingMath.js';
import { migrateToV4 } from './accountsMigration.js';
import { DEFAULT_CATEGORIES, V3_SEED_CATEGORIES } from './categoriesDefaults.js';

const BILLS_KEY          = 'billtracker-bills';
const CATS_KEY           = 'billtracker-categories';
const ACCOUNTS_KEY       = 'billtracker-accounts';
const TXN_KEY            = 'billtracker-transactions';
const VERSION_KEY        = 'billtracker-schema-version';
const V1_BACKUP_KEY      = 'billtracker-pre-categories-backup';
const V2_CATS_BACKUP_KEY = 'billtracker-categories-v2-backup';
const V3_BILLS_BACKUP_KEY = 'billtracker-pre-accounts-backup';

// Returns { accounts, transactions, migrationError }.
// migrationError is null on success, or { message, recovered } on failure.
export function initializeFromStorage(storage) {
  try {
    const ver = parseInt(storage.getItem(VERSION_KEY) || '1', 10);

    // Already on v4 — load directly, no migration.
    if (ver >= 4) {
      return {
        accounts: JSON.parse(storage.getItem(ACCOUNTS_KEY) || '[]'),
        transactions: JSON.parse(storage.getItem(TXN_KEY) || '[]'),
        migrationError: null,
      };
    }

    const rawBills = storage.getItem(BILLS_KEY);
    const rawCats  = storage.getItem(CATS_KEY);
    const v1Bills = rawBills ? migrateBills(JSON.parse(rawBills)) : [];
    const existingCats = rawCats ? JSON.parse(rawCats) : null;

    // v1 → v2 backup (existing behavior).
    if (ver < 2 && rawBills && !storage.getItem(V1_BACKUP_KEY)) {
      storage.setItem(V1_BACKUP_KEY, JSON.stringify({ ts: new Date().toISOString(), bills: v1Bills }));
    }
    const { bills: v2Bills, categories: v2Cats } = migrateToV2(v1Bills, existingCats, DEFAULT_CATEGORIES);

    // v2 → v3 category backup (existing behavior).
    if (ver < 3 && rawCats && !storage.getItem(V2_CATS_BACKUP_KEY)) {
      storage.setItem(V2_CATS_BACKUP_KEY, JSON.stringify({ ts: new Date().toISOString(), categories: existingCats }));
    }
    const { bills: v3Bills, categories: v3Cats } = migrateToV3(v2Bills, v2Cats, V3_SEED_CATEGORIES);

    // Persist normalized categories (needed regardless of prior version < 4).
    storage.setItem(CATS_KEY, JSON.stringify(v3Cats));

    // v3 → v4: one-time backup of bills, then convert to accounts + transactions.
    if (rawBills && !storage.getItem(V3_BILLS_BACKUP_KEY)) {
      storage.setItem(V3_BILLS_BACKUP_KEY, JSON.stringify({ ts: new Date().toISOString(), bills: v3Bills }));
    }
    const { accounts, transactions } = migrateToV4(v3Bills, v3Cats);

    storage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    storage.setItem(TXN_KEY, JSON.stringify(transactions));
    storage.setItem(VERSION_KEY, '4');
    // Legacy bills key is retained (untouched) so the backup path stays intact.

    return { accounts, transactions, migrationError: null };
  } catch (e) {
    console.error('Migration failed:', e);
    return {
      accounts: [],
      transactions: [],
      migrationError: {
        message: 'Migration failed — please use Export from a previous version to save a copy, then reload.',
        recovered: !!storage.getItem(V3_BILLS_BACKUP_KEY) || !!storage.getItem(V1_BACKUP_KEY),
      },
    };
  }
}

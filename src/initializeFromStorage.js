import { migrateBills, migrateToV2, migrateToV3 } from './spendingMath.js';
import { DEFAULT_CATEGORIES, V3_SEED_CATEGORIES } from './categoriesDefaults.js';

const BILLS_KEY        = 'billtracker-bills';
const CATS_KEY         = 'billtracker-categories';
const VERSION_KEY      = 'billtracker-schema-version';
const V1_BACKUP_KEY    = 'billtracker-pre-categories-backup';
const V2_CATS_BACKUP_KEY = 'billtracker-categories-v2-backup';

// Returns:
//   { bills, migrationError: null }                  on success
//   { bills, migrationError: { message, recovered }} on failure
//   `recovered` is true when bills came from the backup; false when no backup existed.
export function initializeFromStorage(storage) {
  try {
    const rawBills = storage.getItem(BILLS_KEY);
    const rawCats  = storage.getItem(CATS_KEY);
    const ver      = parseInt(storage.getItem(VERSION_KEY) || '1', 10);

    const v1Bills = rawBills ? migrateBills(JSON.parse(rawBills)) : [];
    const existingCats = rawCats ? JSON.parse(rawCats) : null;

    // v1 → v2 one-time backup (existing logic).
    if (ver < 2 && rawBills && !storage.getItem(V1_BACKUP_KEY)) {
      storage.setItem(V1_BACKUP_KEY, JSON.stringify({
        ts: new Date().toISOString(),
        bills: v1Bills,
      }));
    }

    const { bills: v2Bills, categories: v2Cats } = migrateToV2(v1Bills, existingCats, DEFAULT_CATEGORIES);

    if (ver < 2) {
      storage.setItem(BILLS_KEY, JSON.stringify(v2Bills));
      storage.setItem(CATS_KEY,  JSON.stringify(v2Cats));
      storage.setItem(VERSION_KEY, '2');
    }

    // v2 → v3 one-time backup of the v2-shape categories (only when we
    // actually have v2 categories to back up — fresh installs skip this).
    if (ver < 3 && rawCats && !storage.getItem(V2_CATS_BACKUP_KEY)) {
      storage.setItem(V2_CATS_BACKUP_KEY, JSON.stringify({
        ts: new Date().toISOString(),
        categories: existingCats,
      }));
    }

    const { bills: v3Bills, categories: v3Cats } = migrateToV3(v2Bills, v2Cats, V3_SEED_CATEGORIES);

    if (ver < 3) {
      storage.setItem(BILLS_KEY, JSON.stringify(v3Bills));
      storage.setItem(CATS_KEY,  JSON.stringify(v3Cats));
      storage.setItem(VERSION_KEY, '3');
    }

    return { bills: v3Bills, migrationError: null };
  } catch (e) {
    console.error('Migration failed:', e);
    try {
      const rawBackup = storage.getItem(V1_BACKUP_KEY);
      if (rawBackup) {
        const { bills } = JSON.parse(rawBackup);
        return {
          bills: bills || [],
          migrationError: {
            message: 'Migration failed — your data was restored from backup. Please use Export to save a copy.',
            recovered: true,
          },
        };
      }
    } catch (recoveryErr) {
      console.error('Backup restore also failed:', recoveryErr);
    }
    return {
      bills: [],
      migrationError: {
        message: 'Migration failed and no backup was available. Please reload — if this persists, contact support.',
        recovered: false,
      },
    };
  }
}

import { migrateBills, migrateToV2 } from './spendingMath.js';
import { DEFAULT_CATEGORIES } from './categoriesDefaults.js';

const BILLS_KEY   = 'billtracker-bills';
const CATS_KEY    = 'billtracker-categories';
const VERSION_KEY = 'billtracker-schema-version';
const BACKUP_KEY  = 'billtracker-pre-categories-backup';

// Pure-ish initializer — takes a storage object (localStorage or any compatible mock).
// Returns:
//   { bills, migrationError: null }                  on success
//   { bills, migrationError: { message, recovered }} on failure (bills restored from backup if available; otherwise [])
//   `recovered` is true when bills came from the backup; false when no backup existed.
export function initializeFromStorage(storage) {
  try {
    const rawBills = storage.getItem(BILLS_KEY);
    const rawCats  = storage.getItem(CATS_KEY);
    const ver      = parseInt(storage.getItem(VERSION_KEY) || '1', 10);

    const v1Bills = rawBills ? migrateBills(JSON.parse(rawBills)) : [];
    const existingCats = rawCats ? JSON.parse(rawCats) : null;

    // Write a one-time backup BEFORE transforming.
    if (ver < 2 && rawBills && !storage.getItem(BACKUP_KEY)) {
      storage.setItem(BACKUP_KEY, JSON.stringify({
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

    return { bills: v2Bills, migrationError: null };
  } catch (e) {
    console.error('Migration failed:', e);
    // Recovery path: try the backup.
    try {
      const rawBackup = storage.getItem(BACKUP_KEY);
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

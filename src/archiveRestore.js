// src/archiveRestore.js
// Write a parsed archive (from parseArchive) straight into the app's storage keys
// and image store. Callers reload the page afterward so every provider re-reads
// fresh storage — no React-effect timing hazards. Framework-free + injectable.
import * as realImageStore from './imageStore.js';

export const SUPPORTED_SCHEMA_VERSION = 5;

export function assertSupportedSchema(parsed) {
  const v = parsed && parsed.data && parsed.data.schemaVersion;
  if (v == null) throw new Error('Not a valid Tallio backup: unknown format.');
  if (v > SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`This backup was made by a newer version of Tallio (format v${v}). Please update Tallio and try again.`);
  }
  return v;
}

export async function restoreArchiveToStorage(parsed, { storage = localStorage, imageStore = realImageStore } = {}) {
  assertSupportedSchema(parsed);
  const { data, appearance, images } = parsed;
  storage.setItem('tallio-accounts', JSON.stringify(data.accounts || []));
  storage.setItem('tallio-transactions', JSON.stringify(data.transactions || []));
  storage.setItem('tallio-categories', JSON.stringify(data.categories || []));
  storage.setItem('tallio-account-types', JSON.stringify(data.accountTypes || []));
  storage.setItem('tallio-templates', JSON.stringify(data.templates || []));
  storage.setItem('tallio-report-acks', JSON.stringify(data.reportAcks || { subscriptions: {}, dismissedDuplicates: [] }));
  if (appearance) storage.setItem('tallio-appearance', JSON.stringify(appearance));

  const records = (images || []).map(img => {
    const type = img.type || 'application/octet-stream';
    return {
      id: img.id, name: img.name, group: img.group, type,
      w: img.w, h: img.h, palette: img.palette, createdAt: img.createdAt,
      blob: new Blob([img.bytes], { type }),
      thumb: img.thumbBytes ? new Blob([img.thumbBytes], { type }) : undefined,
    };
  });
  await imageStore.replaceAllImages(records);
}

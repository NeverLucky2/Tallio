// src/__smoke__/importExport.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, fireEvent, waitFor } from '@testing-library/react';
import IconLibraryProvider from '../IconLibraryProvider.jsx';
import App from '../App.jsx';
import { buildArchive } from '../exportArchive.js';

vi.mock('../reloadApp.js', () => ({ reloadApp: vi.fn() }));
import { reloadApp } from '../reloadApp.js';

function renderApp() { return render(<IconLibraryProvider><App /></IconLibraryProvider>); }

describe('Restore from backup', () => {
  beforeEach(() => { localStorage.clear(); vi.spyOn(window, 'confirm').mockReturnValue(true); });

  it('imports an archive into storage and reloads', async () => {
    const { container } = renderApp();
    const bytes = buildArchive({
      accounts: [{ id: 'a1', name: 'Imported Acct' }], transactions: [],
      categories: [], accountTypes: [], reportAcks: { subscriptions: {}, dismissedDuplicates: [] },
      templates: [], images: [], appearance: null,
      schemaVersion: 5, appVersion: '1', now: new Date('2026-01-01T00:00:00Z'),
    });
    const file = new File([bytes], 'backup.tallio');
    const input = container.querySelector('input[accept=".tallio,.zip,application/zip"]');
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('tallio-accounts'))[0].name).toBe('Imported Acct');
      expect(reloadApp).toHaveBeenCalled();
    });
  });
});

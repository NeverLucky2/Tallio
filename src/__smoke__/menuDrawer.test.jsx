// src/__smoke__/menuDrawer.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, fireEvent, within, cleanup } from '@testing-library/react';
import IconLibraryProvider from '../IconLibraryProvider.jsx';
import App from '../App.jsx';

vi.mock('../reloadApp.js', () => ({ reloadApp: vi.fn() }));

function renderApp() { return render(<IconLibraryProvider><App /></IconLibraryProvider>); }

describe('Menu drawer', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => cleanup());

  it('opens the drawer with grouped actions and no emoji rows', async () => {
    const { getByLabelText, findByRole } = renderApp();
    fireEvent.click(getByLabelText('Account menu & settings'));
    const dialog = await findByRole('dialog', { name: 'Account menu' });
    const q = within(dialog);
    expect(q.getByText('Personalize')).toBeTruthy();
    expect(q.getByText('Backups')).toBeTruthy();
    expect(q.getByText('Appearance')).toBeTruthy();
    expect(q.getByText('Settings')).toBeTruthy();
    expect(q.getByText('Download a backup')).toBeTruthy();
    expect(q.getByText('Restore from backup…')).toBeTruthy();
    expect(q.queryByText('Export')).toBeNull();
    expect(q.queryByText('Budget file')).toBeNull(); // jsdom has no File System Access API
  });

  it('Settings row opens the settings dialog', async () => {
    const { getByLabelText, findByRole, findByText } = renderApp();
    fireEvent.click(getByLabelText('Account menu & settings'));
    const dialog = await findByRole('dialog', { name: 'Account menu' });
    fireEvent.click(within(dialog).getByText('Settings'));
    expect(await findByText('Display size')).toBeTruthy();
  });
});

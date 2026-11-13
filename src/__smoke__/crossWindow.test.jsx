// src/__smoke__/crossWindow.test.jsx
// Another Tallio window saving main data must make this window reload (so it never
// overwrites that change with its stale copy), and the fresh page says why.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, cleanup, act } from '@testing-library/react';
import IconLibraryProvider from '../IconLibraryProvider.jsx';
import App from '../App.jsx';

vi.mock('../reloadApp.js', () => ({ reloadApp: vi.fn() }));
import { reloadApp } from '../reloadApp.js';

const NOTE_KEY = 'tallio-reloaded-by-other-window';

function renderApp(props = {}) { return render(<IconLibraryProvider><App {...props} /></IconLibraryProvider>); }
function fireFromOtherWindow(key) {
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage })); });
}

describe('Cross-window sync', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(reloadApp).mockClear();
  });

  it('reloads and leaves a note when another window saves entries', () => {
    renderApp();
    fireFromOtherWindow('tallio-transactions');
    expect(reloadApp).toHaveBeenCalled();
    expect(sessionStorage.getItem(NOTE_KEY)).not.toBeNull();
  });

  it('does not reload for a clipboard change in another window', () => {
    renderApp();
    fireFromOtherWindow('tallio-clipboard');
    expect(reloadApp).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(NOTE_KEY)).toBeNull();
  });

  // main.jsx takes the one-shot note before React mounts (StrictMode runs mount
  // effects twice in dev) and passes it in as a prop.
  it('shows the note after such a reload', async () => {
    renderApp({ reloadedByOtherWindow: true });
    expect(await screen.findByText('Updated from another Tallio window')).toBeTruthy();
  });

  it('shows no note on a normal start', () => {
    renderApp();
    expect(screen.queryByText('Updated from another Tallio window')).toBeNull();
  });

  it('stops listening once the app unmounts', () => {
    const { unmount } = renderApp();
    unmount();
    fireFromOtherWindow('tallio-transactions');
    expect(reloadApp).not.toHaveBeenCalled();
  });
});

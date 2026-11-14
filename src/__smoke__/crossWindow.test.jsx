// src/__smoke__/crossWindow.test.jsx
// After main.jsx reloads this window because another Tallio window saved, the fresh
// page says why it jumped. (The listener itself lives in main.jsx and is unit-tested
// in crossWindowSync.test.js via startCrossWindowSync.)
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, cleanup } from '@testing-library/react';
import IconLibraryProvider from '../IconLibraryProvider.jsx';
import App from '../App.jsx';

function renderApp(props = {}) { return render(<IconLibraryProvider><App {...props} /></IconLibraryProvider>); }

describe('Cross-window sync note', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); });

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
});

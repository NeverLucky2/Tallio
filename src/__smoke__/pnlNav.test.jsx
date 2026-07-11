// src/__smoke__/pnlNav.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent } from '@testing-library/react';
import IconLibraryProvider from '../IconLibraryProvider.jsx';
import App from '../App.jsx';

function renderApp() { return render(<IconLibraryProvider><App /></IconLibraryProvider>); }

describe('P&L navigation', () => {
  beforeEach(() => {
    localStorage.clear();
    // schema-version >= 5 loads tallio-accounts directly (no migration wipe). Known gotcha.
    localStorage.setItem('tallio-schema-version', '5');
    localStorage.setItem('tallio-accounts', JSON.stringify([{ id: 'a1', name: 'Biz', type: 'untyped', openingBalance: 0 }]));
  });

  it('opens the Profit & Loss screen from the nav and closes it', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /^P&L$/ }));
    expect(screen.getByRole('heading', { name: /profit & loss/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(screen.queryByRole('heading', { name: /profit & loss/i })).toBeNull();
  });
});

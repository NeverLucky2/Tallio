// src/__smoke__/scanReview.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import IconLibraryProvider from '../IconLibraryProvider.jsx';
import App from '../App.jsx';

vi.mock('../billExtractor.js', async (orig) => ({
  ...(await orig()),
  extractBillFromImage: vi.fn().mockResolvedValue({ vendor: 'Costco', month: null, items: [{ description: 'Groceries', amount: 50 }] }),
}));

function renderApp() { return render(<IconLibraryProvider><App /></IconLibraryProvider>); }

describe('scan review flow', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('tallio-anthropic-key', 'sk-ant-test'); // handleCapture requires a key
    // schema-version >= 4 makes initializeFromStorage load tallio-accounts directly
    // instead of running the migration path (which would overwrite it with []).
    localStorage.setItem('tallio-schema-version', '4');
    localStorage.setItem('tallio-accounts', JSON.stringify([{ id: 'a1', name: 'Costco Card', type: 'untyped', icon: '🏦', openingBalance: 0 }]));
  });

  it('opens ScanReview after a scan and commits to the chosen account', async () => {
    const { container } = renderApp();
    const file = new File([new Uint8Array([1, 2, 3])], 'bill.png', { type: 'image/png' });
    const input = container.querySelector('input[accept="image/*,application/pdf"]');
    fireEvent.change(input, { target: { files: [file] } });

    // Dialog appears; nothing committed yet
    await waitFor(() => expect(screen.getByText(/Found 1 transaction from/i)).toBeTruthy());
    expect(JSON.parse(localStorage.getItem('tallio-transactions') || '[]')).toHaveLength(0);

    // Vendor "Costco" fuzzy-matches "Costco Card" → preselected; confirm
    fireEvent.click(screen.getByRole('button', { name: /Add 1 transaction/i }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('tallio-transactions')).length).toBe(1));
  });
});

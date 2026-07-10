// src/__smoke__/scanCancel.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import IconLibraryProvider from '../IconLibraryProvider.jsx';
import App from '../App.jsx';

// Resolve nothing until aborted, then reject like the SDK does.
vi.mock('../billExtractor.js', async (orig) => ({
  ...(await orig()),
  extractBillFromImage: vi.fn((data, { signal }) => new Promise((_, reject) => {
    signal?.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'APIUserAbortError'; reject(e); });
  })),
}));

function renderApp() { return render(<IconLibraryProvider><App /></IconLibraryProvider>); }

describe('scan cancel', () => {
  beforeEach(() => { localStorage.clear(); localStorage.setItem('tallio-anthropic-key', 'sk-ant-test'); });

  it('Cancel aborts the scan, hides the overlay, and shows no error banner', async () => {
    const { container } = renderApp();
    const file = new File([new Uint8Array([1, 2, 3])], 'bill.png', { type: 'image/png' });
    fireEvent.change(container.querySelector('input[accept="image/*,application/pdf"]'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/Reading bill/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

    await waitFor(() => expect(screen.queryByText(/Reading bill/i)).toBeNull());
    expect(screen.queryByText(/Scan failed/i)).toBeNull();
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PhotoUploadPanel from './PhotoUploadPanel.jsx';

afterEach(() => cleanup());

const basePeer = (batch) => ({
  sessionId: 'sess-1',
  status: 'paired',
  errorMessage: null,
  batch: { id: 'b1', count: 0, completed: 0, failed: 0, overall: 0, status: 'idle', ...batch },
  start: vi.fn(), unpair: vi.fn(),
});

const props = (over = {}) => ({
  peer: basePeer(over.batch),
  group: 'Uncategorized',
  groups: ['Uncategorized', 'Pets'],
  onChangeGroup: vi.fn(),
  onCreateGroup: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

describe('PhotoUploadPanel', () => {
  it('renders the destination group selector with options', () => {
    const p = props();
    render(<PhotoUploadPanel {...p} />);
    const select = screen.getByLabelText(/photos will be added to/i);
    expect(select.querySelectorAll('option').length).toBe(2);
    fireEvent.change(select, { target: { value: 'Pets' } });
    expect(p.onChangeGroup).toHaveBeenCalledWith('Pets');
  });

  it('shows batch progress while receiving', () => {
    render(<PhotoUploadPanel {...props({ batch: { count: 6, completed: 2, failed: 0, status: 'receiving' } })} />);
    expect(screen.getByText(/receiving 3 of 6/i)).toBeTruthy();
  });

  it('shows a done summary when the batch completes', () => {
    render(<PhotoUploadPanel {...props({ group: 'Pets', batch: { count: 4, completed: 4, failed: 0, status: 'done' } })} />);
    expect(screen.getByText(/added 4 photos to pets/i)).toBeTruthy();
  });

  it('notes failures in the done summary', () => {
    render(<PhotoUploadPanel {...props({ batch: { count: 3, completed: 2, failed: 1, status: 'done' } })} />);
    expect(screen.getByText(/1 failed/i)).toBeTruthy();
  });

  it('creates a new group', () => {
    const p = props();
    render(<PhotoUploadPanel {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /new group/i }));
    const input = screen.getByLabelText(/new group name/i);
    fireEvent.change(input, { target: { value: 'Trips' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(p.onCreateGroup).toHaveBeenCalledWith('Trips');
  });
});

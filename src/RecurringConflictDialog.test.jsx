import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecurringConflictDialog from './RecurringConflictDialog.jsx';

afterEach(() => cleanup());

const conflict = {
  chainId: 'rec_h',
  chainSourceBillId: 'b_apr',
  targetMonth: '2026-05',
  existingBillId: 'b_may_manual',
};
const sourceBill   = { id: 'b_apr',        vendor: 'Honda Finance', month: '2026-04', items: [] };
const existingBill = { id: 'b_may_manual', vendor: 'Honda Finance', month: '2026-05', items: [] };

describe('RecurringConflictDialog', () => {
  it('renders the target month and vendor in the title and body', () => {
    render(
      <RecurringConflictDialog
        conflict={conflict}
        sourceBill={sourceBill}
        existingBill={existingBill}
        onLink={() => {}}
        onDuplicate={() => {}}
        onSkip={() => {}}
      />
    );
    // Title says "May 2026 already has a Honda Finance bill."
    expect(screen.getByText(/already has a Honda Finance bill/i)).toBeTruthy();
    // Multiple elements contain "May 2026" (title, body, list items) — getAllByText.
    expect(screen.getAllByText(/May 2026/i).length).toBeGreaterThan(0);
  });

  it('renders three actions: Link, Duplicate, Skip', () => {
    render(
      <RecurringConflictDialog
        conflict={conflict} sourceBill={sourceBill} existingBill={existingBill}
        onLink={() => {}} onDuplicate={() => {}} onSkip={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /Link/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Duplicate/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Skip/i })).toBeTruthy();
  });

  it('Link click calls onLink with the conflict', async () => {
    const onLink = vi.fn();
    render(
      <RecurringConflictDialog
        conflict={conflict} sourceBill={sourceBill} existingBill={existingBill}
        onLink={onLink} onDuplicate={() => {}} onSkip={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Link/i }));
    expect(onLink).toHaveBeenCalledWith(conflict);
  });

  it('Duplicate click calls onDuplicate with the conflict', async () => {
    const onDuplicate = vi.fn();
    render(
      <RecurringConflictDialog
        conflict={conflict} sourceBill={sourceBill} existingBill={existingBill}
        onLink={() => {}} onDuplicate={onDuplicate} onSkip={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Duplicate/i }));
    expect(onDuplicate).toHaveBeenCalledWith(conflict);
  });

  it('Skip click calls onSkip with the conflict', async () => {
    const onSkip = vi.fn();
    render(
      <RecurringConflictDialog
        conflict={conflict} sourceBill={sourceBill} existingBill={existingBill}
        onLink={() => {}} onDuplicate={() => {}} onSkip={onSkip}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Skip/i }));
    expect(onSkip).toHaveBeenCalledWith(conflict);
  });
});

// src/BudgetFileCard.test.jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import BudgetFileCard from './BudgetFileCard.jsx';

describe('BudgetFileCard', () => {
  afterEach(() => cleanup());

  it('unlinked: status, hint, and two actions', () => {
    const calls = [];
    const { getByText, queryByText, container } = render(
      <BudgetFileCard status="unlinked" fileName={null} lastSavedAt={null}
        onLink={() => calls.push('link')} onOpen={() => calls.push('open')} onUnlink={() => calls.push('unlink')} />,
    );
    expect(getByText('Stored in this browser only')).toBeTruthy();
    expect(getByText('Link a file and every change autosaves to it.')).toBeTruthy();
    expect(container.querySelector('.budget-file-card').className).not.toContain('is-linked');
    fireEvent.click(getByText('Link a budget file'));
    fireEvent.click(getByText('Open existing…'));
    expect(calls).toEqual(['link', 'open']);
    expect(queryByText('Unlink')).toBeNull();
  });

  it('linked: file name, saved time, and three actions', () => {
    const calls = [];
    const at = new Date(2026, 10, 14, 14, 14).getTime();
    const time = new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const { getByText, container } = render(
      <BudgetFileCard status="linked" fileName="Household-2026.tallio" lastSavedAt={at}
        onLink={() => calls.push('link')} onOpen={() => calls.push('open')} onUnlink={() => calls.push('unlink')} />,
    );
    expect(container.querySelector('.budget-file-card').className).toContain('is-linked');
    expect(getByText(`Autosaving · saved ${time}`)).toBeTruthy();
    expect(getByText('Household-2026.tallio').getAttribute('title')).toBe('Household-2026.tallio');
    expect(getByText('Every change is written to this file.')).toBeTruthy();
    fireEvent.click(getByText('Change file'));
    fireEvent.click(getByText('Open another…'));
    fireEvent.click(getByText('Unlink'));
    expect(calls).toEqual(['link', 'open', 'unlink']);
  });

  it('linked with no save yet shows plain "Autosaving"', () => {
    const { getByText } = render(
      <BudgetFileCard status="linked" fileName="a.tallio" lastSavedAt={null} onLink={() => {}} onOpen={() => {}} onUnlink={() => {}} />,
    );
    expect(getByText('Autosaving')).toBeTruthy();
  });
});

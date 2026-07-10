// src/PayeePicker.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PayeePicker from './PayeePicker.jsx';

afterEach(() => cleanup());

const payees = [
  { id: 'p1', name: 'Costco', defaultCategoryId: null, defaultSubcategoryId: null },
  { id: 'p2', name: 'Shell', defaultCategoryId: null, defaultSubcategoryId: null },
];

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Payee' }));

describe('PayeePicker', () => {
  it('shows the selected name on the trigger, or the none label', () => {
    const { rerender } = render(<PayeePicker payees={payees} value="p1" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Payee' }).textContent).toContain('Costco');
    rerender(<PayeePicker payees={payees} value={null} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Payee' }).textContent).toContain('No payee');
  });

  it('filters by query and selects on click', () => {
    const onChange = vi.fn();
    render(<PayeePicker payees={payees} value={null} onChange={onChange} />);
    open();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'she' } });
    expect(screen.queryByText('Costco')).toBeNull();
    fireEvent.click(screen.getByText('Shell'));
    expect(onChange).toHaveBeenCalledWith('p2');
  });

  it('clears via the none option', () => {
    const onChange = vi.fn();
    render(<PayeePicker payees={payees} value="p1" onChange={onChange} />);
    open();
    fireEvent.click(screen.getByText('— No payee —'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('offers inline create for a novel name, but not for a case-insensitive match', () => {
    const onCreate = vi.fn(() => 'p9');
    const onChange = vi.fn();
    render(<PayeePicker payees={payees} value={null} onChange={onChange} onCreate={onCreate} />);
    open();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'costco' } });
    expect(screen.queryByText(/New payee/)).toBeNull();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Trader Joes' } });
    fireEvent.click(screen.getByText(/New payee/));
    expect(onCreate).toHaveBeenCalledWith('Trader Joes');
    expect(onChange).toHaveBeenCalledWith('p9');
  });

  it('supports keyboard: arrows + Enter select the highlighted option', () => {
    const onChange = vi.fn();
    render(<PayeePicker payees={payees} value={null} onChange={onChange} />);
    open();
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('p2'); // Costco is index 0; ArrowDown → Shell
  });
});

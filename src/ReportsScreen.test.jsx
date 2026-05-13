import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(() => cleanup());
import ReportsScreen from './ReportsScreen.jsx';

describe('ReportsScreen — skeleton', () => {
  it('renders three tab buttons with role=tab', () => {
    render(<ReportsScreen bills={[]} categories={[]} categoriesById={new Map()} selectedMonth="2026-05" onClose={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(3);
    expect(tabs.map(t => t.textContent.trim())).toEqual(['Year-over-year', 'Month trend', 'Recurring breakdown']);
  });

  it('opens on the Year-over-year tab', () => {
    render(<ReportsScreen bills={[]} categories={[]} categoriesById={new Map()} selectedMonth="2026-05" onClose={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(tabs[2].getAttribute('aria-selected')).toBe('false');
  });

  it('clicking a tab switches aria-selected', () => {
    render(<ReportsScreen bills={[]} categories={[]} categoriesById={new Map()} selectedMonth="2026-05" onClose={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[1]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(<ReportsScreen bills={[]} categories={[]} categoriesById={new Map()} selectedMonth="2026-05" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ESC key calls onClose', () => {
    const onClose = vi.fn();
    render(<ReportsScreen bills={[]} categories={[]} categoriesById={new Map()} selectedMonth="2026-05" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

const cats = [
  { id: 'c_food', name: 'Groceries', flow: 'expense' },
  { id: 'c_util', name: 'Utilities', flow: 'expense' },
  { id: 'c_pay',  name: 'Paycheck',  flow: 'income'  },
  { id: 'c_401k', name: '401(k)',    flow: 'savings'  },
];
const catsById = new Map(cats.map(c => [c.id, c]));

describe('ReportsScreen — Year-over-year tab', () => {
  it('shows "Not enough history yet" when bills have less than 13 months of data', () => {
    const bills = [
      { id: 'b1', vendor: 'V', month: '2026-04', items: [
        { id: 'i1', description: 'A', amount: 100, categoryId: 'c_food', date: '2026-04-15' },
      ]},
    ];
    render(<ReportsScreen bills={bills} categories={cats} categoriesById={catsById} selectedMonth="2026-05" onClose={() => {}} />);
    expect(screen.getByText(/Not enough history yet/i)).toBeTruthy();
  });

  it('renders rows grouped by flow when there is data', () => {
    const bills = [];
    for (let y of [2025, 2026]) {
      bills.push({ id: `b_${y}`, vendor: 'V', month: `${y}-04`, items: [
        { id: `i_${y}_1`, description: 'Food', amount: 100, categoryId: 'c_food', date: `${y}-04-15` },
        { id: `i_${y}_2`, description: 'Util', amount:  50, categoryId: 'c_util', date: `${y}-04-15` },
      ]});
    }
    render(<ReportsScreen bills={bills} categories={cats} categoriesById={catsById} selectedMonth="2026-05" onClose={() => {}} />);
    const tab = screen.getByTestId('tab-yoy');
    expect(tab.textContent).toContain('Groceries');
    expect(tab.textContent).toContain('Utilities');
    expect(tab.textContent).toContain('Expense');
  });

  it('renders — for priorYTD when there is no apples-to-apples comparison', () => {
    const bills = [];
    // 14 months of bills so we pass the "not enough history" gate
    for (let i = 0; i < 14; i++) {
      const y = 2025 + Math.floor((i + 5) / 12);
      const m = ((i + 5) % 12) + 1;
      const month = `${y}-${String(m).padStart(2, '0')}`;
      bills.push({ id: `b${i}`, vendor: 'V', month, items: [] });
    }
    // Only current-year food data — no prior-year
    bills.push({ id: 'cur', vendor: 'V', month: '2026-04', items: [
      { id: 'icur', description: 'A', amount: 100, categoryId: 'c_food', date: '2026-04-15' },
    ]});
    render(<ReportsScreen bills={bills} categories={cats} categoriesById={catsById} selectedMonth="2026-05" onClose={() => {}} />);
    const tab = screen.getByTestId('tab-yoy');
    expect(tab.textContent).toContain('—');
  });
});

describe('ReportsScreen — Month trend tab', () => {
  const bills = [
    { id: 'b1', vendor: 'V', month: '2026-04', items: [
      { id: 'i1', description: 'F', amount: 100, categoryId: 'c_food', date: '2026-04-10' },
      { id: 'i2', description: 'U', amount:  50, categoryId: 'c_util', date: '2026-04-15' },
    ]},
  ];

  it('renders the category picker grouped by flow', () => {
    render(<ReportsScreen bills={bills} categories={cats} categoriesById={catsById} selectedMonth="2026-05" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Month trend' }));
    const picker = screen.getByTestId('month-trend-picker');
    expect(picker.querySelectorAll('optgroup').length).toBe(3);
  });

  it('defaults to the first expense-flow category', () => {
    render(<ReportsScreen bills={bills} categories={cats} categoriesById={catsById} selectedMonth="2026-05" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Month trend' }));
    const picker = screen.getByTestId('month-trend-picker');
    expect(picker.value).toBe('c_food');
  });

  it('changing the picker updates the chart', () => {
    render(<ReportsScreen bills={bills} categories={cats} categoriesById={catsById} selectedMonth="2026-05" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Month trend' }));
    const picker = screen.getByTestId('month-trend-picker');
    fireEvent.change(picker, { target: { value: 'c_util' } });
    expect(picker.value).toBe('c_util');
  });
});

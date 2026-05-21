// src/SummaryScorecard.test.jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SummaryScorecard from './SummaryScorecard.jsx';

describe('SummaryScorecard', () => {
  afterEach(() => cleanup());
  it('shows income, spending, savings and the savings rate', () => {
    render(<SummaryScorecard summary={{ income: 5000, spending: 1030, savings: 3970, savingsRate: 0.794, earmarked: 0 }} />);
    expect(screen.getByText('Income')).toBeTruthy();
    expect(screen.getByText('Spending')).toBeTruthy();
    expect(screen.getByText('Savings')).toBeTruthy();
    expect(screen.getByText(/79%/)).toBeTruthy();
  });
  it('shows the earmarked sub-line only when > 0', () => {
    const { rerender } = render(<SummaryScorecard summary={{ income: 1, spending: 0, savings: 1, savingsRate: 1, earmarked: 0 }} />);
    expect(screen.queryByText(/earmarked/i)).toBeNull();
    rerender(<SummaryScorecard summary={{ income: 1, spending: 0, savings: 1, savingsRate: 1, earmarked: 250 }} />);
    expect(screen.getByText(/earmarked/i)).toBeTruthy();
  });
});

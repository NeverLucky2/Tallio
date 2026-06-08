// src/SummaryScorecard.jsx
import React from 'react';
import useCountUp from './useCountUp.js';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const pct = (r) => `${Math.round((r || 0) * 100)}%`;

export default function SummaryScorecard({ summary }) {
  const { income = 0, spending = 0, savings = 0, savingsRate = 0, earmarked = 0 } = summary || {};
  const incomeV = useCountUp(income);
  const spendingV = useCountUp(spending);
  const savingsV = useCountUp(savings);
  return (
    <div className="scorecard">
      <div className="scorecard-row">
        <div className="scorecard-item">
          <span className="scorecard-label">Income</span>
          <span className="scorecard-value scorecard-pos">{money(incomeV)}</span>
        </div>
        <div className="scorecard-item">
          <span className="scorecard-label">Spending</span>
          <span className="scorecard-value scorecard-neg">{money(spendingV)}</span>
        </div>
        <div className="scorecard-item scorecard-item-hero">
          <span className="scorecard-label">Savings</span>
          <span className={`scorecard-value ${savings >= 0 ? 'scorecard-pos' : 'scorecard-neg'}`}>{money(savingsV)}</span>
          <span className="scorecard-rate">Savings rate {pct(savingsRate)}</span>
        </div>
      </div>
      {earmarked > 0 && (
        <p className="scorecard-sub">of which earmarked to savings categories: {money(earmarked)}</p>
      )}
    </div>
  );
}

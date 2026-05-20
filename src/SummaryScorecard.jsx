// src/SummaryScorecard.jsx
import React from 'react';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const pct = (r) => `${Math.round((r || 0) * 100)}%`;

export default function SummaryScorecard({ summary }) {
  const { income = 0, spending = 0, savings = 0, savingsRate = 0, earmarked = 0 } = summary || {};
  return (
    <div className="scorecard">
      <div className="scorecard-row">
        <div className="scorecard-item">
          <span className="scorecard-label">Income</span>
          <span className="scorecard-value scorecard-pos">{money(income)}</span>
        </div>
        <div className="scorecard-item">
          <span className="scorecard-label">Spending</span>
          <span className="scorecard-value scorecard-neg">{money(spending)}</span>
        </div>
        <div className="scorecard-item scorecard-item-hero">
          <span className="scorecard-label">Savings</span>
          <span className={`scorecard-value ${savings >= 0 ? 'scorecard-pos' : 'scorecard-neg'}`}>{money(savings)}</span>
          <span className="scorecard-rate">Savings rate {pct(savingsRate)}</span>
        </div>
      </div>
      {earmarked > 0 && (
        <p className="scorecard-sub">of which earmarked to savings categories: {money(earmarked)}</p>
      )}
    </div>
  );
}

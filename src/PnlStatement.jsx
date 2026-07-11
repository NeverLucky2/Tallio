// src/PnlStatement.jsx
import React from 'react';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

export default function PnlStatement({ pnl }) {
  if (!pnl || !pnl.buckets || pnl.buckets.length === 0) {
    return <p className="panel-empty">No activity in this period</p>;
  }
  const { buckets, income, expense, netByBucket, netTotal } = pnl;
  const keys = buckets.map(b => b.key);

  const DataRow = ({ label, byBucket, total, className }) => (
    <tr className={className}>
      <th scope="row" className="pnl-row-label">{label}</th>
      {keys.map(k => <td key={k} className="pnl-cell">{money(byBucket[k])}</td>)}
      <td className="pnl-cell pnl-total-cell">{money(total)}</td>
    </tr>
  );
  const SectionRow = ({ label }) => (
    <tr className="pnl-section"><th scope="row" colSpan={keys.length + 2}>{label}</th></tr>
  );

  return (
    <div className="pnl-scroll">
      <table className="pnl-table">
        <thead>
          <tr>
            <th className="pnl-corner" />
            {buckets.map(b => <th key={b.key} scope="col" className="pnl-col-head">{b.label}</th>)}
            <th scope="col" className="pnl-col-head pnl-total-cell">Total</th>
          </tr>
        </thead>
        <tbody>
          <SectionRow label="Income" />
          {income.rows.map(r => <DataRow key={r.categoryId} label={r.name} byBucket={r.byBucket} total={r.total} className="pnl-item" />)}
          <DataRow label="Total income" byBucket={income.totalsByBucket} total={income.total} className="pnl-subtotal" />
          <SectionRow label="Expenses" />
          {expense.rows.map(r => <DataRow key={r.categoryId} label={r.name} byBucket={r.byBucket} total={r.total} className="pnl-item" />)}
          <DataRow label="Total expense" byBucket={expense.totalsByBucket} total={expense.total} className="pnl-subtotal" />
          <DataRow label="Net profit" byBucket={netByBucket} total={netTotal} className="pnl-net" />
        </tbody>
      </table>
    </div>
  );
}

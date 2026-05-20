// src/TransactionRow.jsx
import React from 'react';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const plain = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));

function CategoryCell({ categoriesById, categoryId }) {
  const cat = categoriesById && categoriesById.get(categoryId);
  if (!cat) return <span className="txn-cat txn-cat-none">—</span>;
  return <span className="txn-cat"><span className="txn-cat-icon" aria-hidden="true">{cat.icon}</span> {cat.name}</span>;
}

export default function TransactionRow({ layout, row, categoriesById, onEdit }) {
  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');

  if (layout === 'bank') {
    const isPayment = row.amount < 0;
    return (
      <tr className="txn-row" onClick={() => onEdit(row)}>
        <td className="txn-date">{fmtDate(row.date)}</td>
        <td className="txn-check">{row.checkNumber || '—'}</td>
        <td className="txn-payee">{row.payee || '—'}</td>
        <td><CategoryCell categoriesById={categoriesById} categoryId={row.categoryId} /></td>
        <td className="txn-notes">{row.description}</td>
        <td className="txn-amt neg">{isPayment ? plain(row.amount) : ''}</td>
        <td className="txn-amt pos">{!isPayment ? plain(row.amount) : ''}</td>
        <td className={`txn-bal${row.balance < 0 ? ' neg' : ''}`}>{money(row.balance)}</td>
      </tr>
    );
  }

  return (
    <tr className="txn-row" onClick={() => onEdit(row)}>
      <td className="txn-date">{fmtDate(row.date)}</td>
      <td className="txn-desc">{row.description}</td>
      <td><CategoryCell categoriesById={categoriesById} categoryId={row.categoryId} /></td>
      <td className={`txn-amt${row.amount < 0 ? ' neg' : ' pos'}`}>{row.amount < 0 ? '-' : '+'}{money(Math.abs(row.amount))}</td>
      <td className={`txn-bal${row.balance < 0 ? ' neg' : ''}`}>{money(row.balance)}</td>
    </tr>
  );
}

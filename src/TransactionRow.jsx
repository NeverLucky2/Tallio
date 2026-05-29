// src/TransactionRow.jsx
import React, { useState } from 'react';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const plain = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));

function CategoryCell({ categoriesById, categoryId }) {
  const cat = categoriesById && categoriesById.get(categoryId);
  if (!cat) return <span className="txn-cat txn-cat-none">—</span>;
  return <span className="txn-cat"><span className="txn-cat-icon" aria-hidden="true">{cat.icon}</span> {cat.name}</span>;
}

function TransferChip({ info, category, onNavigate }) {
  const cls = info.counterpartClass ? ` txn-transfer--${info.counterpartClass}` : '';
  return (
    <span className="txn-transfer-wrap">
      <span className={`txn-cat txn-transfer${cls}`}>
        <span className="txn-transfer-glyph" aria-hidden="true">⇄ {info.direction === 'out' ? '→' : '←'}</span> {info.counterpartName}
        {info.counterpartId && (
          <button type="button" className="txn-transfer-jump" aria-label={`Go to ${info.counterpartName}`}
            onClick={(e) => { e.stopPropagation(); if (onNavigate) onNavigate(info.counterpartId); }}>
            <span aria-hidden="true">↗</span>
          </button>
        )}
      </span>
      {category && (
        <span className="txn-transfer-type"
          style={{ color: category.color, borderColor: `${category.color}55`, background: `${category.color}1a` }}>
          <span aria-hidden="true">{category.icon}</span> {category.name}
        </span>
      )}
    </span>
  );
}

function SplitChevron({ expanded, onClick, count }) {
  return (
    <button
      type="button"
      aria-label={expanded ? 'Collapse splits' : 'Expand splits'}
      className="split-chevron"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {expanded ? '▼' : '▶'} {count} split lines
    </button>
  );
}

export default function TransactionRow({ layout, row, categoriesById, transfer = null, onNavigate, onEdit, expandSplitHint = null }) {
  const isSplit = Array.isArray(row.splits) && row.splits.length > 0;
  // null = follow hint; true/false = user override. A fresh hint re-shows hint state until clicked.
  const [userExpanded, setUserExpanded] = useState(null);
  const expanded = userExpanded ?? !!expandSplitHint;
  const setExpanded = (next) => setUserExpanded(next);

  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');
  const transferCategory = transfer && row.categoryId && categoriesById ? (categoriesById.get(row.categoryId) || null) : null;

  const categoryCell = isSplit
    ? <SplitChevron expanded={expanded} onClick={() => setExpanded(!expanded)} count={row.splits.length} />
    : (transfer ? <TransferChip info={transfer} category={transferCategory} onNavigate={onNavigate} /> : <CategoryCell categoriesById={categoriesById} categoryId={row.categoryId} />);

  if (layout === 'bank') {
    const isPayment = row.amount < 0;
    return (
      <>
        <tr className={`txn-row${isSplit ? ' txn-row-split' : ''}`} onClick={() => onEdit(row)}>
          <td className="txn-date">{fmtDate(row.date)}</td>
          <td className="txn-check">{row.checkNumber || '—'}</td>
          <td className="txn-payee">{row.payee || '—'}</td>
          <td>{categoryCell}</td>
          <td className="txn-notes">{row.description}</td>
          <td className="txn-amt neg">{isPayment ? plain(row.amount) : ''}</td>
          <td className="txn-amt pos">{!isPayment ? plain(row.amount) : ''}</td>
          <td className={`txn-bal${row.balance < 0 ? ' neg' : ''}`}>{money(row.balance)}</td>
        </tr>
        {isSplit && expanded && row.splits.map(s => (
          <tr key={s.id} className="txn-split-line">
            <td></td>
            <td></td>
            <td></td>
            <td>{s.categoryId ? (categoriesById?.get(s.categoryId)?.name || '—') : '⇄ Transfer'}</td>
            <td className="txn-notes">{s.description}</td>
            <td className="txn-amt neg">{s.amount < 0 ? plain(s.amount) : ''}</td>
            <td className="txn-amt pos">{s.amount >= 0 ? plain(s.amount) : ''}</td>
            <td></td>
          </tr>
        ))}
      </>
    );
  }

  return (
    <>
      <tr className={`txn-row${isSplit ? ' txn-row-split' : ''}`} onClick={() => onEdit(row)}>
        <td className="txn-date">{fmtDate(row.date)}</td>
        <td className="txn-desc">{row.description}</td>
        <td>{categoryCell}</td>
        <td className={`txn-amt${row.amount < 0 ? ' neg' : ' pos'}`}>{row.amount < 0 ? '-' : '+'}{money(Math.abs(row.amount))}</td>
        <td className={`txn-bal${row.balance < 0 ? ' neg' : ''}`}>{money(row.balance)}</td>
      </tr>
      {isSplit && expanded && row.splits.map(s => (
        <tr key={s.id} className="txn-split-line">
          <td></td>
          <td className="txn-desc">{s.description}</td>
          <td>{s.categoryId ? (categoriesById?.get(s.categoryId)?.name || '—') : '⇄ Transfer'}</td>
          <td className={`txn-amt${s.amount < 0 ? ' neg' : ' pos'}`}>{s.amount < 0 ? '-' : '+'}{money(Math.abs(s.amount))}</td>
          <td></td>
        </tr>
      ))}
    </>
  );
}

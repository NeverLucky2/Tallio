// src/Register.jsx
import React, { useMemo, useState, useRef, useEffect } from 'react';
import Icon from './Icon.jsx';
import UiIcon from './ui/UiIcon.jsx';
import { iconGlyph } from './iconValue.js';
import { computeRegister, filterTransactions, sortRows, layoutFor, accountClass, accountBalance, transferInfo, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';
import TransactionRow from './TransactionRow.jsx';
import { groupCategoriesByFlow } from './categoriesView.js';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

// Column definitions per layout. `key` is the sortRows key; `defaultDir` is the
// direction used the first time a column is clicked.
const COLUMNS = {
  compact: [
    { key: 'date',        label: 'Date',        defaultDir: 'desc' },
    { key: 'description', label: 'Description', defaultDir: 'asc'  },
    { key: 'category',    label: 'Category',    defaultDir: 'asc'  },
    { key: 'amount',      label: 'Amount',      defaultDir: 'desc', right: true },
    { key: 'balance',     label: 'Balance',     defaultDir: 'desc', right: true },
  ],
  bank: [
    { key: 'date',        label: 'Date',    defaultDir: 'desc' },
    { key: 'checkNumber', label: 'Chk#',    defaultDir: 'asc'  },
    { key: 'payee',       label: 'Payee',   defaultDir: 'asc'  },
    { key: 'category',    label: 'Category',defaultDir: 'asc'  },
    { key: 'description', label: 'Notes',   defaultDir: 'asc'  },
    { key: 'amount',      label: 'Payment', defaultDir: 'asc',  right: true },
    { key: 'amount',      label: 'Deposit', defaultDir: 'desc', right: true },
    { key: 'balance',     label: 'Balance', defaultDir: 'desc', right: true },
  ],
};

export default function Register({ account, transactions, accounts = [], categories, categoriesById, typesById, onEditTransaction, onAddTransaction, onTransfer = () => {}, onSelectAccount = () => {}, onEditAccount = null, onCopyEntry = null, onDuplicateEntry = null, onSaveTemplateEntry = null, clipboard = null, onPaste = () => {}, onClearClipboard = () => {}, templates = [], onApplyTemplate = () => {}, onDeleteTemplate = () => {} }) {
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });

  const layout = layoutFor(account.type, typesById);
  const klass = accountClass(account.type, typesById);
  const balance = accountBalance(account, transactions);
  const columns = COLUMNS[layout] || COLUMNS.compact;

  const rows = useMemo(() => {
    const computed = computeRegister(account, transactions);
    const filtered = filterTransactions(computed, { search, month: month || null, categoryId: categoryId || null }, categoriesById);
    return sortRows(filtered, sort, categoriesById);
  }, [account, transactions, search, month, categoryId, categoriesById, sort]);

  const accountsById = useMemo(() => new Map((accounts || []).map(a => [a.id, a])), [accounts]);

  // "/" jumps to search — unless the user is typing or an overlay is open.
  const searchRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target;
      const tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el && el.isContentEditable)) return;
      // Editors/screens render several overlay flavors, not all with role="dialog".
      if (document.querySelector('[role="dialog"], .dialog-overlay, .modal-overlay, .pair-overlay, .screen-overlay, .camera-overlay, .processing-overlay')) return;
      e.preventDefault();
      if (searchRef.current) searchRef.current.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onHeaderClick = (col) => {
    setSort(prev => prev.key === col.key
      ? { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key: col.key, dir: col.defaultDir });
  };

  const typeLabel = ((typesById || DEFAULT_ACCOUNT_TYPES_BY_ID).get(account.type) || { label: 'Unassigned' }).label;
  const lastEntryDate = rows.reduce((max, r) => (r.date && r.date > max ? r.date : max), '');
  const monthLabel = month
    ? new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'All activity';
  const lastEntryLabel = lastEntryDate
    ? `Last entry ${new Date(`${lastEntryDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : '';

  return (
    <div className="register">
      <div className="register-header">
        <span className="icon-well icon-well-lg"><Icon value={account.icon} className="register-icon" /></span>
        <h2 className="register-title">{account.name}</h2>
        <span className="register-kind">{typeLabel}</span>
        <div className="register-balance-block">
          <span className="register-balance-label">{klass === 'liability' ? 'Owed' : 'Balance'}</span>
          <span className="register-balance">{klass === 'liability' ? money(Math.abs(Math.min(0, balance))) : money(balance)}</span>
        </div>
        <div className="register-actions">
          <button type="button" className="btn btn-primary" onClick={() => onAddTransaction(account.id)} aria-label="Add transaction">+ New entry</button>
          <button type="button" className="btn" onClick={() => onTransfer(account.id)} aria-label="Transfer">⇄ Transfer</button>
          {onEditAccount && (
            <button type="button" className="btn btn-icon" onClick={onEditAccount} aria-label="Edit account" title="Edit account">✎</button>
          )}
        </div>
      </div>

      <div className="register-filters">
        <span className="register-search">
          <input type="text" ref={searchRef} className="input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="kbd-hint" aria-hidden="true">/</span>
        </span>
        <label className="register-month">
          <UiIcon name="calendar" size={14} />
          <input type="month" className="register-month-input" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month filter" />
        </label>
        <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category filter">
          <option value="">All categories</option>
          {groupCategoriesByFlow(categories).map(group => (
            <optgroup key={group.flow} label={group.label}>
              {group.items.map(c => <option key={c.id} value={c.id}>{iconGlyph(c.icon)} {c.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <table className="register-table">
        <thead>
          <tr>
            {columns.map((col, idx) => {
              const active = sort.key === col.key;
              const arrow = active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
              return (
                <th key={`${col.key}-${idx}`} className={col.right ? 'right' : undefined}>
                  <button type="button" className={`th-sort${active ? ' th-sort-active' : ''}`} onClick={() => onHeaderClick(col)}>
                    {col.label}{arrow}
                  </button>
                </th>
              );
            })}
            <th className="th-actions" aria-hidden="true"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length + 1} className="register-empty">No transactions.</td></tr>
          ) : (
            rows.map(r => (
              <TransactionRow
                key={r.id}
                layout={layout}
                row={r}
                categoriesById={categoriesById}
                transfer={transferInfo(r, transactions, accountsById, typesById)}
                onNavigate={onSelectAccount}
                onEdit={onEditTransaction}
                expandSplitHint={r._matchedSplitId || null}
                onCopy={onCopyEntry}
                onDuplicate={onDuplicateEntry}
                onSaveTemplate={onSaveTemplateEntry}
              />
            ))
          )}
        </tbody>
      </table>

      <div className="register-foot">
        <span>{rows.length} {rows.length === 1 ? 'entry' : 'entries'} · {monthLabel}</span>
        <span>{lastEntryLabel}</span>
      </div>
    </div>
  );
}

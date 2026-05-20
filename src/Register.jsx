// src/Register.jsx
import React, { useMemo, useState } from 'react';
import { computeRegister, filterTransactions, layoutFor, accountClass, accountBalance } from './accountsModel.js';
import TransactionRow from './TransactionRow.jsx';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function Register({ account, transactions, categories, categoriesById, onEditTransaction, onAddTransaction }) {
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const layout = layoutFor(account.type);
  const klass = accountClass(account.type);
  const balance = accountBalance(account, transactions);

  const rows = useMemo(() => {
    const computed = computeRegister(account, transactions); // oldest→newest w/ balance
    const filtered = filterTransactions(computed, { search, month: month || null, categoryId: categoryId || null }, categoriesById);
    return filtered.slice().reverse(); // newest-first for display
  }, [account, transactions, search, month, categoryId, categoriesById]);

  const balanceLabel = klass === 'liability' ? `Owed: ${money(Math.abs(Math.min(0, balance)))}` : `Balance: ${money(balance)}`;

  return (
    <div className="register">
      <div className="register-header">
        <h2 className="register-title"><span className="register-icon" aria-hidden="true">{account.icon}</span> {account.name}</h2>
        <span className="register-balance">{balanceLabel}</span>
        <button type="button" className="btn" onClick={() => onAddTransaction(account.id)} aria-label="Add transaction">+ Add transaction</button>
      </div>

      <div className="register-filters">
        <input type="text" className="input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month filter" />
        <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category filter">
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </div>

      <table className="register-table">
        <thead>
          {layout === 'bank' ? (
            <tr><th>Date</th><th>Chk#</th><th>Payee</th><th>Category</th><th>Notes</th><th className="right">Payment</th><th className="right">Deposit</th><th className="right">Balance</th></tr>
          ) : (
            <tr><th>Date</th><th>Description</th><th>Category</th><th className="right">Amount</th><th className="right">Balance</th></tr>
          )}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={layout === 'bank' ? 8 : 5} className="register-empty">No transactions.</td></tr>
          ) : (
            rows.map(r => (
              <TransactionRow key={r.id} layout={layout} row={r} categoriesById={categoriesById} onEdit={onEditTransaction} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

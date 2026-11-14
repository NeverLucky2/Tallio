// src/PayeeActivityTable.jsx
import React from 'react';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const cell = (n) => (n ? money(n) : '—');

export default function PayeeActivityTable({ data }) {
  const rows = (data && data.rows) || [];
  if (rows.length === 0) return <p className="panel-empty">No activity in this period</p>;
  const totals = (data && data.totals) || { out: 0, in: 0 };
  return (
    <div className="payee-activity-scroll">
      <table className="payee-activity-table">
        <thead>
          <tr>
            <th scope="col" className="pa-name-head">Payee</th>
            <th scope="col">Out</th>
            <th scope="col">In</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.payeeId == null ? '__none' : r.payeeId} className={r.payeeId == null ? 'pa-nopayee' : ''}>
              <th scope="row" className="pa-name">{r.name}</th>
              <td className="pa-cell">{cell(r.out)}</td>
              <td className="pa-cell">{cell(r.in)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="pa-total">
            <th scope="row" className="pa-name">Total</th>
            <td className="pa-cell">{money(totals.out)}</td>
            <td className="pa-cell">{money(totals.in)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

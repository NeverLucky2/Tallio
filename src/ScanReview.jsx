// src/ScanReview.jsx
// Review a freshly-scanned bill and choose which account its transactions go to.
// Smart-preselects by matching the vendor (card name) to an existing account;
// otherwise opens inline account creation prefilled with the vendor name.
import { useState } from 'react';
import { groupAccounts } from './accountsModel.js';
import { matchAccountByVendor } from './scanMatch.js';
import AccountEditor from './AccountEditor.jsx';

export default function ScanReview({ scan, accounts = [], types, typesById, onConfirm, onCancel, onCreateAccount, onAddType = null }) {
  const groups = groupAccounts(accounts, types, typesById);
  const match = matchAccountByVendor(scan.vendor, accounts);
  const [selectedId, setSelectedId] = useState(match ? match.id : '');
  const [creating, setCreating] = useState(!match);
  const count = scan.items.length;
  const plural = count === 1 ? '' : 's';

  const onSelectChange = (e) => {
    if (e.target.value === '__new_account__') { setCreating(true); return; }
    setSelectedId(e.target.value);
  };

  return (
    <div className="pair-overlay" onClick={onCancel}>
      <div className="pair-modal" role="dialog" aria-modal="true" aria-label="Assign scanned bill" onClick={(e) => e.stopPropagation()}>
        <div className="pair-header">
          <h2 className="pair-title">Found {count} transaction{plural} from “{scan.vendor || 'this bill'}”</h2>
          <button className="pair-close" aria-label="Close" onClick={onCancel}>×</button>
        </div>

        <div className="pair-body">
          {creating ? (
            <AccountEditor
              account={null}
              initialName={scan.vendor || ''}
              types={types}
              onAddType={onAddType}
              onSave={(data) => { const id = onCreateAccount(data); setSelectedId(id); setCreating(false); }}
              onDelete={() => {}}
              onClose={() => setCreating(false)}
              onUndo={() => {}}
              undoCount={0}
            />
          ) : (
            <label className="field"><span>Add to account</span>
              <select aria-label="Account" value={selectedId} onChange={onSelectChange} className="select">
                <option value="">Select account…</option>
                {groups.map(({ group, accounts: list }) => (
                  <optgroup key={group} label={group}>
                    {list.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </optgroup>
                ))}
                <option value="__new_account__">＋ New account…</option>
              </select>
            </label>
          )}
        </div>

        {!creating && (
          <div className="pair-footer">
            <button className="btn btn-primary" disabled={!selectedId} onClick={() => onConfirm(selectedId)}>Add {count} transaction{plural}</button>
            <button className="btn" onClick={onCancel}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

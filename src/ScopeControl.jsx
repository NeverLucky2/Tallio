// src/ScopeControl.jsx
import React from 'react';
import { groupAccounts } from './accountsModel.js';

// Encodes a scope object into a <select> value string and back.
function decode(value) {
  if (value === 'all') return { kind: 'all' };
  const [kind, rest] = value.split(':');
  if (kind === 'account') return { kind: 'account', id: rest };
  if (kind === 'type') return { kind: 'type', typeId: rest };
  if (kind === 'group') return { kind: 'group', group: rest };
  return { kind: 'all' };
}
function encode(scope) {
  if (!scope || scope.kind === 'all') return 'all';
  if (scope.kind === 'account') return `account:${scope.id}`;
  if (scope.kind === 'type') return `type:${scope.typeId}`;
  if (scope.kind === 'group') return `group:${scope.group}`;
  return 'all';
}

export default function ScopeControl({ accounts, types, typesById, scope, onChange }) {
  const grouped = groupAccounts(accounts, types, typesById);
  return (
    <select className="select scope-control" aria-label="Scope"
      value={encode(scope)} onChange={(e) => onChange(decode(e.target.value))}>
      <option value="all">All accounts (household)</option>
      <optgroup label="By account">
        {(accounts || []).map(a => <option key={a.id} value={`account:${a.id}`}>{a.name}</option>)}
      </optgroup>
      <optgroup label="By group">
        {grouped.map(g => <option key={g.group} value={`group:${g.group}`}>{g.group}</option>)}
      </optgroup>
    </select>
  );
}

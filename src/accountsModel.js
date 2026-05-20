// src/accountsModel.js

// Account type registry. `klass` drives net-worth inclusion; `layout` drives
// which register columns render; `group` is the sidebar section header.
export const ACCOUNT_TYPES = {
  bank:        { label: 'Bank / Cash',       klass: 'asset',     layout: 'bank',    group: 'Cash & Bank' },
  investment:  { label: 'Investments',       klass: 'asset',     layout: 'compact', group: 'Investments' },
  credit_card: { label: 'Credit card',       klass: 'liability', layout: 'compact', group: 'Credit cards & loans' },
  loan:        { label: 'Loan',              klass: 'liability', layout: 'compact', group: 'Credit cards & loans' },
  mortgage:    { label: 'Mortgage',          klass: 'liability', layout: 'compact', group: 'Credit cards & loans' },
  person:      { label: 'Person / External', klass: 'offsheet',  layout: 'compact', group: 'People & external' },
  untyped:     { label: 'Unassigned',        klass: 'offsheet',  layout: 'compact', group: 'Unassigned' },
};

export const GROUP_ORDER = [
  'Cash & Bank', 'Investments', 'Credit cards & loans', 'People & external', 'Unassigned',
];

const typeOrFallback = (type) => ACCOUNT_TYPES[type] || ACCOUNT_TYPES.untyped;

export function accountClass(type) { return typeOrFallback(type).klass; }
export function layoutFor(type)    { return typeOrFallback(type).layout; }
export function groupFor(type)     { return typeOrFallback(type).group; }

export function isOnBalanceSheet(type) {
  const k = accountClass(type);
  return k === 'asset' || k === 'liability';
}

// Flow → sign of the balance delta. Income raises the holding account; expense
// and savings lower it. Used by migration and the transaction editor to convert
// a magnitude + category flow into a signed `amount`.
export function flowSign(flow) {
  return flow === 'income' ? 1 : -1;
}

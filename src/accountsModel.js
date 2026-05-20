// src/accountsModel.js

// Default (built-in) account types as an ordered array — the seed for
// useAccountTypes. `klass` drives net-worth inclusion; `layout` drives register
// columns; `group` is the sidebar section header. Ids are stable so existing
// accounts (which store `type: '<id>'`) keep resolving.
export const DEFAULT_ACCOUNT_TYPES = [
  { id: 'bank',        label: 'Bank / Cash',       klass: 'asset',     layout: 'bank',    group: 'Cash & Bank',          icon: '🏦', builtin: true },
  { id: 'investment',  label: 'Investments',       klass: 'asset',     layout: 'compact', group: 'Investments',          icon: '📈', builtin: true },
  { id: 'credit_card', label: 'Credit card',       klass: 'liability', layout: 'compact', group: 'Credit cards & loans', icon: '💳', builtin: true },
  { id: 'loan',        label: 'Loan',              klass: 'liability', layout: 'compact', group: 'Credit cards & loans', icon: '🏷️', builtin: true },
  { id: 'mortgage',    label: 'Mortgage',          klass: 'liability', layout: 'compact', group: 'Credit cards & loans', icon: '🏠', builtin: true },
  { id: 'person',      label: 'Person / External', klass: 'offsheet',  layout: 'compact', group: 'People & external',    icon: '👤', builtin: true },
  { id: 'untyped',     label: 'Unassigned',        klass: 'offsheet',  layout: 'compact', group: 'Unassigned',           icon: '🏦', builtin: true },
];

// Returned for any account whose type id is not in the registry (e.g. a deleted
// type). Keeps balances and layout safe.
const FALLBACK_TYPE = { id: 'untyped', label: 'Unassigned', klass: 'offsheet', layout: 'compact', group: 'Unassigned', icon: '🏦', builtin: true };

export const DEFAULT_ACCOUNT_TYPES_BY_ID = new Map(DEFAULT_ACCOUNT_TYPES.map(t => [t.id, t]));

// Back-compat exports (built-in registry as an object + fixed group order).
export const ACCOUNT_TYPES = Object.fromEntries(DEFAULT_ACCOUNT_TYPES.map(t => [t.id, t]));

const resolveType = (typeId, typesById) =>
  (typesById || DEFAULT_ACCOUNT_TYPES_BY_ID).get(typeId) || FALLBACK_TYPE;

export function accountClass(typeId, typesById) { return resolveType(typeId, typesById).klass; }
export function layoutFor(typeId, typesById)    { return resolveType(typeId, typesById).layout; }
export function groupFor(typeId, typesById)     { return resolveType(typeId, typesById).group; }

export function isOnBalanceSheet(typeId, typesById) {
  const k = accountClass(typeId, typesById);
  return k === 'asset' || k === 'liability';
}

// Sidebar group order, derived from the types array: first-seen order, with the
// fallback group ('Unassigned') always present and last.
export function groupOrder(types) {
  const FALLBACK_GROUP = 'Unassigned';
  const seen = [];
  for (const t of types || []) {
    if (t && t.group && t.group !== FALLBACK_GROUP && !seen.includes(t.group)) seen.push(t.group);
  }
  return [...seen, FALLBACK_GROUP];
}

export const GROUP_ORDER = groupOrder(DEFAULT_ACCOUNT_TYPES);

// Flow → sign of the balance delta. Income raises the holding account; expense
// and savings lower it. Used by migration and the transaction editor to convert
// a magnitude + category flow into a signed `amount`.
export function flowSign(flow) {
  return flow === 'income' ? 1 : -1;
}

const opening = (account) =>
  Number.isFinite(account && account.openingBalance) ? account.openingBalance : 0;

export function accountBalance(account, transactions) {
  let bal = opening(account);
  for (const t of transactions || []) {
    if (t && t.accountId === account.id && Number.isFinite(t.amount)) bal += t.amount;
  }
  return bal;
}

// Transactions for one account, sorted oldest→newest (date asc; array order for
// same-day ties), each annotated with the running balance after it. Reverse for
// newest-first display.
export function computeRegister(account, transactions) {
  const mine = (transactions || [])
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t && t.accountId === account.id);
  mine.sort((a, b) => {
    const da = a.t.date || '', db = b.t.date || '';
    if (da !== db) return da < db ? -1 : 1;
    return a.i - b.i;
  });
  let bal = opening(account);
  return mine.map(({ t }) => {
    bal += Number.isFinite(t.amount) ? t.amount : 0;
    return { ...t, balance: bal };
  });
}

// Household roll-ups. netWorth = Σ on-balance-sheet balances; assets = Σ asset
// balances; owed = Σ |negative liability balances|. person/untyped excluded.
export function householdTotals(accounts, transactions, typesById) {
  let netWorth = 0, assets = 0, owed = 0;
  for (const a of accounts || []) {
    const k = accountClass(a.type, typesById);
    if (k === 'asset') {
      const b = accountBalance(a, transactions);
      assets += b; netWorth += b;
    } else if (k === 'liability') {
      const b = accountBalance(a, transactions);
      owed += Math.abs(Math.min(0, b)); netWorth += b;
    }
  }
  return { netWorth, assets, owed };
}

// Filter register rows by search term, month (YYYY-MM), and/or categoryId.
// Search matches description, payee, category name, or (approx) amount.
export function filterTransactions(rows, { search = '', month = null, categoryId = null } = {}, categoriesById = null) {
  const term = (search || '').trim().toLowerCase();
  const num = parseFloat(term);
  return (rows || []).filter(r => {
    if (month && (r.date || '').slice(0, 7) !== month) return false;
    if (categoryId && r.categoryId !== categoryId) return false;
    if (!term) return true;
    if ((r.description || '').toLowerCase().includes(term)) return true;
    if ((r.payee || '').toLowerCase().includes(term)) return true;
    const cat = categoriesById && categoriesById.get(r.categoryId);
    if (cat && (cat.name || '').toLowerCase().includes(term)) return true;
    if (Number.isFinite(num) && Math.abs(Math.abs(r.amount || 0) - Math.abs(num)) < 0.01) return true;
    return false;
  });
}

// Reorder already-computed register rows by one column. Pure; returns a new
// array; stable (ties fall back to the input's chronological order). Each row's
// `balance` is left untouched — sorting never recomputes the running balance.
export function sortRows(rows, { key = 'date', dir = 'desc' } = {}, categoriesById = null) {
  const indexed = (rows || []).map((r, i) => ({ r, i }));

  const compare = (a, b) => {
    let cmp;
    if (key === 'amount' || key === 'balance') {
      const na = Number.isFinite(a[key]) ? a[key] : 0;
      const nb = Number.isFinite(b[key]) ? b[key] : 0;
      cmp = na - nb;
    } else {
      let sa, sb;
      if (key === 'category') {
        const ca = categoriesById && categoriesById.get(a.categoryId);
        const cb = categoriesById && categoriesById.get(b.categoryId);
        sa = (ca && ca.name ? ca.name : '').toLowerCase();
        sb = (cb && cb.name ? cb.name : '').toLowerCase();
      } else if (key === 'payee' || key === 'checkNumber' || key === 'description') {
        sa = (a[key] || '').toLowerCase();
        sb = (b[key] || '').toLowerCase();
      } else { // 'date' (default)
        sa = a.date || '';
        sb = b.date || '';
      }
      if (sa === sb) cmp = 0;
      else if (sa === '') cmp = 1;   // empty/missing sorts last when ascending
      else if (sb === '') cmp = -1;
      else cmp = sa < sb ? -1 : 1;
    }
    return cmp;
  };

  indexed.sort((a, b) => {
    let cmp = compare(a.r, b.r);
    if (cmp === 0) cmp = a.i - b.i; // stable tie-break on chronological index
    return dir === 'asc' ? cmp : -cmp;
  });
  return indexed.map(({ r }) => r);
}

// A transfer is a pair of transactions sharing one transferId. transferCounterpart
// returns the OTHER leg (different id), or null when leg isn't a transfer / has no
// resolvable partner (e.g. its partner's account was deleted → orphan).
export function transferCounterpart(leg, transactions) {
  if (!leg || !leg.transferId) return null;
  return (transactions || []).find(t => t && t.transferId === leg.transferId && t.id !== leg.id) || null;
}

// Display info for a transfer leg: the counterpart account's name and the direction
// (out = money left this account → '→'; in = money arrived → '←'). null when the leg
// is not a resolvable transfer or the counterpart account is missing → caller renders
// it as a plain row.
export function transferInfo(leg, transactions, accountsById, typesById) {
  const partner = transferCounterpart(leg, transactions);
  if (!partner) return null;
  const acct = accountsById && accountsById.get(partner.accountId);
  if (!acct) return null;
  return {
    counterpartName: acct.name,
    direction: (Number.isFinite(leg.amount) && leg.amount < 0) ? 'out' : 'in',
    counterpartClass: accountClass(acct.type, typesById),
  };
}

// The resolved pair for the editor / row-click branching: { transferId, fromLeg, toLeg }
// where fromLeg is the negative (source) leg and toLeg the positive (destination) leg.
// null when leg is not a resolvable transfer.
export function resolveTransfer(leg, transactions) {
  const partner = transferCounterpart(leg, transactions);
  if (!partner) return null;
  const fromLeg = (Number.isFinite(leg.amount) && leg.amount < 0) ? leg : partner;
  const toLeg   = fromLeg === leg ? partner : leg;
  return { transferId: leg.transferId, fromLeg, toLeg };
}

// Accounts bucketed by their type group, in groupOrder(types) order, empty groups
// omitted. Used by the transfer pickers to render <optgroup> sections.
export function groupAccounts(accounts, types, typesById) {
  const order = groupOrder(types);
  const byGroup = new Map(order.map(g => [g, []]));
  for (const a of accounts || []) {
    const g = groupFor(a.type, typesById);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(a);
  }
  return [...byGroup.entries()].filter(([, list]) => list.length > 0).map(([group, list]) => ({ group, accounts: list }));
}

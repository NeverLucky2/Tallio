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
export function householdTotals(accounts, transactions) {
  let netWorth = 0, assets = 0, owed = 0;
  for (const a of accounts || []) {
    const k = accountClass(a.type);
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

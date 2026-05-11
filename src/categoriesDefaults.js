export const OTHER_CATEGORY_NAME = 'Other';
export const OTHER_INCOME_CATEGORY_NAME = 'Other Income';

// Seed expense-flow categories. Inverts the per-category keyword mapping from
// the original autoCategorizeTx in App.jsx so that the longest-match
// auto-categorizer behaves identically to today on first load.
export const DEFAULT_CATEGORIES = [
  { name: 'Utilities',      icon: '⚡',  color: '#F59E0B', flow: 'expense', keywords: [], templates: [], builtin: true },
  { name: 'Groceries',      icon: '🛒', color: '#10B981', flow: 'expense', keywords: [], templates: [], builtin: true },
  { name: 'Healthcare',     icon: '💊', color: '#EF4444', flow: 'expense', keywords: [], templates: [], builtin: true },
  { name: 'Fitness',        icon: '🧗', color: '#84CC16', flow: 'expense', keywords: [
    'FIRST ASCENT', 'GYM', 'FITNESS', 'CLIMBING', 'CROSSFIT', 'YOGA', 'PILATES',
  ], templates: [], builtin: true },
  { name: 'Insurance',      icon: '🛡️', color: '#6366F1', flow: 'expense', keywords: [], templates: [], builtin: true },
  { name: 'Entertainment',  icon: '🎬', color: '#EC4899', flow: 'expense', keywords: [
    'BOWLERO', 'WHITE CASTLE', 'ENTERTAINMENT',
  ], templates: [], builtin: true },
  { name: 'Transportation', icon: '🚗', color: '#8B5CF6', flow: 'expense', keywords: [
    'GAS', 'SHELL', 'BP', 'EXXON',
  ], templates: [], builtin: true },
  { name: 'Dining',         icon: '🍽️', color: '#F97316', flow: 'expense', keywords: [
    'MCDONALD', 'KFC', 'POPEYES', 'KRISPY', 'RESTAURANT', 'CHINESE',
    "SHARK'S FISH", "HOY'S",
  ], templates: [], builtin: true },
  { name: 'Shopping',       icon: '🛍️', color: '#14B8A6', flow: 'expense', keywords: [
    'WAL-MART', 'WALMART', 'TARGET', 'EBAY', 'TEMU', 'AMAZON',
    'HOME DEPOT', 'LOWES',
  ], templates: [], builtin: true },
  { name: 'Subscriptions',  icon: '📱', color: '#3B82F6', flow: 'expense', keywords: [
    'CLAUDE.AI', 'SUBSCRIPTION', 'NETFLIX',
  ], templates: [], builtin: true },
  { name: 'Parking',        icon: '🅿️', color: '#64748B', flow: 'expense', keywords: [
    'LOT A', 'PARKING', 'PAY ON FOOT',
  ], templates: [], builtin: true },
  { name: 'Donations',      icon: '🙏', color: '#e879a0', flow: 'expense', keywords: [
    'CHURCH', 'CHRISTIAN', 'CHAPEL', 'MINISTRY', 'MINISTRIES', 'MISSION',
    'SALVATION ARMY', 'GOODWILL', 'HABITAT', 'RED CROSS', 'DONATION',
    'TITHE', 'PARISH', 'DIOCESE', 'SYNAGOGUE', 'MOSQUE', 'TEMPLE',
    'CHARITY', 'FOUNDATION', 'NONPROFIT', 'NON-PROFIT',
  ], templates: [], builtin: true },
  { name: 'Taxes',          icon: '🏛', color: '#EAB308', flow: 'expense', keywords: [
    'FEDERAL TAX', 'STATE TAX', 'FICA', 'SOCIAL SECURITY', 'MEDICARE',
    'TAX WITHHOLDING', 'WITHHOLDING',
  ], templates: [], builtin: true },
  { name: OTHER_CATEGORY_NAME, icon: '📋', color: '#6B7280', flow: 'expense', keywords: [], templates: [], builtin: true },
];

// Seed categories added during v2 → v3 migration. Income flow + Savings flow.
// Appended to the existing category list; skipped if a category with the same
// name already exists (so users who pre-created "Paycheck" aren't duplicated).
export const V3_SEED_CATEGORIES = [
  { name: 'Paycheck',           icon: '💼', color: '#6BD49A', flow: 'income',  keywords: [
    'PAYCHECK', 'SALARY', 'PAYROLL', 'DIRECT DEPOSIT', 'GROSS PAY',
  ], templates: [], builtin: true },
  { name: 'Zelle In',           icon: '💸', color: '#34D399', flow: 'income',  keywords: ['ZELLE FROM'], templates: [], builtin: true },
  { name: 'Dividends',          icon: '📈', color: '#22D3EE', flow: 'income',  keywords: ['DIVIDEND', 'DIV'], templates: [], builtin: true },
  { name: 'Bank Interest',      icon: '🏦', color: '#0EA5E9', flow: 'income',  keywords: ['INTEREST EARNED', 'INTEREST CREDIT'], templates: [], builtin: true },
  { name: 'Cashback',           icon: '🎁', color: '#A3E635', flow: 'income',  keywords: ['CASHBACK', 'CASH BACK', 'REWARDS', 'REWARD REDEMPTION'], templates: [], builtin: true },
  { name: 'Tax Refund',         icon: '💰', color: '#FBBF24', flow: 'income',  keywords: ['TAX REFUND', 'IRS REFUND', 'STATE REFUND'], templates: [], builtin: true },
  { name: 'Reimbursement',      icon: '🔁', color: '#67E8F9', flow: 'income',  keywords: ['REIMBURSEMENT', 'EXPENSE REIMB'], templates: [], builtin: true },
  { name: OTHER_INCOME_CATEGORY_NAME, icon: '📥', color: '#94A3B8', flow: 'income',  keywords: [], templates: [], builtin: true },
  { name: '401(k)',             icon: '📊', color: '#5B8DFF', flow: 'savings', keywords: ['401K', '401(K)'], templates: [], builtin: true },
  { name: 'Roth IRA',           icon: '🌱', color: '#7C3AED', flow: 'savings', keywords: ['ROTH', 'ROTH IRA'], templates: [], builtin: true },
  { name: 'Brokerage Transfer', icon: '📈', color: '#4F46E5', flow: 'savings', keywords: ['BROKERAGE', 'INVESTMENT TRANSFER'], templates: [], builtin: true },
  { name: 'Cash Savings',       icon: '🪙', color: '#06B6D4', flow: 'savings', keywords: ['SAVINGS DEPOSIT', 'TRANSFER TO SAVINGS'], templates: [], builtin: true },
  { name: 'Loans Lent',         icon: '🤝', color: '#9333EA', flow: 'savings', keywords: ['LOAN OUT', 'LENT TO'], templates: [], builtin: true },
];

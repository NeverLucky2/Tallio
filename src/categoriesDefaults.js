export const OTHER_CATEGORY_NAME = 'Other';

// Seed categories. Inverts the per-category keyword mapping from the original
// autoCategorizeTx in App.jsx so that the longest-match auto-categorizer
// behaves identically to today on first load.
export const DEFAULT_CATEGORIES = [
  { name: 'Utilities',      icon: '⚡',  color: '#F59E0B', keywords: [], templates: [], builtin: true },
  { name: 'Groceries',      icon: '🛒', color: '#10B981', keywords: [], templates: [], builtin: true },
  { name: 'Healthcare',     icon: '💊', color: '#EF4444', keywords: [], templates: [], builtin: true },
  { name: 'Fitness',        icon: '🧗', color: '#84CC16', keywords: [
    'FIRST ASCENT', 'GYM', 'FITNESS', 'CLIMBING', 'CROSSFIT', 'YOGA', 'PILATES',
  ], templates: [], builtin: true },
  { name: 'Insurance',      icon: '🛡️', color: '#6366F1', keywords: [], templates: [], builtin: true },
  { name: 'Entertainment',  icon: '🎬', color: '#EC4899', keywords: [
    'BOWLERO', 'WHITE CASTLE', 'ENTERTAINMENT',
  ], templates: [], builtin: true },
  { name: 'Transportation', icon: '🚗', color: '#8B5CF6', keywords: [
    'GAS', 'SHELL', 'BP', 'EXXON',
  ], templates: [], builtin: true },
  { name: 'Dining',         icon: '🍽️', color: '#F97316', keywords: [
    'MCDONALD', 'KFC', 'POPEYES', 'KRISPY', 'RESTAURANT', 'CHINESE',
    "SHARK'S FISH", "HOY'S",
  ], templates: [], builtin: true },
  { name: 'Shopping',       icon: '🛍️', color: '#14B8A6', keywords: [
    'WAL-MART', 'WALMART', 'TARGET', 'EBAY', 'TEMU', 'AMAZON',
    'HOME DEPOT', 'LOWES',
  ], templates: [], builtin: true },
  { name: 'Subscriptions',  icon: '📱', color: '#3B82F6', keywords: [
    'CLAUDE.AI', 'SUBSCRIPTION', 'NETFLIX',
  ], templates: [], builtin: true },
  { name: 'Parking',        icon: '🅿️', color: '#64748B', keywords: [
    'LOT A', 'PARKING', 'PAY ON FOOT',
  ], templates: [], builtin: true },
  { name: 'Donations',      icon: '🙏', color: '#e879a0', keywords: [
    'CHURCH', 'CHRISTIAN', 'CHAPEL', 'MINISTRY', 'MINISTRIES', 'MISSION',
    'SALVATION ARMY', 'GOODWILL', 'HABITAT', 'RED CROSS', 'DONATION',
    'TITHE', 'PARISH', 'DIOCESE', 'SYNAGOGUE', 'MOSQUE', 'TEMPLE',
    'CHARITY', 'FOUNDATION', 'NONPROFIT', 'NON-PROFIT',
  ], templates: [], builtin: true },
  { name: OTHER_CATEGORY_NAME, icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: true },
];

// Presentation helper: group categories into ordered, alphabetically-sorted
// sections by flow for display in pickers and the manage screen.

const FLOW_ORDER = ['income', 'expense', 'savings', 'transfer'];
const FLOW_LABELS = { income: 'Income', expense: 'Expense', savings: 'Savings', transfer: 'Transfer' };

// Returns [{ flow, label, items }] for non-empty groups only, in FLOW_ORDER,
// with each group's items sorted A→Z (case-insensitive) by name. A category
// with no `flow` is treated as 'expense'.
export function groupCategoriesByFlow(categories) {
  const list = Array.isArray(categories) ? categories : [];
  return FLOW_ORDER
    .map(flow => ({
      flow,
      label: FLOW_LABELS[flow],
      items: list
        .filter(c => c && (c.flow || 'expense') === flow)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    }))
    .filter(group => group.items.length > 0);
}

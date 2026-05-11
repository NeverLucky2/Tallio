import { getItemDate } from './spendingMath.js';

const FALLBACK = { name: 'Other', icon: '📋', color: '#6B7280', templates: [] };

function lookup(categories, categoryId, fallbackId) {
  const found = categories.find(c => c.id === categoryId);
  if (found) return found;
  const fallback = categories.find(c => c.id === fallbackId);
  return fallback || FALLBACK;
}

function TemplateChips({ templates, item, onUpdate }) {
  if (!templates || templates.length === 0) return null;
  return (
    <div className="item-template-chips">
      {templates.map(t => (
        <button
          key={t}
          type="button"
          className="template-chip"
          onClick={() => onUpdate({ ...item, description: t })}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function CreditToggle({ item, onUpdate, active }) {
  return (
    <button
      type="button"
      className={`credit-toggle${active ? ' credit-toggle-active' : ''}`}
      onClick={() => onUpdate({ ...item, amount: -item.amount })}
      aria-pressed={active}
      aria-label={active ? 'Refund / credit (click to mark as charge)' : 'Charge (click to mark as refund / credit)'}
      title={active ? 'Refund / credit (click to remove)' : 'Mark as refund / credit'}
    >
      {active ? '−' : '+'}
    </button>
  );
}

function groupCategoriesByFlow(categories) {
  const groups = { income: [], expense: [], savings: [] };
  for (const c of categories) {
    const flow = c.flow || 'expense';
    if (groups[flow]) groups[flow].push(c);
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => a.name.localeCompare(b.name));
  }
  return groups;
}

function CategorySelect({ value, onChange, categories }) {
  const groups = groupCategoriesByFlow(categories);
  return (
    <select value={value} onChange={onChange} className="select">
      {groups.income.length > 0 && (
        <optgroup label="Income">
          {groups.income.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}
        </optgroup>
      )}
      {groups.expense.length > 0 && (
        <optgroup label="Expense">
          {groups.expense.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}
        </optgroup>
      )}
      {groups.savings.length > 0 && (
        <optgroup label="Savings">
          {groups.savings.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}
        </optgroup>
      )}
    </select>
  );
}

export default function BillItem({ item, bill, categories, otherCategoryId, onUpdate, onDelete, isMobile }) {
  const category = lookup(categories, item.categoryId, otherCategoryId);
  const itemDate = item.date || getItemDate(bill, item);
  const isCredit = Number.isFinite(item.amount) && item.amount < 0;

  if (isMobile) {
    return (
      <div className={`item-row-mobile${isCredit ? ' item-row-mobile-credit' : ''}`}>
        <div className="item-row-mobile-top">
          <div className="item-row-mobile-top-left">
            <div
              className="item-icon"
              style={{ background: `${category.color}18`, border: `1px solid ${category.color}28` }}
            >
              {category.icon}
            </div>
            <textarea
              value={item.description}
              onChange={(e) => onUpdate({ ...item, description: e.target.value })}
              className="input-transparent description-textarea"
              placeholder="Description"
              rows={1}
            />
          </div>
          <button className="btn-delete" onClick={onDelete}>×</button>
        </div>
        <div className="item-row-mobile-bottom">
          <input
            type="date"
            value={itemDate}
            onChange={(e) => onUpdate({ ...item, date: e.target.value })}
            className="input item-date"
            style={{ width: '140px', flexShrink: 0 }}
          />
          <CategorySelect
            value={item.categoryId}
            onChange={(e) => onUpdate({ ...item, categoryId: e.target.value })}
            categories={categories}
          />
          <CreditToggle item={item} onUpdate={onUpdate} active={isCredit} />
          <div className="input-amount-wrap" style={{ width: '110px', flexShrink: 0 }}>
            <span className="input-amount-prefix">$</span>
            <input
              type="number"
              value={item.amount}
              onChange={(e) => onUpdate({ ...item, amount: parseFloat(e.target.value) || 0 })}
              className="input-amount"
              step="0.01"
            />
          </div>
        </div>
        <TemplateChips templates={category.templates} item={item} onUpdate={onUpdate} />
      </div>
    );
  }

  return (
    <>
      <div className={`item-row${isCredit ? ' item-row-credit' : ''}`}>
        <div
          className="item-icon"
          style={{ background: `${category.color}18`, border: `1px solid ${category.color}28` }}
        >
          {category.icon}
        </div>
        <input
          type="date"
          value={itemDate}
          onChange={(e) => onUpdate({ ...item, date: e.target.value })}
          className="input item-date"
        />
        <CategorySelect
          value={item.categoryId}
          onChange={(e) => onUpdate({ ...item, categoryId: e.target.value })}
          categories={categories}
        />
        <textarea
          value={item.description}
          onChange={(e) => onUpdate({ ...item, description: e.target.value })}
          className="input-transparent description-textarea"
          placeholder="Description"
          rows={1}
        />
        <CreditToggle item={item} onUpdate={onUpdate} active={isCredit} />
        <div className="input-amount-wrap">
          <span className="input-amount-prefix">$</span>
          <input
            type="number"
            value={item.amount}
            onChange={(e) => onUpdate({ ...item, amount: parseFloat(e.target.value) || 0 })}
            className="input-amount"
            step="0.01"
          />
        </div>
        <button className="btn-delete" onClick={onDelete}>×</button>
      </div>
      <TemplateChips templates={category.templates} item={item} onUpdate={onUpdate} />
    </>
  );
}

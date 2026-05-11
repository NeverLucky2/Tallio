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

export default function BillItem({ item, bill, categories, otherCategoryId, onUpdate, onDelete, isMobile }) {
  const category = lookup(categories, item.categoryId, otherCategoryId);
  const itemDate = item.date || getItemDate(bill, item);

  if (isMobile) {
    return (
      <div className="item-row-mobile">
        <div className="item-row-mobile-top">
          <div className="item-row-mobile-top-left">
            <div
              className="item-icon"
              style={{ background: `${category.color}18`, border: `1px solid ${category.color}28` }}
            >
              {category.icon}
            </div>
            <input
              type="text"
              value={item.description}
              onChange={(e) => onUpdate({ ...item, description: e.target.value })}
              className="input-transparent"
              placeholder="Description"
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
          <select
            value={item.categoryId}
            onChange={(e) => onUpdate({ ...item, categoryId: e.target.value })}
            className="select"
          >
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
            ))}
          </select>
          <div className="input-amount-wrap" style={{ width: '110px', flexShrink: 0 }}>
            <span className="input-amount-prefix">$</span>
            <input
              type="number"
              value={item.amount}
              onChange={(e) => onUpdate({ ...item, amount: parseFloat(e.target.value) || 0 })}
              className="input-amount"
              step="0.01"
              min="0"
            />
          </div>
        </div>
        <TemplateChips templates={category.templates} item={item} onUpdate={onUpdate} />
      </div>
    );
  }

  return (
    <>
      <div className="item-row">
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
        <select
          value={item.categoryId}
          onChange={(e) => onUpdate({ ...item, categoryId: e.target.value })}
          className="select"
        >
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
          ))}
        </select>
        <input
          type="text"
          value={item.description}
          onChange={(e) => onUpdate({ ...item, description: e.target.value })}
          className="input-transparent"
          placeholder="Description"
        />
        <div className="input-amount-wrap">
          <span className="input-amount-prefix">$</span>
          <input
            type="number"
            value={item.amount}
            onChange={(e) => onUpdate({ ...item, amount: parseFloat(e.target.value) || 0 })}
            className="input-amount"
            step="0.01"
            min="0"
          />
        </div>
        <button className="btn-delete" onClick={onDelete}>×</button>
      </div>
      <TemplateChips templates={category.templates} item={item} onUpdate={onUpdate} />
    </>
  );
}

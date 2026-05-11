import { useState } from 'react';

export const CURATED_ICONS = [
  '⚡', '🛒', '💊', '🧗', '🛡️', '🎬', '🚗', '🍽️', '🛍️', '📱',
  '🅿️', '🙏', '📋', '💰', '🏠', '✈️', '🎮', '📚', '🎓', '👶',
  '🐾', '🏥', '💼', '🎁', '🍷', '☕', '🧾', '💡', '🔧', '🌱',
];

export default function IconPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const submit = () => {
    const v = draft.trim();
    if (v) {
      onChange(v);
      setDraft('');
      setOpen(false);
    }
  };

  return (
    <div className="picker">
      <button
        type="button"
        className="picker-trigger"
        aria-label="Icon picker"
        onClick={() => setOpen(o => !o)}
      >
        {value} ▾
      </button>
      {open && (
        <div className="picker-popover">
          <div className="picker-grid">
            {CURATED_ICONS.map(icon => (
              <button
                key={icon}
                type="button"
                className="picker-cell"
                onClick={() => { onChange(icon); setOpen(false); }}
              >
                {icon}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="picker-input"
            placeholder="Or paste any emoji"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          />
        </div>
      )}
    </div>
  );
}

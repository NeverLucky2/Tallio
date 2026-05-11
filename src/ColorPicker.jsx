import { useState } from 'react';

export const CURATED_COLORS = [
  '#F59E0B', '#10B981', '#EF4444', '#84CC16', '#6366F1', '#EC4899',
  '#8B5CF6', '#F97316', '#14B8A6', '#3B82F6', '#64748B', '#E879A0',
];

const HEX_RE = /^#[0-9a-f]{6}$/i;

export default function ColorPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const submit = () => {
    const v = draft.trim();
    if (HEX_RE.test(v)) {
      onChange(v.toUpperCase());
      setDraft('');
      setOpen(false);
    }
  };

  return (
    <div className="picker">
      <button
        type="button"
        className="picker-trigger"
        aria-label="Color picker"
        onClick={() => setOpen(o => !o)}
      >
        <span className="picker-swatch-mini" style={{ background: value }} />
        {value} ▾
      </button>
      {open && (
        <div className="picker-popover">
          <div className="picker-swatches">
            {CURATED_COLORS.map(color => (
              <button
                key={color}
                type="button"
                aria-label={`swatch ${color}`}
                className="picker-swatch"
                style={{ background: color }}
                onClick={() => { onChange(color); setOpen(false); }}
              />
            ))}
          </div>
          <input
            type="text"
            className="picker-input"
            placeholder="Or hex e.g. #112233"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          />
        </div>
      )}
    </div>
  );
}

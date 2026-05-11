import { useState } from 'react';

export default function ChipEditor({ values, onAdd, onRemove, placeholder }) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft('');
  };

  return (
    <div className="chip-editor">
      {(values || []).map(v => (
        <span key={v} className="chip">
          {v}
          <button
            type="button"
            className="chip-remove"
            aria-label={`Remove ${v}`}
            onClick={() => onRemove(v)}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        className="chip-input"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        onBlur={(e) => {
          // Ignore focus shifts INTO another element of this chip-editor
          // (e.g. clicking a chip's × button) — those should not commit the draft.
          if (e.currentTarget.parentElement && e.currentTarget.parentElement.contains(e.relatedTarget)) {
            return;
          }
          submit();
        }}
      />
    </div>
  );
}

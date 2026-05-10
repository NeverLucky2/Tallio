# Claude Vision OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Tesseract.js OCR + regex parser with a single Claude vision API call. Receipts and credit-card statements get extracted by Claude into structured `{ vendor, date, items: [{ description, amount }] }` JSON; the client adds categories via the existing `autoCategorizeTx`.

**Architecture:** Browser-direct Anthropic SDK call (`dangerouslyAllowBrowser: true`). User pastes their own API key into a Settings modal; key + model preference live in `localStorage`. Three input paths (desktop camera, desktop file upload, phone capture) all unify under one `extractBillFromImage(imageDataUrl, { apiKey, model })` function. Drops `tesseract.js` (CDN) and `pdf.js` (CDN) entirely.

**Tech Stack:** React 19, Vite 7, `@anthropic-ai/sdk` (new), Vitest (existing), Claude Haiku 4.5 default model.

**Spec:** `docs/superpowers/specs/2026-05-09-claude-vision-ocr-design.md`

**Project root:** `bill-tracker/` — all paths in this plan are relative to that directory unless otherwise noted.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/billExtractor.js` | NEW | `extractBillFromImage` + pure helpers (parse data URL, strip markdown fences, validate response shape, map SDK errors to user strings) |
| `src/billExtractor.test.js` | NEW | Vitest unit tests for the pure helpers |
| `src/useSettings.js` | NEW | localStorage-backed hook: `{ apiKey, model, save, hasKey }` |
| `src/SettingsPanel.jsx` | NEW | Settings modal: API-key input, model dropdown, privacy line. Reuses `.pair-*` modal shell CSS. |
| `src/App.jsx` | MODIFY | Add gear button + settings mount; rewrite `handleCapture`; simplify `handleFileUpload`; remove dead Tesseract/PDF.js code |
| `src/App.css` | MODIFY | Settings-specific input/select/banner styles, gear-button style |
| `package.json` | MODIFY | Add `@anthropic-ai/sdk` |

---

## Notes Before Starting

- Currently a git repo (initialized in the prior phone-pairing project). All commits assume a working git context.
- `src/App.jsx` is currently large (~870 lines). This plan removes ~120 lines of OCR/parser code and adds ~30 lines of integration. Net shrink.
- `vitest` already configured in `vite.config.js` with `environment: 'node'`. Tests added here use the same env (pure helpers, no DOM needed).
- The phone path (`PhoneCapture.jsx`, `usePhonePeer.js`, `useDesktopPeer.js`) needs no changes. Phone sends image bytes; desktop reassembles to data URL; data URL flows into `handleCapture`. `handleCapture` is the only place that runs OCR.
- First-time UX: when no API key is set and the user clicks Scan/Upload/Pair-Phone-then-receive, capture is intercepted — Settings modal opens with a banner, user saves, then re-clicks. **No auto-resume in v1** (simpler; the banner sets expectations).

---

### Task 1: Add @anthropic-ai/sdk dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the SDK**

Run from `bill-tracker/`:
```bash
npm install @anthropic-ai/sdk
```

Expected: `package.json` updated with new entry; `package-lock.json` updated.

- [ ] **Step 2: Verify build still works**

```bash
npm run build
```

Expected: clean build, no errors. The SDK is added but not yet used.

- [ ] **Step 3: Verify tests still pass**

```bash
npm test -- --run
```

Expected: 14/14 passing.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @anthropic-ai/sdk dependency"
```

---

### Task 2: billExtractor.js with pure-helper unit tests

**Files:**
- Create: `src/billExtractor.js`
- Create: `src/billExtractor.test.js`

The pure helpers (data URL parsing, markdown-fence stripping, response shape validation, error mapping) are tested with Vitest. The wrapper function `extractBillFromImage` itself isn't unit-tested — it's an integration concern, manually exercised when wired in Task 6.

- [ ] **Step 1: Write the failing tests**

Create `src/billExtractor.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  parseDataUrl,
  stripMarkdownFences,
  validateResponse,
  mapError,
} from './billExtractor.js';

describe('parseDataUrl', () => {
  it('parses a JPEG data URL', () => {
    const result = parseDataUrl('data:image/jpeg;base64,iVBORw0KGgo=');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.base64).toBe('iVBORw0KGgo=');
  });

  it('parses a PNG data URL', () => {
    const result = parseDataUrl('data:image/png;base64,abc123');
    expect(result.mimeType).toBe('image/png');
    expect(result.base64).toBe('abc123');
  });

  it('parses a PDF data URL', () => {
    const result = parseDataUrl('data:application/pdf;base64,JVBERi0=');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.base64).toBe('JVBERi0=');
  });

  it('throws on non-data URL input', () => {
    expect(() => parseDataUrl('https://example.com/image.jpg')).toThrow();
  });

  it('throws on data URL missing base64 marker', () => {
    expect(() => parseDataUrl('data:image/jpeg,raw-bytes')).toThrow();
  });
});

describe('stripMarkdownFences', () => {
  it('strips ```json fences', () => {
    const input = '```json\n{"vendor":"Acme"}\n```';
    expect(stripMarkdownFences(input)).toBe('{"vendor":"Acme"}');
  });

  it('strips plain ``` fences', () => {
    const input = '```\n{"vendor":"Acme"}\n```';
    expect(stripMarkdownFences(input)).toBe('{"vendor":"Acme"}');
  });

  it('passes through unfenced text unchanged', () => {
    const input = '{"vendor":"Acme"}';
    expect(stripMarkdownFences(input)).toBe('{"vendor":"Acme"}');
  });

  it('handles surrounding whitespace', () => {
    const input = '  \n```json\n{"x":1}\n```\n  ';
    expect(stripMarkdownFences(input)).toBe('{"x":1}');
  });
});

describe('validateResponse', () => {
  it('accepts a complete valid object', () => {
    const result = validateResponse({
      vendor: 'Costco',
      date: '2026-05-09',
      items: [{ description: 'Eggs', amount: 4.99 }],
    });
    expect(result.vendor).toBe('Costco');
    expect(result.date).toBe('2026-05-09');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].amount).toBe(4.99);
  });

  it('accepts null vendor and date', () => {
    const result = validateResponse({
      vendor: null,
      date: null,
      items: [],
    });
    expect(result.vendor).toBeNull();
    expect(result.date).toBeNull();
    expect(result.items).toEqual([]);
  });

  it('throws when items is missing', () => {
    expect(() => validateResponse({ vendor: 'X', date: null })).toThrow();
  });

  it('throws when items is not an array', () => {
    expect(() => validateResponse({ vendor: 'X', date: null, items: 'oops' })).toThrow();
  });

  it('drops items with non-numeric amount', () => {
    const result = validateResponse({
      vendor: 'X',
      date: null,
      items: [
        { description: 'Good', amount: 5.99 },
        { description: 'Bad', amount: 'NaN' },
      ],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBe('Good');
  });

  it('drops items with negative or zero amount', () => {
    const result = validateResponse({
      vendor: 'X',
      date: null,
      items: [
        { description: 'Free sample', amount: 0 },
        { description: 'Refund', amount: -2.50 },
        { description: 'Real item', amount: 1.99 },
      ],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBe('Real item');
  });

  it('drops items with empty description', () => {
    const result = validateResponse({
      vendor: 'X',
      date: null,
      items: [
        { description: '', amount: 5.99 },
        { description: 'Real', amount: 5.99 },
      ],
    });
    expect(result.items).toHaveLength(1);
  });

  it('throws when input is not an object', () => {
    expect(() => validateResponse(null)).toThrow();
    expect(() => validateResponse('string')).toThrow();
    expect(() => validateResponse(42)).toThrow();
  });
});

describe('mapError', () => {
  it('maps 401 to invalid-key message', () => {
    const err = { status: 401, message: 'unauthorized' };
    expect(mapError(err)).toMatch(/invalid api key/i);
  });

  it('maps 429 to rate-limit message', () => {
    const err = { status: 429, message: 'rate limit' };
    expect(mapError(err)).toMatch(/rate limit/i);
  });

  it('maps 5xx to server message', () => {
    const err = { status: 503, message: 'oops' };
    expect(mapError(err)).toMatch(/anthropic/i);
  });

  it('maps connection errors to network message', () => {
    const err = { name: 'APIConnectionError', message: 'failed' };
    expect(mapError(err)).toMatch(/connection/i);
  });

  it('falls back to generic message for unknown errors', () => {
    const err = { message: 'something' };
    expect(mapError(err)).toMatch(/couldn't|could not/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run
```

Expected: All new tests FAIL with "Cannot find module './billExtractor.js'".

- [ ] **Step 3: Implement billExtractor.js**

Create `src/billExtractor.js`:
```js
import Anthropic from '@anthropic-ai/sdk';

const PROMPT = `You are extracting structured data from a bill, receipt, or credit-card statement image.

Return ONLY a JSON object matching this schema, with no surrounding prose:
{
  "vendor": string | null,
  "date": string | null,
  "items": [
    {
      "description": string,
      "amount": number
    }
  ]
}

Rules:
- Extract every line-item charge you can identify.
- Skip subtotals, totals, tax-only lines, payment/balance lines, and headers.
- For credit-card statements: each transaction is one item. Skip "PAYMENT - THANK YOU" and similar.
- If amount appears as "$12.99", "12.99", or "12,99" — normalize to 12.99.
- date should be YYYY-MM-DD if you can read one, else null.
- vendor should be the store/merchant name, null if unclear.
- If you cannot read the image at all, return {"vendor": null, "date": null, "items": []}.`;

const FENCE_RE = /^\s*```(?:json)?\s*\n?|\n?```\s*$/g;

export function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new Error('Not a data URL');
  }
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Data URL must be base64-encoded');
  return { mimeType: match[1], base64: match[2] };
}

export function stripMarkdownFences(text) {
  return text.replace(FENCE_RE, '').trim();
}

export function validateResponse(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Response is not an object');
  }
  if (!Array.isArray(parsed.items)) {
    throw new Error('Response.items must be an array');
  }
  const items = parsed.items
    .filter(it =>
      it &&
      typeof it.description === 'string' &&
      it.description.trim().length > 0 &&
      typeof it.amount === 'number' &&
      isFinite(it.amount) &&
      it.amount > 0
    )
    .map(it => ({ description: it.description.trim(), amount: it.amount }));

  return {
    vendor: typeof parsed.vendor === 'string' ? parsed.vendor : null,
    date: typeof parsed.date === 'string' ? parsed.date : null,
    items,
  };
}

export function mapError(err) {
  const status = err && err.status;
  const name = err && err.name;
  if (status === 401) return 'Invalid API key. Check Settings.';
  if (status === 429) return 'Rate limit hit. Try again in a moment.';
  if (typeof status === 'number' && status >= 500) {
    return 'Anthropic API is having trouble. Try again.';
  }
  if (name === 'APIConnectionError' || name === 'TypeError') {
    return "Couldn't reach Anthropic. Check connection.";
  }
  return "Couldn't read the receipt. Try a clearer photo.";
}

export async function extractBillFromImage(imageDataUrl, { apiKey, model }) {
  const { mimeType, base64 } = parseDataUrl(imageDataUrl);
  const isPdf = mimeType === 'application/pdf';

  const sourceBlock = isPdf
    ? {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      }
    : {
        type: 'image',
        source: { type: 'base64', media_type: mimeType, data: base64 },
      };

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  let message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [sourceBlock, { type: 'text', text: PROMPT }],
        },
      ],
    });
  } catch (err) {
    throw new Error(mapError(err));
  }

  const text = (message.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  const stripped = stripMarkdownFences(text);

  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error("Couldn't read the receipt. Try a clearer photo.");
  }

  return validateResponse(parsed);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run
```

Expected: All tests PASS — should be 14 (existing peerProtocol) + ~24 (new billExtractor) = ~38 total.

- [ ] **Step 5: Commit**

```bash
git add src/billExtractor.js src/billExtractor.test.js
git commit -m "feat: add billExtractor with Claude vision API + pure helpers + tests"
```

---

### Task 3: useSettings hook

**Files:**
- Create: `src/useSettings.js`

Small localStorage-backed hook. No tests — testing localStorage round-trip would require reinstalling jsdom and adds little value for ~30 lines of straightforward read/write.

- [ ] **Step 1: Create useSettings.js**

Create `src/useSettings.js`:
```js
import { useState, useCallback } from 'react';

const KEY_STORAGE = 'billtracker-anthropic-key';
const MODEL_STORAGE = 'billtracker-anthropic-model';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

function loadInitial() {
  if (typeof window === 'undefined') return { apiKey: '', model: DEFAULT_MODEL };
  try {
    return {
      apiKey: window.localStorage.getItem(KEY_STORAGE) || '',
      model: window.localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL,
    };
  } catch {
    return { apiKey: '', model: DEFAULT_MODEL };
  }
}

export default function useSettings() {
  const [state, setState] = useState(loadInitial);

  const save = useCallback(({ apiKey, model } = {}) => {
    setState((prev) => {
      const next = {
        apiKey: apiKey !== undefined ? apiKey : prev.apiKey,
        model: model !== undefined ? model : prev.model,
      };
      try {
        if (apiKey !== undefined) window.localStorage.setItem(KEY_STORAGE, next.apiKey);
        if (model !== undefined) window.localStorage.setItem(MODEL_STORAGE, next.model);
      } catch {
        // ignore quota / privacy-mode errors; in-memory state still updates
      }
      return next;
    });
  }, []);

  return {
    apiKey: state.apiKey,
    model: state.model,
    hasKey: state.apiKey.startsWith('sk-ant-'),
    save,
  };
}
```

- [ ] **Step 2: Verify compile**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Tests still pass**

```bash
npm test -- --run
```

Expected: same count as after Task 2 (no new tests added in this task).

- [ ] **Step 4: Commit**

```bash
git add src/useSettings.js
git commit -m "feat: add useSettings hook (localStorage-backed apiKey + model)"
```

---

### Task 4: SettingsPanel component

**Files:**
- Create: `src/SettingsPanel.jsx`
- Modify: `src/App.css` (append styles)

- [ ] **Step 1: Create SettingsPanel.jsx**

Create `src/SettingsPanel.jsx`:
```jsx
import React, { useEffect, useState } from 'react';

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', cost: '~$0.005/receipt' },
  { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6', cost: '~$0.025/receipt' },
  { id: 'claude-opus-4-7',           label: 'Opus 4.7',   cost: '~$0.10/receipt' },
];

function maskKey(key) {
  if (!key) return '';
  if (key.length < 8) return key;
  const tail = key.slice(-4);
  return `sk-ant-•••••…${tail}`;
}

export default function SettingsPanel({ settings, onClose, banner }) {
  const { apiKey, model, save } = settings;
  const [draftKey, setDraftKey] = useState(apiKey);
  const [draftModel, setDraftModel] = useState(model);
  const [editing, setEditing] = useState(!apiKey);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isValid = draftKey.startsWith('sk-ant-');
  const dirty = draftKey !== apiKey || draftModel !== model;

  // Save commits the draft AND closes. Done closes without committing.
  const handleSave = () => {
    save({ apiKey: draftKey, model: draftModel });
    onClose();
  };

  return (
    <div className="pair-overlay" onClick={onClose}>
      <div
        className="pair-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pair-header">
          <h2 id="settings-title" className="pair-title">Settings</h2>
          <button className="pair-close" aria-label="Close settings" onClick={onClose}>×</button>
        </div>

        <div className="pair-body settings-body">
          {banner && <div className="settings-banner">{banner}</div>}

          <label className="settings-label" htmlFor="settings-key">Anthropic API Key</label>
          {editing ? (
            <input
              id="settings-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="sk-ant-..."
              className="settings-input"
            />
          ) : (
            <div className="settings-key-row">
              <code className="settings-key-mask">{maskKey(apiKey)}</code>
              <button className="btn" onClick={() => { setDraftKey(''); setEditing(true); }}>Edit</button>
            </div>
          )}
          <p className="settings-help">
            Get a key at console.anthropic.com → Settings → API Keys
          </p>

          <label className="settings-label" htmlFor="settings-model">Model</label>
          <select
            id="settings-model"
            value={draftModel}
            onChange={(e) => setDraftModel(e.target.value)}
            className="settings-select"
          >
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.label} — {m.cost}</option>
            ))}
          </select>

          <p className="settings-privacy">
            Key is stored only in this browser. Never sent to BillTracker servers.
          </p>
        </div>

        <div className="pair-footer">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!isValid || !dirty}
          >
            Save
          </button>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append settings styles to App.css**

Append to `src/App.css`:
```css
.settings-body {
  align-items: stretch !important;
}

.settings-banner {
  font-size: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(212, 168, 83, 0.10);
  border: 1px solid rgba(212, 168, 83, 0.35);
  color: #d4a853;
  text-align: center;
  margin-bottom: 4px;
}

.settings-label {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(240, 230, 210, 0.55);
  margin-top: 6px;
}

.settings-input,
.settings-select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(240, 230, 210, 0.18);
  background: rgba(8, 8, 14, 0.55);
  color: #f0e6d2;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  letter-spacing: -0.01em;
  outline: none;
  box-sizing: border-box;
}
.settings-input:focus,
.settings-select:focus {
  border-color: rgba(212, 168, 83, 0.5);
}

.settings-key-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.settings-key-mask {
  flex: 1;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: #d4a853;
  background: rgba(8, 8, 14, 0.55);
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(240, 230, 210, 0.10);
  letter-spacing: -0.01em;
}

.settings-help {
  font-size: 11px;
  color: rgba(240, 230, 210, 0.50);
  margin: 0;
}

.settings-privacy {
  font-size: 11px;
  color: rgba(240, 230, 210, 0.45);
  margin-top: 4px;
  text-align: center;
}

.btn-icon {
  background: rgba(240, 230, 210, 0.04);
  border: 1px solid rgba(240, 230, 210, 0.12);
  color: rgba(240, 230, 210, 0.7);
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.btn-icon:hover { color: #f0e6d2; border-color: rgba(212, 168, 83, 0.4); }
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 4: Tests still pass**

```bash
npm test -- --run
```

Expected: same count.

- [ ] **Step 5: Commit**

```bash
git add src/SettingsPanel.jsx src/App.css
git commit -m "feat: add SettingsPanel modal (API key + model select)"
```

---

### Task 5: Wire SettingsPanel + gear button into App.jsx

**Files:**
- Modify: `src/App.jsx`

This task adds the gear button and settings modal mount, but does NOT yet change `handleCapture`. That's Task 6. After this task, the user can open Settings and save a key, but Scan still uses Tesseract.

- [ ] **Step 1: Import the hook and panel**

In `src/App.jsx`, alongside existing imports, add:
```jsx
import useSettings from './useSettings.js';
import SettingsPanel from './SettingsPanel.jsx';
```

- [ ] **Step 2: Wire the hook and state inside BillTracker**

Inside `function BillTracker()`, near the other `useState`/hook calls (alongside `desktopPeer`), add:
```jsx
const settings = useSettings();
const [showSettings, setShowSettings] = useState(false);
const [settingsBanner, setSettingsBanner] = useState(null);

const openSettings = (banner = null) => {
  setSettingsBanner(banner);
  setShowSettings(true);
};

const closeSettings = () => {
  setShowSettings(false);
  setSettingsBanner(null);
};
```

- [ ] **Step 3: Add the gear button to the header actions row**

Find the `header-actions` div in `App.jsx` (currently containing Undo and Export buttons). Add a gear button at the START of the row (before Undo):
```jsx
<button onClick={() => openSettings()} className="btn-icon" aria-label="Settings">
  ⚙
</button>
```

- [ ] **Step 4: Mount the SettingsPanel modal**

Find the section near other modal mounts (Camera Modal, Processing Overlay, PairingPanel). Add:
```jsx
{showSettings && (
  <SettingsPanel
    settings={settings}
    onClose={closeSettings}
    banner={settingsBanner}
  />
)}
```

- [ ] **Step 5: Verify build + manual smoke**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 6: Tests still pass**

```bash
npm test -- --run
```

Expected: same count.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire SettingsPanel + gear button into BillTracker"
```

---

### Task 6: Replace OCR pipeline — rewrite handleCapture, simplify handleFileUpload, remove dead Tesseract/PDF code

**Files:**
- Modify: `src/App.jsx`

This is the big switch-over: drop Tesseract + PDF.js + the regex parser; route all three input paths through `extractBillFromImage`.

- [ ] **Step 1: Add the import for extractBillFromImage**

In `src/App.jsx`, add to the imports at top:
```jsx
import { extractBillFromImage } from './billExtractor.js';
```

- [ ] **Step 2: Remove the Tesseract import**

In `src/App.jsx`, REMOVE the line:
```jsx
import Tesseract from 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';
```

- [ ] **Step 3: Remove the dead helper functions**

In `src/App.jsx`, REMOVE the entire `performOCR`, `parseTransactions`, and `parseBillText` function definitions. (They live near the top of the file. After Task 5, `performOCR` is at roughly lines 5-23, `parseTransactions` at lines 25-51. `parseBillText` is defined inside `BillTracker` — it was already lint-flagged as unused.)

- [ ] **Step 4: Remove the ocrProgress state**

Inside `BillTracker`, REMOVE:
```jsx
const [ocrProgress, setOcrProgress] = useState(0);
```

And remove all references to `ocrProgress` and `setOcrProgress` throughout the file.

- [ ] **Step 5: Rewrite handleCapture**

Replace the entire `handleCapture` function body with:
```jsx
const handleCapture = async (imageData, source) => {
  setShowCamera(false);

  if (!settings.hasKey) {
    openSettings('Add an Anthropic API key to scan bills.');
    return;
  }

  setIsProcessing(true);
  setProcessingStatus('Reading bill…');

  try {
    const { vendor, date, items } = await extractBillFromImage(imageData, {
      apiKey: settings.apiKey,
      model: settings.model,
    });

    const mappedItems = items.map(it => ({
      id: crypto.randomUUID(),
      description: it.description,
      amount: it.amount,
      category: autoCategorizeTx(it.description),
    }));

    const newBill = {
      id: crypto.randomUUID(),
      vendor: vendor || 'Scanned Bill',
      date: date || new Date().toISOString().split('T')[0],
      items: mappedItems.length > 0 ? mappedItems : [{
        id: crypto.randomUUID(),
        description: 'No items detected — add manually',
        amount: 0,
        category: 'Other',
      }],
    };

    setBills(prev => { pushHistory(prev); return [newBill, ...prev]; });
  } catch (err) {
    const newBill = {
      id: crypto.randomUUID(),
      vendor: 'Scanned Bill',
      date: new Date().toISOString().split('T')[0],
      items: [{
        id: crypto.randomUUID(),
        description: `${err.message || 'Extraction failed'} — add items manually`,
        amount: 0,
        category: 'Other',
      }],
    };
    setBills(prev => { pushHistory(prev); return [newBill, ...prev]; });
  } finally {
    setIsProcessing(false);
    setProcessingStatus('');
  }
};
```

(The `source` parameter is unused but preserved for compatibility with existing call sites. We could drop it, but doing so means touching every call site — out of scope for this task. Lint already accepts unused function params.)

- [ ] **Step 6: Rewrite handleFileUpload**

Replace the entire `handleFileUpload` function with:
```jsx
const handleFileUpload = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    await handleCapture(event.target.result, 'upload');
  };
  reader.readAsDataURL(file);

  e.target.value = '';
};
```

This drops the entire `if (file.type === 'application/pdf')` branch (PDF.js dynamic import, page-by-page rendering, OCR per page) — Claude handles PDFs natively now. Both images and PDFs go through `handleCapture`.

- [ ] **Step 7: Update the file input to accept the same types**

The `<input type="file" accept="image/*,application/pdf" />` is already correct — Claude accepts both. No change needed.

- [ ] **Step 8: Remove the OCR progress bar from the processing overlay**

Find the JSX for the processing overlay (around the existing `{isProcessing && (...)}` block). REMOVE the progress bar element:
```jsx
{ocrProgress > 0 && (
  <div className="progress-track">
    <div className="progress-fill" style={{ width: `${ocrProgress}%` }} />
  </div>
)}
```

Also REMOVE the line:
```jsx
<p className="processing-hint">Powered by Tesseract.js free OCR</p>
```

(or update it to "Powered by Claude vision" if you prefer to keep an attribution line. Recommendation: drop it entirely; the spinner + status text is enough.)

- [ ] **Step 9: Verify build**

```bash
npm run build
```

Expected: clean build, no errors.

- [ ] **Step 10: Verify tests still pass**

```bash
npm test -- --run
```

Expected: same count as after Task 2 (peerProtocol + billExtractor tests).

- [ ] **Step 11: Verify lint — no NEW errors in App.jsx introduced by this change**

```bash
npm run lint 2>&1
```

Expected: errors that existed before (and were not yours to fix) may still exist, but the diff this task introduces should not add any new ones. Specifically, removing `parseBillText` (which was already flagged unused) should REDUCE the lint count by one.

- [ ] **Step 12: Commit**

```bash
git add src/App.jsx
git commit -m "feat: replace Tesseract OCR with Claude vision; drop pdf.js + regex parser"
```

---

### Task 7: Final verification

This task is final cleanup, lint check, and a verification sweep. No implementation — just confirming the feature is shippable.

- [ ] **Step 1: Lint clean for new files**

```bash
npm run lint 2>&1
```

Expected: any errors should be pre-existing in `App.jsx` (unrelated to this work). New files (`billExtractor.js`, `useSettings.js`, `SettingsPanel.jsx`) should be clean. If they have errors, fix them and commit as `chore: lint fixes for claude-vision-ocr files`.

- [ ] **Step 2: Tests pass**

```bash
npm test -- --run
```

Expected: ~38 tests pass (14 existing peerProtocol + ~24 new billExtractor). Document the exact count in your report.

- [ ] **Step 3: Build clean**

```bash
npm run build
```

Expected: clean build. Bundle size will increase slightly because the Anthropic SDK is bundled (was previously loading Tesseract from CDN, but Tesseract was massive — 2MB+ on first OCR). Net effect should be smaller initial bundle penalty + much smaller first-OCR penalty (no Tesseract download).

Document the build output sizes.

- [ ] **Step 4: Manual end-to-end checklist on real device**

This step requires you (the human user) — the agent cannot do it.

Run dev + tunnel:
```bash
npm run dev
cloudflared tunnel --url http://localhost:5173
```

On desktop:

- [ ] Click ⚙ Settings → modal opens. Without a key, Save is disabled.
- [ ] Paste a real `sk-ant-...` key. Save enables. Model defaults to Haiku 4.5.
- [ ] Click Save → modal stays open (or closes — verify which). Re-open Settings → key shows masked, Edit button works.
- [ ] Close Settings.
- [ ] Click Scan → camera opens → capture a real receipt.
- [ ] Processing overlay shows "Reading bill…" without a percentage progress bar.
- [ ] Within ~3-5 seconds, a new bill appears at the top of the list with vendor, date, and line items extracted.
- [ ] Categories are assigned via existing `autoCategorizeTx` (verify a known merchant — e.g., a receipt from one of the patterns you've tuned — gets the right category).
- [ ] Click Upload → choose an image or PDF → same flow, same result.
- [ ] Click Pair Phone → scan QR with phone → capture from phone → same flow on desktop.
- [ ] Try with no key set: clear localStorage `billtracker-anthropic-key`, click Scan → Settings modal opens with "Add an Anthropic API key to scan bills." banner.
- [ ] Try with an invalid key: set localStorage to `sk-ant-INVALID`, scan a receipt → bill is created with one placeholder line containing "Invalid API key. Check Settings. — add items manually".

- [ ] **Step 5: Commit any final fixes**

If lint cleanup is needed:
```bash
git add -A
git commit -m "chore: lint fixes for claude-vision-ocr files"
```

- [ ] **Step 6: Final git log**

```bash
git log --oneline -10
```

Document the final 7-task chain in your report.

---

## Notes on extension and future work (out of scope)

- **Streaming responses** — currently one-shot per receipt. Streaming would let "Reading bill…" become token-by-token output as Claude extracts items. Nicer UX, more complexity.
- **Cost tracking** — a settings sub-panel with "Receipts processed this month: 47, est. cost $0.24". Would need to count + persist call counts.
- **Multi-image bills** — let the user capture two images for a long receipt; send both to Claude as an array.
- **Letting Claude pick categories** — drop `autoCategorizeTx`, ask Claude for a category from a fixed enum. Tradeoff: less deterministic categorization, but no hand-tuning needed.
- **BillTracker-managed key** — would require a backend (Cloudflare Worker proxy is the cleanest answer for this codebase). Currently out of scope per the spec.
- **Probe API call on save** — validate the key before the first real scan. Tradeoff: extra latency in Settings.

These are deliberately out of scope per the spec.

# Claude Vision OCR

**Date:** 2026-05-09
**Status:** Design — pending implementation
**Supersedes:** Tesseract.js OCR + regex transaction parser (in `src/App.jsx`)

## Summary

Replace the existing Tesseract.js OCR + regex parser pipeline with a single call to the Anthropic Claude API. The image (or PDF) goes to Claude with a structured-extraction prompt; Claude returns `{ vendor, date, items: [{ description, amount }] }`; the client runs the existing `autoCategorizeTx` to assign categories and constructs the bill.

The user supplies their own Anthropic API key via a Settings modal. The key lives in `localStorage` and the Anthropic SDK runs in the browser via `dangerouslyAllowBrowser: true`. No backend.

## Goals

- Dramatically improve receipt and credit-card-statement extraction accuracy over Tesseract + regex.
- Unify the three input paths (desktop camera, desktop file upload, phone capture) under one OCR pipeline.
- Drop `tesseract.js` and `pdf.js` from the dependency surface entirely. Claude handles JPEG, PNG, GIF, WebP, and PDF natively.
- Keep the no-backend constraint — single-user personal app, key stays on the user's machine.
- Preserve the existing bill data model, the `autoCategorizeTx` rules, and the user-facing capture UX.

## Non-Goals (out of scope for v1)

- Streaming Claude responses (one-shot per receipt is fine).
- Cost tracking UI or budget alerts.
- Multi-image-per-bill capture.
- Letting Claude assign categories (we keep the user's hand-tuned `autoCategorizeTx` patterns as the authoritative category logic).
- A "BillTracker-managed API key" mode (would require a backend).
- Probe API call on key save to validate.
- Tesseract fallback when Claude fails (commit to one engine).

## Architecture

A new module `src/billExtractor.js` exports `extractBillFromImage(imageDataUrl, { apiKey, model })`. It:

1. Detects MIME type from the data URL prefix (image vs `application/pdf`).
2. Strips the data URL prefix to a base64 string.
3. Builds the appropriate Anthropic content block (`type: 'image'` for images, `type: 'document'` for PDFs).
4. Calls `client.messages.create({ model, max_tokens: 2048, messages: [...] })` via the Anthropic SDK with `dangerouslyAllowBrowser: true`.
5. Extracts the text response, strips any markdown fences, parses JSON, returns the structured object.
6. Maps SDK errors to user-friendly strings (see Error Handling).

`handleCapture(imageDataUrl, source)` in `App.jsx` is rewritten to call `extractBillFromImage` once and construct the bill from the result. The chunked OCR loop, progress percentage, page-by-page PDF rendering, and regex parser all disappear.

`autoCategorizeTx` continues to run client-side on each item's description to assign categories. This keeps the user's hand-tuned merchant patterns (HOY'S, SHARK'S FISH, donations cluster, etc.) authoritative.

The Settings modal lets the user paste their key and pick a model. Default model is **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) — sufficient for receipts and ~$0.005 per typical capture. Users can switch to Sonnet 4.6 or Opus 4.7 from Settings for tougher receipts.

## Components

### New files

- **`src/billExtractor.js`** — Pure module. The Claude API call, prompt, response parser, and error mapper. Exports `extractBillFromImage` and `extractBillFromImageError` (the typed error class for upstream mapping).
- **`src/useSettings.js`** — Small hook backed by localStorage. Exposes `{ apiKey, model, save({ apiKey?, model? }), hasKey }`. Mirrors the lifecycle pattern of `useDesktopPeer` / `usePhonePeer`.
- **`src/SettingsPanel.jsx`** — Modal styled like `PairingPanel` (Nocturne aesthetic, same modal shell). Reuses `.pair-overlay` / `.pair-modal` / `.pair-header` / `.pair-footer` CSS where possible; new selectors only for input field and model dropdown.

### Modified files

- **`src/App.jsx`**
  - Add gear `⚙` button to `header-actions` row alongside Undo and Export.
  - Add `useSettings()` call alongside `useDesktopPeer()`.
  - Add `[showSettings, setShowSettings]` state and `<SettingsPanel>` mount.
  - Rewrite `handleCapture` (~70 lines → ~25 lines).
  - Simplify `handleFileUpload` — drop the entire `if (file.type === 'application/pdf')` PDF.js branch; everything reads as a data URL via `FileReader` and routes through `handleCapture`.
  - Remove dead state and elements (see Removals).
- **`src/App.css`** — Gear-button style (`.btn-icon` or similar). Settings-specific input/select styling. Most styles inherited via `.pair-*` shell.
- **`package.json`** — Add `@anthropic-ai/sdk` as a runtime dependency. (Tesseract was CDN-loaded, not installed; pdf.js likewise.)
- **`index.html`** — No change required; verify there are no leftover `tesseract.js` or `pdf.js` `<link rel="preload">` lines. (There aren't — verified during prior work.)

### Removals from `App.jsx`

- `Tesseract` import (line 2 — CDN ESM import)
- `performOCR` function
- `parseTransactions` function
- `parseBillText` function (already unused; lint-flagged earlier)
- `ocrProgress` state and `setOcrProgress` calls
- Progress bar (`.progress-track` / `.progress-fill`) inside the processing overlay
- The PDF.js dynamic import block inside `handleFileUpload` and the per-page render loop

## API Key UI

A gear `⚙` button in the header opens a Settings modal.

**Modal contents:**

- **Title:** "Settings"
- **API key input:**
  - Type `password` (masked).
  - Prefilled from localStorage. When a key is already saved, the input shows `sk-ant-•••••…<last 4>` and a small "Edit" button reveals the full input for replacement.
  - Help line below: "Get a key at console.anthropic.com → Settings → API Keys"
- **Model dropdown:** Haiku 4.5 (default) / Sonnet 4.6 / Opus 4.7. One-line cost-per-receipt estimate next to each label (~$0.005 / ~$0.025 / ~$0.10).
- **Privacy line:** "Key is stored only in this browser. Never sent to BillTracker servers."
- **Footer:** "Save" (writes to localStorage) and "Done" (dismisses without saving).

**Validation:** light only. Confirm the key starts with `sk-ant-` before enabling Save. No probe API call on save — the first real OCR call surfaces any 401 in the existing processing overlay.

**First-time UX:** if the user clicks Scan / Upload / Pair Phone with no key set, the capture is intercepted: the Settings modal opens with a one-line banner ("Add an Anthropic API key to scan bills.") and the original action proceeds after Save. No scolding popup, just route them to enter the key.

## Claude Prompt and JSON Schema

```
You are extracting structured data from a bill, receipt, or credit-card statement image.

Return ONLY a JSON object matching this schema, with no surrounding prose:
{
  "vendor": string | null,        // store/merchant name, null if unclear
  "date": string | null,          // YYYY-MM-DD if you can read one, else null
  "items": [
    {
      "description": string,      // line-item description, cleaned
      "amount": number            // positive number in dollars, e.g. 12.99
    }
  ]
}

Rules:
- Extract every line-item charge you can identify.
- Skip subtotals, totals, tax-only lines, payment/balance lines, and headers.
- For credit-card statements: each transaction is one item. Skip "PAYMENT - THANK YOU" and similar.
- If amount appears as "$12.99", "12.99", or "12,99" — normalize to 12.99.
- If you cannot read the image at all, return {"vendor": null, "date": null, "items": []}.
```

**Anthropic SDK call shape:**

```js
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
const message = await client.messages.create({
  model,
  max_tokens: 2048,
  messages: [{
    role: 'user',
    content: [
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: <base64-stripped-of-data-url-prefix> },
      },
      {
        type: 'text',
        text: PROMPT,
      },
    ],
  }],
});
```

For PDFs the first content block becomes:
```js
{
  type: 'document',
  source: { type: 'base64', media_type: 'application/pdf', data: <base64> },
}
```

(Note on prompt caching: the prompt is ~250 tokens, well below Anthropic's minimum cacheable block size of 1024 tokens for Sonnet/Opus and 2048 for Haiku. `cache_control` would have no effect at this prompt size, so we don't add it. If the prompt grows materially in a future revision, revisit.)

**Response parsing:** read `message.content[0].text`. Strip any leading/trailing markdown fences (```json … ``` or plain ```). `JSON.parse`. Validate shape (object with `items` as an array). On parse failure, throw an `extractBillFromImageError` with a friendly message.

## Data Flow

```
User taps Scan/Upload/Phone-capture
   ↓
imageDataUrl produced (data:image/jpeg;base64,... or data:application/pdf;base64,...)
   ↓
handleCapture(imageDataUrl, source) reads { apiKey, model } from useSettings
   ↓
   if no apiKey: open Settings modal, return early
   ↓
setIsProcessing(true), processingStatus='Reading bill…'
   ↓
extractBillFromImage(imageDataUrl, { apiKey, model })
   ↓
   Anthropic SDK call → Claude returns JSON text → parse
   ↓
{ vendor, date, items: [{ description, amount }] }
   ↓
client maps items: each gets crypto.randomUUID() id and autoCategorizeTx(description) category
   ↓
construct bill: { id, vendor: vendor || 'Scanned Bill', date: date || today, items: mapped }
   ↓
   if items empty: insert single placeholder { description: 'No items detected — add manually', amount: 0, category: 'Other' }
   ↓
setBills([newBill, ...bills])
setIsProcessing(false)
```

## Error Handling

Errors map to friendly strings shown in the existing processing overlay (`processingStatus`):

| Source | Mapping |
|---|---|
| 401 invalid key | "Invalid API key. Check Settings." |
| 429 rate limit | "Rate limit hit. Try again in a moment." |
| 5xx | "Anthropic API is having trouble. Try again." |
| Network / fetch failure | "Couldn't reach Anthropic. Check connection." |
| Response not valid JSON | "Couldn't read the receipt. Try a clearer photo." |
| `items` missing or not an array | Same as JSON parse failure. |

On error, follow the existing recovery UX: create a bill with a single placeholder line (`{ description: '<error message> — add items manually', amount: 0, category: 'Other' }`) so the user has something concrete to edit. This matches the current Tesseract-failure behavior in `App.jsx:563-572`.

## Cost and Performance

**Per-receipt cost (Haiku 4.5, default):**
- Image input: ~1500 tokens for a typical 1600px receipt
- Prompt: ~250 tokens
- Output: ~300-800 tokens depending on receipt length
- Total: ~$0.003-0.006 per call

**Per-receipt cost (Sonnet 4.6):** ~$0.015-0.030 per call. Worth it on faded paper, handwriting, or unusual layouts.

**Latency:** typically 2-5 seconds end-to-end for Haiku on a single receipt. The existing processing overlay shows "Reading bill…" — no progress percentage (single round-trip, not chunked).

**Prompt caching:** not used in v1. The prompt is ~250 tokens, below Anthropic's minimum cache block size (1024 for Sonnet/Opus, 2048 for Haiku). Caching only becomes worthwhile if the prompt grows past those thresholds.

## Privacy

The captured image leaves the user's device and goes to Anthropic's servers for processing. This is a meaningful change from the prior architecture where images stayed entirely on the user's machine via Tesseract. The user accepted this tradeoff; the Settings modal explicitly states "Key is stored only in this browser. Never sent to BillTracker servers." (BillTracker has no servers.)

Anthropic's data retention policy: by default, API requests aren't used for training. Users with strong privacy concerns can be reminded of this in the Settings modal — not a v1 requirement but worth noting.

## Browser Support

The Anthropic SDK works in any browser supporting `fetch` and `Promise` — universal in modern Chrome, Safari, Firefox, Edge. No polyfills needed. Uses Vite's existing target.

## Implementation Notes

- The Anthropic SDK pulls in some bundle weight (~50-80KB gzipped). Acceptable given we're dropping Tesseract (CDN-loaded so no bundle impact, but a 2MB+ download on first OCR) and PDF.js (also CDN-loaded, also large).
- `crypto.randomUUID()` already in use elsewhere; standardize on it for new item IDs (replacing `Date.now() + Math.random()` for items as a side benefit).
- `useSettings` should write to localStorage synchronously on `save()` so a Settings → close → Scan flow doesn't race the React render cycle.
- `extractBillFromImage` should be `async` and throw typed errors. The caller (`handleCapture`) catches once and maps to the recovery placeholder bill.
- Defensive markdown-fence stripping should handle three patterns: ` ```json\n…\n``` `, ` ```\n…\n``` `, and plain JSON. Regex: `/^\s*```(?:json)?\s*\n?|\n?```\s*$/g`.
- Aspect: when implementing the bundle change, verify the production build size doesn't regress meaningfully. Anthropic SDK is tree-shakeable; we only need the messages.create path.

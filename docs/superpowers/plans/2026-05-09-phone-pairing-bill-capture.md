# Phone-Pairing Bill Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Pair Phone" feature so the user can scan a QR on the desktop, open a webpage on their phone, and capture bills with the phone camera that flow into the existing desktop OCR pipeline as if scanned locally.

**Architecture:** Desktop and phone connect peer-to-peer via WebRTC, brokered by PeerJS's free public service. Phone resizes captures to 1600px JPEG, chunks them into 16KB DataChannel messages, and sends to the desktop. Desktop reassembles and feeds the image into the existing `handleCapture()` function. No backend, no cloud storage, no native app.

**Tech Stack:** React 19, Vite 7, PeerJS (WebRTC), qrcode.react (SVG QR), Vitest (new — for testing pure protocol logic), Open Relay TURN.

**Spec:** `docs/superpowers/specs/2026-05-09-phone-pairing-bill-capture-design.md`

**Project root:** `bill-tracker/` — all paths in this plan are relative to that directory unless otherwise noted.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/peerProtocol.js` | NEW | Pure logic: chunk/reassemble images, ICE config, message shape constants |
| `src/peerProtocol.test.js` | NEW | Vitest unit tests for chunking/reassembly |
| `src/useDesktopPeer.js` | NEW | Desktop-side PeerJS lifecycle hook |
| `src/usePhonePeer.js` | NEW | Phone-side PeerJS lifecycle hook |
| `src/PairingPanel.jsx` | NEW | Desktop modal: QR + status pill + countdown + Unpair |
| `src/PhoneCapture.jsx` | NEW | Phone-side full UI (connecting/ready/preview/sending/sent) |
| `src/App.jsx` | MODIFY | Pathname routing branch; wire pairing into `handleCapture`; add "Pair Phone" button; remove "Mobile App Coming Soon" panel |
| `src/App.css` | MODIFY | Styles for `PairingPanel` and `PhoneCapture` (Nocturne aesthetic) |
| `package.json` | MODIFY | Add `peerjs`, `qrcode.react`, `vitest` |
| `vite.config.js` | MODIFY | Add Vitest config block |

---

## Notes Before Starting

- **Not currently a git repo.** Either run `git init` first (recommended — every commit step in this plan assumes a repo) or skip the `git commit` steps and rely on the engineer's discretion.
- **No existing test framework.** This plan adds Vitest specifically for `peerProtocol.js`. Hooks and components are exercised through manual end-to-end testing on real devices (Task 13). WebRTC and `getUserMedia` are not realistically unit-testable without heavy mocking that pays back nothing for a single-developer personal app.
- **Manual testing requires a public URL.** PeerJS works on `localhost`, but the phone can't reach `localhost`. Use `cloudflared tunnel --url http://localhost:5173` (free, no signup) during development.

---

### Task 1: Add dependencies and Vitest setup

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`

- [ ] **Step 1: Install runtime and dev dependencies**

Run from `bill-tracker/`:
```bash
npm install peerjs qrcode.react
npm install -D vitest @vitest/ui jsdom
```

Expected: `package.json` updated with new entries; `package-lock.json` updated.

- [ ] **Step 2: Add test script to package.json**

In `package.json`, add to the `scripts` block:
```json
"test": "vitest"
```

Final `scripts` block:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "test": "vitest"
}
```

- [ ] **Step 3: Add Vitest config to vite.config.js**

Replace the contents of `vite.config.js` with:
```js
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
```

- [ ] **Step 4: Verify Vitest runs (with no tests yet)**

Run from `bill-tracker/`:
```bash
npm test -- --run
```

Expected: `No test files found` — confirms Vitest is wired up.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vite.config.js
git commit -m "chore: add peerjs, qrcode.react, vitest dependencies"
```

---

### Task 2: peerProtocol.js — pure logic with tests

**Files:**
- Create: `src/peerProtocol.js`
- Create: `src/peerProtocol.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/peerProtocol.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE, makeImageChunks, createReassembler, ICE_SERVERS, peerIdFor } from './peerProtocol.js';

describe('CHUNK_SIZE', () => {
  it('is 16KB', () => {
    expect(CHUNK_SIZE).toBe(16 * 1024);
  });
});

describe('peerIdFor', () => {
  it('prefixes session ID with bt-', () => {
    expect(peerIdFor('abc-123')).toBe('bt-abc-123');
  });
});

describe('ICE_SERVERS', () => {
  it('includes Google STUN', () => {
    expect(ICE_SERVERS.some(s => s.urls.includes('stun:stun.l.google.com'))).toBe(true);
  });
  it('includes Open Relay TURN on port 80, 443, and 443/tcp', () => {
    const turnUrls = ICE_SERVERS.flatMap(s => Array.isArray(s.urls) ? s.urls : [s.urls]);
    expect(turnUrls.some(u => u.includes('openrelay.metered.ca:80'))).toBe(true);
    expect(turnUrls.some(u => u.includes('openrelay.metered.ca:443') && !u.includes('tcp'))).toBe(true);
    expect(turnUrls.some(u => u.includes('transport=tcp'))).toBe(true);
  });
});

describe('makeImageChunks', () => {
  it('produces a single chunk for data smaller than CHUNK_SIZE', () => {
    const bytes = new Uint8Array(1000).fill(7);
    const result = makeImageChunks(bytes, 'image/jpeg');
    expect(result.start.t).toBe('img-start');
    expect(result.start.size).toBe(1000);
    expect(result.start.chunks).toBe(1);
    expect(result.start.mime).toBe('image/jpeg');
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].i).toBe(0);
    expect(result.chunks[0].data.byteLength).toBe(1000);
    expect(result.end.t).toBe('img-end');
    expect(result.end.id).toBe(result.start.id);
  });

  it('splits exactly at CHUNK_SIZE boundaries', () => {
    const bytes = new Uint8Array(CHUNK_SIZE * 3);
    const result = makeImageChunks(bytes, 'image/jpeg');
    expect(result.start.chunks).toBe(3);
    expect(result.chunks).toHaveLength(3);
    expect(result.chunks[0].data.byteLength).toBe(CHUNK_SIZE);
    expect(result.chunks[2].data.byteLength).toBe(CHUNK_SIZE);
  });

  it('handles non-aligned final chunk', () => {
    const bytes = new Uint8Array(CHUNK_SIZE * 2 + 500);
    const result = makeImageChunks(bytes, 'image/jpeg');
    expect(result.start.chunks).toBe(3);
    expect(result.chunks[2].data.byteLength).toBe(500);
  });

  it('every chunk shares the same id with start/end', () => {
    const bytes = new Uint8Array(CHUNK_SIZE * 2);
    const result = makeImageChunks(bytes, 'image/jpeg');
    const id = result.start.id;
    expect(result.chunks.every(c => c.id === id)).toBe(true);
    expect(result.end.id).toBe(id);
  });
});

describe('createReassembler', () => {
  it('reassembles chunks into the original buffer', () => {
    const original = new Uint8Array(CHUNK_SIZE * 2 + 500);
    for (let i = 0; i < original.length; i++) original[i] = i % 256;
    const { start, chunks, end } = makeImageChunks(original, 'image/jpeg');

    const r = createReassembler();
    r.onStart(start);
    for (const c of chunks) r.onChunk(c);
    const result = r.onEnd(end);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(result[i]).toBe(original[i]);
    }
  });

  it('reassembles correctly when chunks arrive out of order', () => {
    const original = new Uint8Array(CHUNK_SIZE * 3);
    for (let i = 0; i < original.length; i++) original[i] = i % 256;
    const { start, chunks, end } = makeImageChunks(original, 'image/jpeg');

    const r = createReassembler();
    r.onStart(start);
    r.onChunk(chunks[2]);
    r.onChunk(chunks[0]);
    r.onChunk(chunks[1]);
    const result = r.onEnd(end);

    for (let i = 0; i < original.length; i++) {
      expect(result[i]).toBe(original[i]);
    }
  });

  it('reports progress on each chunk', () => {
    const bytes = new Uint8Array(CHUNK_SIZE * 4);
    const { start, chunks } = makeImageChunks(bytes, 'image/jpeg');
    const r = createReassembler();
    r.onStart(start);
    const p1 = r.onChunk(chunks[0]);
    const p2 = r.onChunk(chunks[1]);
    expect(p1.progress).toBeCloseTo(0.25);
    expect(p2.progress).toBeCloseTo(0.5);
  });

  it('drop() removes pending state for an id', () => {
    const bytes = new Uint8Array(CHUNK_SIZE);
    const { start, chunks, end } = makeImageChunks(bytes, 'image/jpeg');
    const r = createReassembler();
    r.onStart(start);
    r.onChunk(chunks[0]);
    r.drop(start.id);
    expect(r.onEnd(end)).toBeNull();
  });

  it('ignores chunks for unknown ids', () => {
    const r = createReassembler();
    const result = r.onChunk({ id: 'never-started', i: 0, data: new ArrayBuffer(10) });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run
```

Expected: All tests FAIL with "Cannot find module './peerProtocol.js'" or similar.

- [ ] **Step 3: Implement peerProtocol.js**

Create `src/peerProtocol.js`:
```js
export const CHUNK_SIZE = 16 * 1024;

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

export const PEER_CONFIG = { config: { iceServers: ICE_SERVERS } };

export function peerIdFor(sessionId) {
  return `bt-${sessionId}`;
}

export function makeImageChunks(bytes, mime) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const id = crypto.randomUUID();
  const size = buffer.byteLength;
  const chunks = Math.max(1, Math.ceil(size / CHUNK_SIZE));
  const slices = [];
  for (let i = 0; i < chunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, size);
    slices.push(buffer.slice(start, end));
  }
  return {
    start: { t: 'img-start', id, mime, size, chunks },
    chunks: slices.map((data, i) => ({ t: 'img-chunk', id, i, data })),
    end: { t: 'img-end', id },
  };
}

export function createReassembler() {
  const buffers = new Map();
  return {
    onStart({ id, size }) {
      buffers.set(id, { size, received: 0, buffer: new Uint8Array(size) });
    },
    onChunk({ id, i, data }) {
      const entry = buffers.get(id);
      if (!entry) return null;
      const chunk = data instanceof Uint8Array ? data : new Uint8Array(data);
      entry.buffer.set(chunk, i * CHUNK_SIZE);
      entry.received += chunk.byteLength;
      return { progress: Math.min(1, entry.received / entry.size) };
    },
    onEnd({ id }) {
      const entry = buffers.get(id);
      if (!entry) return null;
      buffers.delete(id);
      return entry.buffer;
    },
    drop(id) {
      buffers.delete(id);
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/peerProtocol.js src/peerProtocol.test.js
git commit -m "feat: add peerProtocol with chunking, reassembly, ICE config"
```

---

### Task 3: Routing branch and PhoneCapture stub

**Files:**
- Modify: `src/App.jsx` (add routing branch at the top of the default export area)
- Create: `src/PhoneCapture.jsx`

The goal of this task is the smallest possible change that proves routing works. Visiting `/pair#s=test` should render a placeholder phone screen; visiting `/` should render BillTracker unchanged.

- [ ] **Step 1: Create PhoneCapture stub**

Create `src/PhoneCapture.jsx`:
```jsx
import React from 'react';

export default function PhoneCapture() {
  const sessionId = window.location.hash.replace(/^#s=/, '');

  if (!sessionId) {
    return (
      <div className="phone-root phone-error">
        <h1>Invalid pairing link</h1>
        <p>This link is missing a session ID.</p>
      </div>
    );
  }

  return (
    <div className="phone-root">
      <h1>BillTracker — Phone</h1>
      <p>Session: <code>{sessionId}</code></p>
      <p>(stub)</p>
    </div>
  );
}
```

- [ ] **Step 2: Add routing branch to App.jsx**

In `src/App.jsx`, find the default export `export default function BillTracker()` (around line 439). Rename it to `function BillTracker()` (remove `export default`). Then at the very bottom of the file, add:

```jsx
import PhoneCapture from './PhoneCapture.jsx';

export default function App() {
  if (typeof window !== 'undefined' && window.location.pathname === '/pair') {
    return <PhoneCapture />;
  }
  return <BillTracker />;
}
```

Move the `import PhoneCapture` to the top of the file with the other imports (don't actually leave it at the bottom).

- [ ] **Step 3: Add minimal phone styles to App.css**

Append to `src/App.css`:
```css
.phone-root {
  min-height: 100dvh;
  background: #0a0a0f;
  color: #f0e6d2;
  font-family: 'Outfit', system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
}

.phone-root h1 {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 32px;
  font-weight: 500;
  margin: 0 0 16px;
  color: #d4a853;
}

.phone-root code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #d4a853;
  letter-spacing: -0.01em;
}

.phone-error h1 {
  color: #ef4444;
}
```

- [ ] **Step 4: Manual verification**

Run `npm run dev`. In a browser:
- Visit `http://localhost:5173/` → BillTracker should render normally (unchanged from before).
- Visit `http://localhost:5173/pair#s=hello-world` → "BillTracker — Phone" with `Session: hello-world`.
- Visit `http://localhost:5173/pair` (no hash) → "Invalid pairing link" error.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/PhoneCapture.jsx src/App.css
git commit -m "feat: add /pair routing branch with PhoneCapture stub"
```

---

### Task 4: useDesktopPeer hook

**Files:**
- Create: `src/useDesktopPeer.js`

This hook owns the desktop's PeerJS lifecycle: peer creation, accepting one connection at a time, status state, expiry timer, unpair.

- [ ] **Step 1: Create useDesktopPeer.js**

Create `src/useDesktopPeer.js`:
```js
import { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';
import { PEER_CONFIG, peerIdFor, createReassembler } from './peerProtocol.js';

const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

export default function useDesktopPeer() {
  const [active, setActive] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState(null);
  const [lastImage, setLastImage] = useState(null);
  const [receiveProgress, setReceiveProgress] = useState(0);
  const [expiresAt, setExpiresAt] = useState(null);

  const peerRef = useRef(null);
  const connRef = useRef(null);
  const reassemblerRef = useRef(null);
  const expiryTimerRef = useRef(null);

  const cleanup = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    if (connRef.current) {
      try { connRef.current.close(); } catch (e) { /* ignore */ }
      connRef.current = null;
    }
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (e) { /* ignore */ }
      peerRef.current = null;
    }
    reassemblerRef.current = null;
  }, []);

  const armExpiry = useCallback(() => {
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    const expiresAtMs = Date.now() + SESSION_TIMEOUT_MS;
    setExpiresAt(expiresAtMs);
    expiryTimerRef.current = setTimeout(() => {
      setStatus('expired');
      cleanup();
    }, SESSION_TIMEOUT_MS);
  }, [cleanup]);

  const disarmExpiry = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    setExpiresAt(null);
  }, []);

  const handleData = useCallback((msg) => {
    if (!reassemblerRef.current) reassemblerRef.current = createReassembler();
    const r = reassemblerRef.current;
    if (msg.t === 'img-start') {
      r.onStart(msg);
      setStatus('receiving');
      setReceiveProgress(0);
    } else if (msg.t === 'img-chunk') {
      const update = r.onChunk(msg);
      if (update) setReceiveProgress(update.progress);
    } else if (msg.t === 'img-end') {
      const buffer = r.onEnd(msg);
      if (buffer) {
        const blob = new Blob([buffer], { type: 'image/jpeg' });
        const reader = new FileReader();
        reader.onload = () => {
          setLastImage({ dataUrl: reader.result, receivedAt: Date.now() });
          setStatus('paired');
          setReceiveProgress(0);
        };
        reader.readAsDataURL(blob);
      }
    }
  }, []);

  const wireConnection = useCallback((conn) => {
    connRef.current = conn;
    conn.on('open', () => {
      disarmExpiry();
      setStatus('paired');
    });
    conn.on('data', handleData);
    conn.on('close', () => {
      connRef.current = null;
      reassemblerRef.current = null;
      setStatus('disconnected');
      setReceiveProgress(0);
      armExpiry();
    });
    conn.on('error', () => {
      connRef.current = null;
      setStatus('disconnected');
      armExpiry();
    });
  }, [armExpiry, disarmExpiry, handleData]);

  const start = useCallback(() => {
    cleanup();
    setLastImage(null);
    setReceiveProgress(0);
    setErrorMessage(null);
    const id = crypto.randomUUID();
    setSessionId(id);
    setActive(true);
    setStatus('connecting');

    const peer = new Peer(peerIdFor(id), PEER_CONFIG);
    peerRef.current = peer;

    peer.on('open', () => {
      setStatus('waiting');
      armExpiry();
    });

    peer.on('connection', (conn) => {
      if (connRef.current && connRef.current.open) {
        try { conn.close(); } catch (e) { /* ignore */ }
        return;
      }
      wireConnection(conn);
    });

    peer.on('error', (err) => {
      const msg = err && err.type === 'network'
        ? 'Pairing service unreachable. Check your connection.'
        : `Pairing error: ${err && err.type ? err.type : 'unknown'}`;
      setErrorMessage(msg);
      setStatus('error');
      cleanup();
    });

    peer.on('disconnected', () => {
      try { peer.reconnect(); } catch (e) { /* ignore */ }
    });
  }, [armExpiry, cleanup, wireConnection]);

  const unpair = useCallback(() => {
    cleanup();
    setActive(false);
    setSessionId(null);
    setStatus('idle');
    setExpiresAt(null);
    setReceiveProgress(0);
    setLastImage(null);
    setErrorMessage(null);
  }, [cleanup]);

  const consumeImage = useCallback(() => setLastImage(null), []);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    active,
    sessionId,
    status,
    errorMessage,
    lastImage,
    receiveProgress,
    expiresAt,
    start,
    unpair,
    consumeImage,
  };
}
```

- [ ] **Step 2: Manual verification (compile only)**

Run `npm run dev`. The app should still render normally (this hook isn't wired to UI yet). If the dev server reports a syntax error in `useDesktopPeer.js`, fix it before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/useDesktopPeer.js
git commit -m "feat: add useDesktopPeer hook with peer lifecycle, expiry, reassembly"
```

---

### Task 5: PairingPanel component

**Files:**
- Create: `src/PairingPanel.jsx`
- Modify: `src/App.css` (append styles)

- [ ] **Step 1: Create PairingPanel.jsx**

Create `src/PairingPanel.jsx`:
```jsx
import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

function formatRemaining(ms) {
  if (ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function statusLabel(status) {
  switch (status) {
    case 'connecting': return 'Connecting to pairing service…';
    case 'waiting':    return 'Waiting for phone…';
    case 'paired':     return 'Phone connected · ready';
    case 'receiving':  return 'Receiving image…';
    case 'disconnected': return 'Phone disconnected';
    case 'expired':    return 'Pairing expired';
    case 'error':      return 'Pairing error';
    default:           return '';
  }
}

function statusToneClass(status) {
  if (status === 'paired' || status === 'receiving') return 'pair-status-pill pair-status-good';
  if (status === 'error' || status === 'expired')    return 'pair-status-pill pair-status-bad';
  return 'pair-status-pill';
}

export default function PairingPanel({ peer, onClose }) {
  const { sessionId, status, errorMessage, expiresAt, receiveProgress, start, unpair } = peer;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const url = sessionId
    ? `${window.location.origin}/pair#s=${sessionId}`
    : null;

  const handleClose = () => {
    unpair();
    onClose();
  };

  return (
    <div className="pair-overlay" onClick={handleClose}>
      <div className="pair-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pair-header">
          <h2 className="pair-title">Pair Phone</h2>
          <button className="pair-close" onClick={handleClose}>×</button>
        </div>

        <div className="pair-body">
          {status === 'error' ? (
            <div className="pair-error">
              <p>{errorMessage || 'Pairing failed.'}</p>
              <button className="btn btn-primary" onClick={start}>Retry</button>
            </div>
          ) : status === 'expired' ? (
            <div className="pair-error">
              <p>Pairing expired. Click below to generate a fresh code.</p>
              <button className="btn btn-primary" onClick={start}>New Code</button>
            </div>
          ) : url ? (
            <>
              <div className="pair-qr-card">
                <QRCodeSVG
                  value={url}
                  size={232}
                  bgColor="#f0e6d2"
                  fgColor="#0a0a0f"
                  level="M"
                  includeMargin
                />
              </div>
              <p className="pair-instructions">
                Open your phone camera and scan this code. The pairing page will
                open in your phone's browser.
              </p>
            </>
          ) : (
            <p className="pair-instructions">Generating pairing code…</p>
          )}

          <div className={statusToneClass(status)}>
            <span className="pair-status-dot" />
            {statusLabel(status)}
            {status === 'receiving' && receiveProgress > 0 && (
              <span className="pair-progress">{Math.round(receiveProgress * 100)}%</span>
            )}
          </div>

          {expiresAt && (status === 'waiting' || status === 'disconnected') && (
            <p className="pair-countdown">
              Expires in <span className="pair-countdown-num">{formatRemaining(expiresAt - now)}</span>
            </p>
          )}
        </div>

        <div className="pair-footer">
          <button className="btn" onClick={handleClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append styles to App.css**

Append to `src/App.css`:
```css
.pair-overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 8, 14, 0.78);
  backdrop-filter: blur(8px);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.pair-modal {
  width: 100%;
  max-width: 380px;
  background: #15151c;
  border: 1px solid rgba(212, 168, 83, 0.18);
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

.pair-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 12px;
  border-bottom: 1px solid rgba(212, 168, 83, 0.12);
}

.pair-title {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-weight: 500;
  font-size: 22px;
  color: #d4a853;
  margin: 0;
}

.pair-close {
  background: none;
  border: 0;
  color: rgba(240, 230, 210, 0.5);
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
}
.pair-close:hover { color: #f0e6d2; }

.pair-body {
  padding: 22px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.pair-qr-card {
  background: #f0e6d2;
  padding: 14px;
  border-radius: 10px;
  line-height: 0;
}

.pair-instructions {
  text-align: center;
  font-size: 13px;
  color: rgba(240, 230, 210, 0.7);
  margin: 0;
  max-width: 280px;
  line-height: 1.5;
}

.pair-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(240, 230, 210, 0.06);
  color: rgba(240, 230, 210, 0.75);
  font-size: 12px;
  letter-spacing: 0.02em;
  border: 1px solid rgba(240, 230, 210, 0.08);
}
.pair-status-pill.pair-status-good {
  color: #86e0a8;
  background: rgba(134, 224, 168, 0.08);
  border-color: rgba(134, 224, 168, 0.25);
}
.pair-status-pill.pair-status-bad {
  color: #f08c8c;
  background: rgba(240, 140, 140, 0.08);
  border-color: rgba(240, 140, 140, 0.25);
}

.pair-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 6px currentColor;
}

.pair-progress {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: -0.02em;
  margin-left: 4px;
}

.pair-countdown {
  font-size: 12px;
  color: rgba(240, 230, 210, 0.55);
  margin: 0;
}
.pair-countdown-num {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  letter-spacing: -0.02em;
  color: #d4a853;
}

.pair-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
  font-size: 13px;
  color: rgba(240, 230, 210, 0.8);
}

.pair-footer {
  padding: 14px 20px 20px;
  display: flex;
  justify-content: flex-end;
}
```

- [ ] **Step 3: Manual verification (compile only)**

Run `npm run dev`. The app should still render normally (PairingPanel isn't mounted yet). Fix any syntax errors.

- [ ] **Step 4: Commit**

```bash
git add src/PairingPanel.jsx src/App.css
git commit -m "feat: add PairingPanel UI with QR, status pill, countdown"
```

---

### Task 6: Wire PairingPanel into App with "Pair Phone" button

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Import the hook and panel in App.jsx**

At the top of `src/App.jsx`, alongside the existing imports, add:
```jsx
import useDesktopPeer from './useDesktopPeer.js';
import PairingPanel from './PairingPanel.jsx';
```

- [ ] **Step 2: Wire the hook into BillTracker component**

Inside the `function BillTracker()` body, near the other `useState` calls, add:
```jsx
const desktopPeer = useDesktopPeer();
const [showPairing, setShowPairing] = useState(false);

const openPairing = () => {
  if (!desktopPeer.active) desktopPeer.start();
  setShowPairing(true);
};
```

- [ ] **Step 3: Add the "Pair Phone" button to the actions row**

Find the `actions-grid` block in `App.jsx` (currently containing Scan, Upload, Manual). Add a new button after the Manual button:
```jsx
<button onClick={openPairing} className="btn btn-action">
  ⌘ Pair Phone
</button>
```

- [ ] **Step 4: Render the PairingPanel modal**

Find the section near the existing modals (Camera Modal, Processing Overlay). Add:
```jsx
{showPairing && (
  <PairingPanel
    peer={desktopPeer}
    onClose={() => setShowPairing(false)}
  />
)}
```

- [ ] **Step 5: Remove the "Mobile App Coming Soon" sidebar panel**

In `App.jsx`, find and delete the block:
```jsx
<div className="info-panel">
  <span className="info-panel-icon">◎</span>
  <h3 className="info-panel-title">Mobile App Coming Soon</h3>
  <p className="info-panel-desc">Snap bills on the go and sync with desktop</p>
</div>
```

- [ ] **Step 6: Manual verification**

Run `npm run dev`. Open `http://localhost:5173/`:
- Click "Pair Phone" → modal opens, shows "Connecting to pairing service…", then "Waiting for phone…", then a QR code.
- The QR encodes `http://localhost:5173/pair#s=<uuid>`.
- Countdown shows `5:00` and counts down.
- Click "Done" or backdrop → modal closes, peer cleans up.
- Click "Pair Phone" again → fresh QR (new UUID).

The "Mobile App Coming Soon" sidebar panel should be gone.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire PairingPanel into BillTracker with Pair Phone button"
```

---

### Task 7: usePhonePeer hook

**Files:**
- Create: `src/usePhonePeer.js`

- [ ] **Step 1: Create usePhonePeer.js**

Create `src/usePhonePeer.js`:
```js
import { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';
import { PEER_CONFIG, peerIdFor, makeImageChunks, CHUNK_SIZE } from './peerProtocol.js';

export default function usePhonePeer(sessionId) {
  const [status, setStatus] = useState('connecting');
  const [errorMessage, setErrorMessage] = useState(null);
  const [sendProgress, setSendProgress] = useState(0);

  const peerRef = useRef(null);
  const connRef = useRef(null);

  const cleanup = useCallback(() => {
    if (connRef.current) {
      try { connRef.current.close(); } catch (e) { /* ignore */ }
      connRef.current = null;
    }
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (e) { /* ignore */ }
      peerRef.current = null;
    }
  }, []);

  const dial = useCallback(() => {
    if (!sessionId) {
      setStatus('error');
      setErrorMessage('Invalid pairing link.');
      return;
    }
    cleanup();
    setStatus('connecting');
    setErrorMessage(null);

    const peer = new Peer(undefined, PEER_CONFIG);
    peerRef.current = peer;

    peer.on('open', () => {
      const conn = peer.connect(peerIdFor(sessionId), { reliable: true });
      connRef.current = conn;

      conn.on('open', () => setStatus('ready'));
      conn.on('close', () => {
        connRef.current = null;
        setStatus('disconnected');
      });
      conn.on('error', (err) => {
        setErrorMessage(err && err.message ? err.message : 'Connection error');
        setStatus('error');
      });
    });

    peer.on('error', (err) => {
      const type = err && err.type;
      if (type === 'peer-unavailable') {
        setErrorMessage('Desktop session not found. Make sure the pairing window is still open.');
      } else if (type === 'network') {
        setErrorMessage('Cannot reach the pairing service.');
      } else {
        setErrorMessage(`Pairing error: ${type || 'unknown'}`);
      }
      setStatus('error');
      cleanup();
    });
  }, [cleanup, sessionId]);

  const sendImage = useCallback(async (bytes) => {
    const conn = connRef.current;
    if (!conn || !conn.open) throw new Error('Not connected');

    const { start, chunks, end } = makeImageChunks(bytes, 'image/jpeg');
    setSendProgress(0);
    setStatus('sending');

    conn.send(start);
    for (let i = 0; i < chunks.length; i++) {
      conn.send(chunks[i]);
      setSendProgress((i + 1) / chunks.length);
      // Yield to the event loop so the UI can repaint and the
      // DataChannel buffer can drain between chunks.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    conn.send(end);
    // Return to 'ready' immediately — the component handles its own
    // "✓ Sent" confirmation visual. We don't expose a 'sent' status to
    // avoid tempting components to call retry() (which destroys the peer).
    setSendProgress(0);
    setStatus('ready');
  }, []);

  useEffect(() => {
    dial();
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return { status, errorMessage, sendProgress, retry: dial, sendImage };
}
```

- [ ] **Step 2: Manual verification (compile only)**

Run `npm run dev` and visit `/pair#s=test-id`. The PhoneCapture stub still renders. The hook isn't wired yet — this step just verifies the file compiles.

- [ ] **Step 3: Commit**

```bash
git add src/usePhonePeer.js
git commit -m "feat: add usePhonePeer hook with dial, send-with-backpressure, retry"
```

---

### Task 8: PhoneCapture — connecting and ready states (camera preview)

**Files:**
- Modify: `src/PhoneCapture.jsx`
- Modify: `src/App.css` (append styles)

- [ ] **Step 1: Replace PhoneCapture.jsx with the connecting + ready implementation**

Replace `src/PhoneCapture.jsx` contents:
```jsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import usePhonePeer from './usePhonePeer.js';

function getSessionId() {
  return window.location.hash.replace(/^#s=/, '');
}

export default function PhoneCapture() {
  const sessionId = getSessionId();
  const peer = usePhonePeer(sessionId);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  // Acquire camera once when the peer becomes camera-eligible.
  // Survives ready ↔ sending transitions so the camera doesn't flicker
  // on every send.
  useEffect(() => {
    const needsCam = peer.status === 'ready' || peer.status === 'sending';
    if (!needsCam) return;
    if (streamRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        // If the video element is mounted right now, attach immediately.
        // Otherwise the callback ref (setVideoRef below) attaches when it mounts.
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => { /* autoplay policy; muted=true should let it play */ });
          setCameraReady(true);
        }
      } catch (err) {
        setCameraError('Camera access denied. Enable camera permissions and reload.');
      }
    })();

    return () => { cancelled = true; };
  }, [peer.status]);

  // Release the stream when the peer leaves camera-eligible states.
  useEffect(() => {
    const needsCam = peer.status === 'ready' || peer.status === 'sending';
    if (needsCam) return;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, [peer.status]);

  // Hard cleanup on component unmount.
  useEffect(() => () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Callback ref: attaches whichever <video> element is currently mounted
  // to the existing stream. This is what makes ready → preview → ready
  // round-trips work without re-acquiring the camera.
  const setVideoRef = useCallback((node) => {
    videoRef.current = node;
    if (node && streamRef.current && node.srcObject !== streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => { /* autoplay policy */ });
      setCameraReady(true);
    }
  }, []);

  if (!sessionId) {
    return (
      <div className="phone-root phone-error">
        <h1>Invalid pairing link</h1>
        <p>This link is missing a session ID.</p>
      </div>
    );
  }

  if (peer.status === 'error') {
    return (
      <div className="phone-root phone-error">
        <h1>Couldn't pair</h1>
        <p>{peer.errorMessage}</p>
        <button className="phone-btn phone-btn-primary" onClick={peer.retry}>Retry</button>
      </div>
    );
  }

  if (peer.status === 'disconnected') {
    return (
      <div className="phone-root phone-error">
        <h1>Desktop disconnected</h1>
        <p>The desktop closed the pairing or lost connection.</p>
        <button className="phone-btn phone-btn-primary" onClick={peer.retry}>Reconnect</button>
      </div>
    );
  }

  if (peer.status === 'connecting') {
    return (
      <div className="phone-root">
        <div className="phone-spinner" />
        <h1>Connecting…</h1>
        <p className="phone-sub">Linking to your desktop</p>
      </div>
    );
  }

  if (cameraError) {
    return (
      <div className="phone-root phone-error">
        <h1>Camera blocked</h1>
        <p>{cameraError}</p>
      </div>
    );
  }

  return (
    <div className="phone-camera">
      <div className="phone-camera-topbar">
        <span className="phone-camera-title">Scan a bill</span>
        <span className="phone-camera-status">● connected</span>
      </div>

      <div className="phone-camera-viewport">
        <video
          ref={setVideoRef}
          className="phone-camera-video"
          autoPlay
          playsInline
          muted
        />
        <div className="phone-camera-frame">
          <div className="phone-camera-frame-label">Position bill within frame</div>
        </div>
      </div>

      <div className="phone-camera-bottom">
        <button
          className="phone-shutter"
          disabled={!cameraReady}
          aria-label="Capture"
        >
          <span className="phone-shutter-inner" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append phone camera styles to App.css**

Append to `src/App.css`:
```css
.phone-spinner {
  width: 40px;
  height: 40px;
  border: 2px solid rgba(212, 168, 83, 0.18);
  border-top-color: #d4a853;
  border-radius: 50%;
  animation: phone-spin 0.9s linear infinite;
  margin-bottom: 8px;
}
@keyframes phone-spin { to { transform: rotate(360deg); } }

.phone-sub {
  font-size: 13px;
  color: rgba(240, 230, 210, 0.6);
  margin: 0;
}

.phone-btn {
  padding: 12px 22px;
  border-radius: 10px;
  font-family: 'Outfit', sans-serif;
  font-size: 15px;
  font-weight: 500;
  border: 1px solid rgba(240, 230, 210, 0.18);
  background: rgba(240, 230, 210, 0.05);
  color: #f0e6d2;
  cursor: pointer;
  margin-top: 12px;
}
.phone-btn-primary {
  background: #d4a853;
  color: #0a0a0f;
  border-color: #d4a853;
}

.phone-camera {
  position: fixed;
  inset: 0;
  background: #000;
  color: #f0e6d2;
  display: flex;
  flex-direction: column;
  font-family: 'Outfit', sans-serif;
}

.phone-camera-topbar {
  padding: 14px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0,0,0,0.5);
  z-index: 2;
}
.phone-camera-title {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 18px;
  color: #d4a853;
}
.phone-camera-status {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: #86e0a8;
}

.phone-camera-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
}
.phone-camera-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.phone-camera-frame {
  position: absolute;
  inset: 12% 8%;
  border: 1px dashed rgba(240, 230, 210, 0.45);
  border-radius: 6px;
  pointer-events: none;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 10px;
}
.phone-camera-frame-label {
  font-size: 11px;
  color: rgba(240, 230, 210, 0.65);
  background: rgba(0, 0, 0, 0.4);
  padding: 4px 8px;
  border-radius: 999px;
  letter-spacing: 0.04em;
}

.phone-camera-bottom {
  padding: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0,0,0,0.55);
}

.phone-shutter {
  width: 78px;
  height: 78px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 3px solid rgba(255, 255, 255, 0.85);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s ease;
}
.phone-shutter:active { transform: scale(0.94); }
.phone-shutter:disabled { opacity: 0.45; cursor: not-allowed; }
.phone-shutter-inner {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #d4a853;
  display: block;
}
.phone-shutter:disabled .phone-shutter-inner { background: rgba(255,255,255,0.18); }
```

- [ ] **Step 3: Manual verification on a phone**

This step needs a phone. Start the dev server and a tunnel:
```bash
npm run dev
# in another terminal:
cloudflared tunnel --url http://localhost:5173
```

Note the public HTTPS URL Cloudflare prints. On desktop, visit that URL, click "Pair Phone", and on the phone scan the QR (or visit the same URL appended with `/pair#s=<uuid>` from the desktop).

Verify on phone:
- "Connecting…" briefly, then camera prompt.
- After granting camera, see live rear-camera preview with the dashed frame and an enabled (amber) shutter.
- Desktop pairing modal status flips to "Phone connected · ready".

- [ ] **Step 4: Commit**

```bash
git add src/PhoneCapture.jsx src/App.css
git commit -m "feat: phone camera preview with connection-aware stream lifecycle"
```

---

### Task 9: PhoneCapture — capture, preview, and retake states

**Files:**
- Modify: `src/PhoneCapture.jsx`
- Modify: `src/App.css` (append styles)

- [ ] **Step 1: Add capture and preview state to PhoneCapture.jsx**

In `src/PhoneCapture.jsx`, modify the component to track a captured blob and add the preview branch.

Add a helper above the component:
```js
async function captureToBlob(video) {
  const maxEdge = 1600;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const longest = Math.max(vw, vh);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const cw = Math.round(vw * scale);
  const ch = Math.round(vh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, cw, ch);
  return new Promise((resolve) => {
    canvas.toBlob(b => resolve(b), 'image/jpeg', 0.85);
  });
}
```

Add state inside the component (alongside `cameraReady`/`cameraError`):
```js
const [captured, setCaptured] = useState(null); // { blob, previewUrl }

const onShutter = async () => {
  if (!videoRef.current || !cameraReady) return;
  const blob = await captureToBlob(videoRef.current);
  if (!blob) return;
  const previewUrl = URL.createObjectURL(blob);
  setCaptured({ blob, previewUrl });
};

const onRetake = () => {
  if (captured?.previewUrl) URL.revokeObjectURL(captured.previewUrl);
  setCaptured(null);
};
```

Wire the shutter button's `onClick`:
```jsx
<button
  className="phone-shutter"
  disabled={!cameraReady}
  aria-label="Capture"
  onClick={onShutter}
>
```

Add the preview branch — placed **after** the `cameraError` block and **before** the live-camera return:
```jsx
if (captured) {
  return (
    <div className="phone-camera">
      <div className="phone-camera-topbar">
        <span className="phone-camera-title">Looks good?</span>
      </div>

      <div className="phone-camera-viewport">
        <img src={captured.previewUrl} alt="Captured bill" className="phone-preview-img" />
      </div>

      <div className="phone-preview-actions">
        <button className="phone-btn" onClick={onRetake}>Retake</button>
        <button className="phone-btn phone-btn-primary">Send to desktop</button>
      </div>
    </div>
  );
}
```

(The Send button is wired in Task 10.)

- [ ] **Step 2: Append preview styles to App.css**

Append to `src/App.css`:
```css
.phone-preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.phone-preview-actions {
  padding: 18px;
  display: flex;
  justify-content: space-between;
  gap: 14px;
  background: rgba(0, 0, 0, 0.55);
}
.phone-preview-actions .phone-btn { flex: 1; padding: 14px 16px; font-size: 16px; }
```

- [ ] **Step 3: Manual verification on a phone**

Phone flow:
- Tap shutter → preview image appears with "Retake" and "Send to desktop" buttons.
- Tap "Retake" → returns to live camera.
- "Send to desktop" doesn't do anything yet (Task 10 wires it).

- [ ] **Step 4: Commit**

```bash
git add src/PhoneCapture.jsx src/App.css
git commit -m "feat: phone capture, preview, and retake states"
```

---

### Task 10: PhoneCapture — send via DataChannel + sending/sent states

**Files:**
- Modify: `src/PhoneCapture.jsx`
- Modify: `src/App.css` (append styles)

- [ ] **Step 1: Add justSent local state and wire the Send button**

In `src/PhoneCapture.jsx`, add a local state for the just-sent confirmation alongside the other component state:
```js
const [justSent, setJustSent] = useState(false);

const onSend = async () => {
  if (!captured) return;
  const arrayBuffer = await captured.blob.arrayBuffer();
  await peer.sendImage(new Uint8Array(arrayBuffer));
  URL.revokeObjectURL(captured.previewUrl);
  setCaptured(null);
  setJustSent(true);
};

useEffect(() => {
  if (!justSent) return;
  const t = setTimeout(() => setJustSent(false), 1500);
  return () => clearTimeout(t);
}, [justSent]);
```

Update the Send button:
```jsx
<button className="phone-btn phone-btn-primary" onClick={onSend}>
  Send to desktop
</button>
```

- [ ] **Step 2: Add the `sending` overlay branch**

Add this branch **before** the `if (captured)` branch:
```jsx
if (peer.status === 'sending') {
  return (
    <div className="phone-root">
      <div className="phone-spinner" />
      <h1>Sending…</h1>
      <p className="phone-sub">{Math.round(peer.sendProgress * 100)}% transferred</p>
    </div>
  );
}
```

- [ ] **Step 3: Add the `justSent` confirmation branch**

Add this branch **before** the `sending` branch:
```jsx
if (justSent) {
  return (
    <div className="phone-root">
      <div className="phone-check">✓</div>
      <h1>Sent to desktop</h1>
      <p className="phone-sub">Ready for the next bill</p>
    </div>
  );
}
```

The hook returns to `'ready'` as soon as the last chunk is sent, so the camera-acquisition `useEffect` in PhoneCapture re-runs naturally. After 1.5s `justSent` flips to `false`, falling through to the live-camera return.

- [ ] **Step 4: Append check-mark styles to App.css**

Append to `src/App.css`:
```css
.phone-check {
  font-size: 56px;
  color: #86e0a8;
  margin-bottom: 8px;
  filter: drop-shadow(0 0 12px rgba(134, 224, 168, 0.45));
}
```

- [ ] **Step 5: Manual verification on a phone**

End-to-end flow on phone:
- Tap shutter → preview.
- Tap "Send to desktop" → "Sending… N% transferred" overlay.
- Brief "✓ Sent to desktop" confirmation.
- Returns to live camera, ready for next capture.

On desktop, the pairing modal status briefly shows "Receiving image… N%" then back to "Phone connected · ready". The image won't go anywhere yet — that's wired in Task 11.

- [ ] **Step 6: Commit**

```bash
git add src/PhoneCapture.jsx src/App.css
git commit -m "feat: phone send via chunked DataChannel with progress and sent states"
```

---

### Task 11: Wire desktop receive → handleCapture

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add useEffect to consume desktop images**

Inside `function BillTracker()`, after the `desktopPeer` declaration, add:
```jsx
useEffect(() => {
  if (!desktopPeer.lastImage) return;
  handleCapture(desktopPeer.lastImage.dataUrl, 'phone');
  desktopPeer.consumeImage();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [desktopPeer.lastImage]);
```

`handleCapture` is already defined further down in the component. The `eslint-disable-next-line` is because we intentionally don't include `handleCapture` and `desktopPeer.consumeImage` in deps — they'd recreate the effect on every render.

If the lint rule still complains in your environment, an alternative is to wrap `handleCapture` in `useCallback` — but inspect first; the existing code may not need this if effects fire correctly.

- [ ] **Step 2: Manual verification end-to-end**

Run dev server + tunnel, open on desktop, pair with phone, capture and send a photo of a real receipt:

- Desktop pairing modal shows "Receiving image…" with progress.
- Once received, the existing OCR processing overlay appears ("Extracting text… N%").
- A new bill appears at the top of the bills list, parsed from the OCR text.
- The pairing modal returns to "Phone connected · ready".
- Phone returns to live camera; another capture works.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: pipe desktop-received images into existing handleCapture pipeline"
```

---

### Task 12: Polish — empty-session timeout cleanup, partial-receive timeout

**Files:**
- Modify: `src/useDesktopPeer.js`

This task adds the 30-second partial-receive timeout from the spec: if the phone starts sending an image and disconnects mid-stream, the desktop drops the partial buffer.

- [ ] **Step 1: Add receive timeout to handleData**

In `src/useDesktopPeer.js`, near the top of the file, add:
```js
const RECEIVE_TIMEOUT_MS = 30 * 1000;
```

Add a ref for the receive timer alongside the other refs:
```js
const receiveTimerRef = useRef(null);
```

Add helpers and update `handleData`:
```js
const armReceiveTimer = useCallback((id) => {
  if (receiveTimerRef.current) clearTimeout(receiveTimerRef.current);
  receiveTimerRef.current = setTimeout(() => {
    if (reassemblerRef.current) reassemblerRef.current.drop(id);
    setStatus(connRef.current && connRef.current.open ? 'paired' : 'disconnected');
    setReceiveProgress(0);
    receiveTimerRef.current = null;
  }, RECEIVE_TIMEOUT_MS);
}, []);

const disarmReceiveTimer = useCallback(() => {
  if (receiveTimerRef.current) {
    clearTimeout(receiveTimerRef.current);
    receiveTimerRef.current = null;
  }
}, []);
```

Update `handleData`:
```js
const handleData = useCallback((msg) => {
  if (!reassemblerRef.current) reassemblerRef.current = createReassembler();
  const r = reassemblerRef.current;
  if (msg.t === 'img-start') {
    r.onStart(msg);
    setStatus('receiving');
    setReceiveProgress(0);
    armReceiveTimer(msg.id);
  } else if (msg.t === 'img-chunk') {
    const update = r.onChunk(msg);
    if (update) {
      setReceiveProgress(update.progress);
      armReceiveTimer(msg.id);   // reset timer on activity
    }
  } else if (msg.t === 'img-end') {
    disarmReceiveTimer();
    const buffer = r.onEnd(msg);
    if (buffer) {
      const blob = new Blob([buffer], { type: 'image/jpeg' });
      const reader = new FileReader();
      reader.onload = () => {
        setLastImage({ dataUrl: reader.result, receivedAt: Date.now() });
        setStatus('paired');
        setReceiveProgress(0);
      };
      reader.readAsDataURL(blob);
    }
  }
}, [armReceiveTimer, disarmReceiveTimer]);
```

Update `cleanup` to clear the receive timer too:
```js
const cleanup = useCallback(() => {
  if (expiryTimerRef.current) {
    clearTimeout(expiryTimerRef.current);
    expiryTimerRef.current = null;
  }
  if (receiveTimerRef.current) {
    clearTimeout(receiveTimerRef.current);
    receiveTimerRef.current = null;
  }
  if (connRef.current) {
    try { connRef.current.close(); } catch (e) { /* ignore */ }
    connRef.current = null;
  }
  if (peerRef.current) {
    try { peerRef.current.destroy(); } catch (e) { /* ignore */ }
    peerRef.current = null;
  }
  reassemblerRef.current = null;
}, []);
```

- [ ] **Step 2: Manual verification (best-effort)**

Hard to simulate a mid-stream disconnect cleanly without WebRTC test tooling. Smoke-test that normal sends still work end-to-end (no regression).

- [ ] **Step 3: Commit**

```bash
git add src/useDesktopPeer.js
git commit -m "feat: 30s partial-receive timeout drops stranded buffers"
```

---

### Task 13: Final manual verification checklist

This task is a manual checklist run on real hardware. No code changes — just verify each item, fix anything broken, and commit any fixes as their own commits.

- [ ] **Step 1: Lint clean**

```bash
npm run lint
```

Fix any errors in the new files.

- [ ] **Step 2: Tests pass**

```bash
npm test -- --run
```

Expected: all `peerProtocol.test.js` tests PASS.

- [ ] **Step 3: Build succeeds**

```bash
npm run build
```

Expected: clean build with no errors. The `dist/` folder updates.

- [ ] **Step 4: End-to-end checklist on real devices**

Run dev + tunnel:
```bash
npm run dev
cloudflared tunnel --url http://localhost:5173
```

On desktop (Chrome/Firefox/Safari), open the tunnel URL. Walk through:

- [ ] "Pair Phone" opens modal showing QR within ~2 seconds.
- [ ] Countdown starts at `5:00` and decrements each second.
- [ ] Closing the modal (Done or backdrop) destroys the peer (verify: clicking Pair Phone again gets a new UUID in the QR URL).
- [ ] On phone (Android Chrome AND iOS Safari, ideally both), scan QR → companion page loads → camera permission prompt → live preview.
- [ ] Desktop modal flips to "Phone connected · ready".
- [ ] Capture a real receipt → preview appears → Send → "Sending… X%" → "✓ Sent" → returns to camera.
- [ ] Desktop OCR fires automatically; bill appears at top of list.
- [ ] Take a second photo without re-pairing — works.
- [ ] Tap Retake on the preview → returns to camera, no leftover.
- [ ] Rotate phone landscape ↔ portrait; preview adjusts (CSS `object-fit: cover` handles this).
- [ ] Close the desktop tab → phone shows "Desktop disconnected" + Reconnect.
- [ ] Re-open desktop, click Pair Phone for a new session → phone Reconnect button does not work (different session ID); phone needs to scan the new QR. (Behavior matches spec: a closed session is dead.)
- [ ] On a deliberately wrong link (e.g., `/pair#s=does-not-exist`), phone shows "Desktop session not found" within ~5 seconds.
- [ ] Test on cellular: turn off phone WiFi, repeat the basic capture flow. Should still work (TURN fallback kicks in if needed).

- [ ] **Step 5: Final commit (if any fixes were made during checklist)**

If any tasks above required fixes, commit them as their own focused commits (e.g., `fix: handle Safari getUserMedia rejection`).

---

## Notes on extension and future work (out of scope for this plan)

- Multi-photo per bill (capture 3 receipts in one bill)
- "Captured by phone" badge on bill cards
- PWA manifest for installable phone companion
- Self-hosted PeerJS broker (currently using `peerjs.com` public broker)

These are deliberately out of scope per the spec.

# Phone-Pairing Bill Capture

**Date:** 2026-05-09
**Status:** Design — pending implementation

## Summary

Add a "Pair Phone" feature so the user can scan a bill with their phone and have it appear on the desktop BillTracker as if it had been captured locally. The phone connects to the desktop via WebRTC peer-to-peer, brokered by PeerJS's free public service. No backend, no image storage on any third party, no native app.

## Goals

- One-tap on desktop generates a QR code that pairs the user's phone for a session.
- Phone runs as a remote camera: live preview, capture, retake/send confirm, send.
- Captured images flow into the existing desktop OCR + parse + bill-creation pipeline unchanged.
- Pair once, capture multiple bills in a session.
- Zero added infrastructure to host or pay for.

## Non-Goals (out of scope for v1)

- Multi-photo-per-bill capture
- Phone-side OCR preview
- Phone-side bill list or history
- Authentication or user accounts
- Self-hosted TURN infrastructure (we'll use Open Relay's free public TURN — see ICE Configuration)
- PWA installability / manifest
- Persisting session ID across desktop tab reloads
- A "captured by phone" visual badge on bill cards

## Architecture

The desktop app gains a "Pair Phone" action. Clicking it generates a fresh `crypto.randomUUID()` session ID, opens a PeerJS peer with ID `bt-<uuid>`, and renders a QR code containing `https://<origin>/pair#s=<uuid>`.

The phone scans the QR, opens the URL, and the same SPA boots into "phone mode" via a `window.location.pathname === '/pair'` check. The phone reads the session ID from the URL **fragment** (not query string — fragments aren't sent to servers, never appear in HTTP referer headers, and aren't logged by static hosts or CDNs). The phone opens its own PeerJS peer (random ID — phone is the dialer) and dials `bt-<uuid>`.

Once the WebRTC DataChannel is open, the phone shows a live camera preview with a shutter. Tap → preview → Retake or Send. Send transmits the JPEG bytes (chunked) over the encrypted DataChannel directly phone→desktop. The desktop reassembles the image and feeds it into the existing `handleCapture()` pipeline. The PeerJS broker handles only the initial signaling handshake; **no image bytes ever transit the broker**.

Hosting: deploy the static site to a public URL (Vercel/Netlify/Cloudflare Pages free tier). Phones on cellular need a real public origin to reach the app. The host must rewrite unmatched paths to `index.html` so the SPA can handle `/pair` client-side — Vercel does this by default; Netlify needs `_redirects` with `/* /index.html 200`; Cloudflare Pages needs the equivalent rewrite rule.

For local development, the phone cannot reach `localhost`. Use `cloudflared tunnel --url http://localhost:5173` (or ngrok) to expose the dev server over HTTPS for end-to-end testing on a real phone.

## ICE Configuration

PeerJS defaults to Google's public STUN servers, which work for ~85% of NATs. The remaining ~15% (symmetric NATs — common in cellular hotspots, corporate VPNs, some home routers) require TURN relay or the connection silently fails to establish.

We use the **Open Relay Project** free public TURN service, which provides hardcoded credentials and zero infra on our side:

```js
new Peer(peerId, {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    ],
  },
});
```

Same config on both phone and desktop. TURN is only used as fallback when STUN can't establish a direct path; the common case (same WiFi, or asymmetric NATs) still goes peer-to-peer.

## Components

### New files

- **`src/PhoneCapture.jsx`** — phone-side experience. States: `connecting` → `ready` → `previewing` → `sending` → `sent`. Plus error states `peer-not-found` and `disconnected`. Reuses the existing `CameraCapture` DOM pattern but adds the preview/retake step.
- **`src/PairingPanel.jsx`** — desktop-side modal. Shows QR, connection status pill (`waiting for phone…` / `phone connected · ready` / `disconnected`), and an "Unpair" button.
- **`src/usePhonePeer.js`** — phone-side hook owning the PeerJS peer lifecycle. Exposes `{ status, sendImage }`.
- **`src/useDesktopPeer.js`** — desktop-side hook owning the PeerJS peer lifecycle. Exposes `{ sessionId, status, lastImage, unpair }`. When `lastImage` fires, the host component pipes it into the existing `handleCapture()`.
- **`src/peerProtocol.js`** — shared module defining message shapes and the chunking protocol (see Transfer Protocol below).

### Modified files

- **`src/App.jsx`** — entry branches on `window.location.pathname === '/pair'` to render `<PhoneCapture />` vs the existing `<BillTracker />`. Adds a "Pair Phone" button to the actions row (next to Scan / Upload / Manual). Wires `useDesktopPeer().lastImage` into the existing `handleCapture()`. Removes the "Mobile App Coming Soon" sidebar panel.
- **`src/App.css`** — styles for `PairingPanel` (QR card, status pill) and `PhoneCapture` (full-screen camera, preview screen, thumb-sized buttons). Match existing Nocturne aesthetic — deep midnight, burnished amber accent (#d4a853), razor-thin borders, JetBrains Mono for any numeric/code-like display.
- **`package.json`** — add `peerjs` (~50KB) and `qrcode.react` (~7KB, renders SVG) as runtime deps.

No router library. The single `pathname` check is the entire routing system.

## Pairing Flow

### Desktop, on "Pair Phone" click

1. Generate `sessionId = crypto.randomUUID()`.
2. Construct peer ID `bt-<sessionId>` (the `bt-` prefix avoids collisions with other PeerJS users on the public broker).
3. Open `new Peer('bt-<sessionId>')`. PeerJS connects to the broker and registers.
4. On `peer.on('open')` → status flips to `waiting`. Render the QR encoding `https://<origin>/pair#s=<sessionId>`.
5. On `peer.on('connection', conn)`:
   - **While an active connection exists:** reject any new connection immediately (`conn.close()`).
   - **When no active connection exists:** accept. Wait for `conn.on('open')` → status flips to `paired`. The slot reopens after the current connection closes, so a phone that disconnected (cellular dropout, app backgrounded) can reconnect by re-scanning the same QR without the user generating a new one.
   - Wire `conn.on('data', handler)` (see Transfer Protocol).
   - Wire `conn.on('close')` → status flips to `disconnected`, desktop peer stays alive, slot reopens.
6. If no phone connects within **5 minutes** of the current state (waiting OR disconnected), destroy the peer and show "Pairing expired — click to retry." The pairing panel renders a live `mm:ss` countdown so the user sees the QR's remaining lifetime.
7. "Unpair" button: gracefully close the connection (so the phone receives `conn.on('close')` and keeps any in-progress capture in preview state), destroy the peer, drop the session ID.

### Phone, on landing at `/pair#s=<sessionId>`

1. Read `sessionId` from `window.location.hash`. If missing, show "Invalid pairing link."
2. Open `new Peer()` (random peer ID).
3. On `peer.on('open')` → call `peer.connect('bt-<sessionId>', { reliable: true })`.
4. On `conn.on('open')` → status flips to `ready`, request camera via `getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })`.
5. On `conn.on('error')` with `peer-unavailable` → "Desktop session not found — make sure the QR is still showing on the desktop."
6. On `conn.on('close')` → "Desktop disconnected." Show "Reconnect" button (re-dials the same `sessionId`).

### Security model

The session ID is a v4 UUID (122 bits of entropy) — unguessable. The QR is rendered only on the user's desktop screen. First-connection-wins prevents a hypothetical second device from racing in. Five-minute idle expiry bounds the attack window. No additional auth (no PIN, no confirmation prompt) — this matches the user's choice for a personal-use single-user app.

## Capture Flow

### Phone-side capture

1. **State `ready`:** live `<video>` preview, single shutter button at the bottom, matching the existing `CameraCapture` look (green shutter dot, dark overlay).
2. **Tap shutter:** draw current video frame to an offscreen canvas → `canvas.toBlob('image/jpeg', 0.85)`. State flips to `previewing`.
3. **State `previewing`:** full-bleed photo with two large thumb-friendly buttons — "Retake" (returns to `ready`) and "Send" (begins transfer).
4. **State `sending`:** progress bar showing chunks sent / total. Buttons disabled.
5. **State `sent`:** brief "✓ Sent to desktop" confirmation, auto-returns to `ready` after 1.5s for the next bill.

### Resize before send

Phone resizes the capture so the longest edge is at most **1600px**, preserving the original aspect ratio, before JPEG-encoding at quality 0.85. Receipts are text — beyond ~1600px Tesseract gets no accuracy benefit, and the file shrinks from multi-MB to typically 200–500KB. Done with a canvas downscale, no dependency.

## Transfer Protocol

WebRTC DataChannel messages have a practical safe size of ~16KB per message. A 500KB JPEG must be chunked.

`peerProtocol.js` defines:

```
{ t: 'img-start', id, mime: 'image/jpeg', size, chunks }
{ t: 'img-chunk', id, i, data }    // data = ArrayBuffer slice (binary, not base64)
{ t: 'img-end', id }
```

**Send order:** one `img-start` (JSON), then `chunks` consecutive `img-chunk` messages with `data` as raw `ArrayBuffer` slices (16384 bytes each), then one `img-end`. Each `await conn.send(...)` resolves when the underlying DataChannel buffer accepts it, providing natural backpressure. The `id` lets the desktop ignore stragglers from a previous canceled send.

**Desktop receive handler:**

1. On `img-start`: allocate `Uint8Array(size)` keyed by `id`. Status → `receiving`, progress 0.
2. On `img-chunk`: copy `data` into the buffer at offset `i * 16384`. Update progress = `i / chunks`.
3. On `img-end`: convert buffer to `Blob`, then `FileReader.readAsDataURL(blob)` to produce a data URL, then call existing `handleCapture(dataUrl, 'phone')`. Always going through a data URL matches the format the pipeline already uses (current camera and file-upload paths both deliver data URLs), avoids any blob-URL lifetime concerns, and adds negligible cost (~1ms for a 500KB blob).

The image goes straight into `handleCapture` — same processing overlay, same OCR progress bar, same parsed bill at the top of the list. Phone-captured bills are indistinguishable from locally-captured ones.

## Failure Modes

| Failure | Handling |
|---|---|
| PeerJS broker unreachable | Desktop: "Pairing service unavailable" + "Retry" button (re-instantiates the peer). Phone: "Cannot reach pairing service" + "Retry" button. |
| Phone scans QR after desktop closed pairing | Phone: "Desktop session not found" (peer-unavailable error). |
| Phone loses connection mid-send | Desktop drops the partial buffer for that `id` after a 30-second receive timeout. Phone: status → `disconnected`, image stays in preview state for resend after reconnect. |
| Desktop closes tab while phone is paired | Phone gets `conn.on('close')`, shows "Desktop disconnected" + Reconnect. |
| Camera permission denied on phone | Same UX as the existing `CameraCapture` — "Camera access denied." |
| iOS Safari camera quirks | `getUserMedia` works on iOS Safari 11+. The `<video>` element needs **both** `playsInline` and `muted` attributes for autoplay to succeed on iOS — `playsInline` already used in current code, `muted` to be added for the phone capture surface. |
| Image larger than expected | No special handling; chunking handles arbitrary sizes. Worst case is a longer progress bar. |
| Second phone scans the same QR while first is paired | Desktop closes the new connection immediately. New phone sees `conn.on('close')` → "Already paired with another device." |
| Two desktop tabs both click "Pair Phone" | Each generates its own session ID and own peer — they're independent. No collision. |

## Browser Support

WebRTC DataChannels are universal in modern Chrome, Safari, Firefox, and Edge (desktop and mobile). No polyfill needed. `crypto.randomUUID()` is supported in all current browsers Vite targets.

## Privacy

The session ID transits the PeerJS broker (peerjs.com) only for routing during the handshake. **No image bytes ever traverse the broker** — they go directly phone→desktop over the encrypted (DTLS) WebRTC DataChannel. Worth a one-liner in any user-facing "About pairing" copy.

## Implementation Notes

- The `bt-` prefix on peer IDs (`bt-<uuid>`) prevents collisions with other PeerJS users on the public broker; the broker is global and shared.
- `qrcode.react` renders an SVG, which scales crisply at any size and avoids canvas headaches.
- The phone capture path delivers a data URL to `handleCapture` (via `FileReader.readAsDataURL`), matching the format the existing camera and file-upload paths already use.
- Keep new components in their own files. The user has previously noted that `App.jsx` is already monolithic — don't grow it further than necessary.
- Match the existing Nocturne aesthetic in all new UI: Cormorant Garamond italic for headers, Outfit for body, JetBrains Mono for numerics, deep midnight backgrounds, #d4a853 amber accent, razor-thin borders. The countdown timer in `PairingPanel` should use JetBrains Mono.
- During implementation, verify that the `<video>` element handles phone rotation gracefully (CSS `object-fit: cover` on the video typically handles this; `getUserMedia` itself does not auto-rotate, so test landscape/portrait switches before declaring done).

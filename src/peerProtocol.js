export const CHUNK_SIZE = 16 * 1024;

export const FATAL_PEER_ERRORS = new Set([
  'browser-incompatible',
  'invalid-id',
  'invalid-key',
  'ssl-unavailable',
  'server-error',
  'socket-error',
  'socket-closed',
  'unavailable-id',
]);

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

// crypto.randomUUID is only available in secure contexts (HTTPS / localhost).
// Phone pairing is commonly tested over a plain-HTTP LAN address (`npm run dev
// --host`), where crypto.randomUUID is undefined and throws. Fall back to a
// v4-shaped UUID built from getRandomValues (available in insecure contexts) or
// Math.random, keeping the same id format so PeerJS ids are unchanged.
export function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function makeImageChunks(bytes, mime, extra = {}) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // extra.id (when given) becomes the shared frame id so a caller can key the
  // image on its own stable id; otherwise mint one. The remaining extra fields
  // (batchId/index/name) merge into the img-start frame only.
  const { id: overrideId, ...rest } = extra;
  const id = overrideId || randomId();
  const size = buffer.byteLength;
  const chunks = Math.max(1, Math.ceil(size / CHUNK_SIZE));
  const slices = [];
  for (let i = 0; i < chunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, size);
    slices.push(buffer.slice(start, end));
  }
  return {
    start: { t: 'img-start', id, mime, size, chunks, ...rest },
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
      const offset = i * CHUNK_SIZE;
      if (offset < 0 || offset + chunk.byteLength > entry.size) {
        // Bad chunk — drop the entire transfer rather than partially-corrupting the buffer.
        buffers.delete(id);
        return null;
      }
      entry.buffer.set(chunk, offset);
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

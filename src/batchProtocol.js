// src/batchProtocol.js
// Pure multi-photo batch framing on top of peerProtocol's per-image chunking.
// No canvas, no IndexedDB, no React — operates on raw bytes + message objects so
// it is fully unit-testable (the model is peerProtocol.test.js). Committing and
// ack-sending live in the impure peer hooks, not here.
import { createReassembler } from './peerProtocol.js';

export function makeBatchStart(batchId, count) {
  return { t: 'batch-start', batchId, count };
}

export function makeImageAck(batchId, id, index, ok) {
  return { t: 'img-ack', batchId, id, index, ok: !!ok };
}

// Desktop side. Feed it every inbound message; it returns one event or null.
// Events: { type:'batch-start', count } | { type:'img-start', id, index }
//       | { type:'progress', id, index, photoProgress }
//       | { type:'image-complete', id, index, name, mime, bytes }
//       | { type:'duplicate', id, index }
//
// Dedup is keyed on a CONFIRMED COMMIT, not on reassembly: the glue must call
// markCommitted(id) only after the photo is safely in the library. An id that
// reassembled but was NOT committed (a nacked photo) re-emits image-complete on
// retry, so a failed commit is never silently treated as done. Overall progress
// is the glue's concern (it knows committed vs. failed), so it is not tracked here.
export function createBatchReceiver() {
  const reassembler = createReassembler();
  const meta = new Map();        // id -> { index, name, mime }
  const committed = new Set();   // ids the glue confirmed are in the library
  let count = 0;

  return {
    onMessage(msg) {
      if (!msg || !msg.t) return null;
      if (msg.t === 'batch-start') {
        count = msg.count;
        return { type: 'batch-start', count };
      }
      if (msg.t === 'img-start') {
        meta.set(msg.id, { index: msg.index, name: msg.name, mime: msg.mime || 'image/jpeg' });
        reassembler.onStart(msg);
        return { type: 'img-start', id: msg.id, index: msg.index };
      }
      if (msg.t === 'img-chunk') {
        const u = reassembler.onChunk(msg);
        if (!u) return null;
        const m = meta.get(msg.id) || {};
        return { type: 'progress', id: msg.id, index: m.index, photoProgress: u.progress };
      }
      if (msg.t === 'img-end') {
        const m = meta.get(msg.id) || {};
        if (committed.has(msg.id)) {
          reassembler.drop(msg.id); // clear any re-sent buffer; do not re-deliver
          return { type: 'duplicate', id: msg.id, index: m.index };
        }
        const bytes = reassembler.onEnd(msg);
        if (!bytes) return null; // corrupt/unknown — dropped, other images unaffected
        return { type: 'image-complete', id: msg.id, index: m.index, name: m.name, mime: m.mime || 'image/jpeg', bytes };
      }
      return null;
    },
    markCommitted(id) { committed.add(id); },
    count: () => count,
    committedCount: () => committed.size,
  };
}

// Phone side. Pure status tracker; the hook owns the raw bytes + chunking and
// reports acks here. Retry = a fresh sender over failed() ids, reusing the same
// per-photo ids so the desktop dedups correctly.
export function createBatchSender(items) {
  const order = items.map(it => it.id);
  const status = new Map(order.map(id => [id, 'pending'])); // pending|done|failed
  return {
    pending: () => order.filter(id => status.get(id) === 'pending'),
    failed: () => order.filter(id => status.get(id) === 'failed'),
    onAck: ({ id, ok }) => { if (status.has(id)) status.set(id, ok ? 'done' : 'failed'); },
    markFailed: (id) => { if (status.get(id) === 'pending') status.set(id, 'failed'); },
    allSettled: () => order.every(id => status.get(id) !== 'pending'),
    statusOf: (id) => status.get(id),
  };
}

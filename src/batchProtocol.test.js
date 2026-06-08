import { describe, it, expect } from 'vitest';
import { makeImageChunks, CHUNK_SIZE } from './peerProtocol.js';
import {
  makeBatchStart, makeImageAck, createBatchReceiver, createBatchSender,
} from './batchProtocol.js';

function feedImage(receiver, bytes, { batchId, index, name, mime = 'image/jpeg' }) {
  const { start, chunks, end } = makeImageChunks(bytes, mime, { batchId, index, name });
  receiver.onMessage(start);
  let last = null;
  for (const c of chunks) last = receiver.onMessage(c);
  const done = receiver.onMessage(end);
  return { id: start.id, lastProgress: last, done };
}

// Re-send the same image (same id) — models a phone retry after a lost/failed ack.
function resendImage(receiver, bytes, id, mime = 'image/jpeg') {
  const { start, chunks, end } = makeImageChunks(bytes, mime, { id });
  receiver.onMessage(start);
  for (const c of chunks) receiver.onMessage(c);
  return receiver.onMessage(end);
}

describe('makeBatchStart / makeImageAck', () => {
  it('builds a batch-start frame', () => {
    expect(makeBatchStart('b1', 3)).toEqual({ t: 'batch-start', batchId: 'b1', count: 3 });
  });
  it('builds an img-ack frame with coerced boolean', () => {
    expect(makeImageAck('b1', 'id1', 0, 1)).toEqual({ t: 'img-ack', batchId: 'b1', id: 'id1', index: 0, ok: true });
  });
});

describe('createBatchReceiver', () => {
  it('reports the batch count from batch-start', () => {
    const r = createBatchReceiver();
    expect(r.onMessage(makeBatchStart('b1', 4))).toEqual({ type: 'batch-start', count: 4 });
    expect(r.count()).toBe(4);
  });

  it('emits image-complete with metadata and original bytes (no overall on the event)', () => {
    const r = createBatchReceiver();
    r.onMessage(makeBatchStart('b1', 1));
    const bytes = new Uint8Array(CHUNK_SIZE + 7).map((_, i) => i % 256);
    const { done } = feedImage(r, bytes, { batchId: 'b1', index: 0, name: 'a.jpg' });
    expect(done.type).toBe('image-complete');
    expect(done.index).toBe(0);
    expect(done.name).toBe('a.jpg');
    expect(done.mime).toBe('image/jpeg');
    expect(done.bytes).toBeInstanceOf(Uint8Array);
    expect(done.bytes.length).toBe(bytes.length);
    expect(Array.from(done.bytes)).toEqual(Array.from(bytes));
  });

  it('counts an image as committed only after markCommitted', () => {
    const r = createBatchReceiver();
    r.onMessage(makeBatchStart('b1', 2));
    const { id } = feedImage(r, new Uint8Array(10), { batchId: 'b1', index: 0, name: 'a' });
    expect(r.committedCount()).toBe(0);
    r.markCommitted(id);
    expect(r.committedCount()).toBe(1);
  });

  it('reports a DUPLICATE only for an id that was already committed (lost-ack retry)', () => {
    const r = createBatchReceiver();
    r.onMessage(makeBatchStart('b1', 1));
    const bytes = new Uint8Array(20).map((_, i) => i);
    const { id } = feedImage(r, bytes, { batchId: 'b1', index: 0, name: 'a' });
    r.markCommitted(id); // commit succeeded; the ack was then lost
    const ev = resendImage(r, bytes, id);
    expect(ev.type).toBe('duplicate');
    expect(ev.id).toBe(id);
    expect(r.committedCount()).toBe(1); // not double-counted
  });

  it('RE-EMITS image-complete for an uncommitted (nacked) id on retry — no silent loss', () => {
    const r = createBatchReceiver();
    r.onMessage(makeBatchStart('b1', 1));
    const bytes = new Uint8Array(25).map((_, i) => i);
    const { id } = feedImage(r, bytes, { batchId: 'b1', index: 0, name: 'a' });
    // Commit FAILED → markCommitted was never called. Phone retries the same id.
    const ev = resendImage(r, bytes, id);
    expect(ev.type).toBe('image-complete');
    expect(Array.from(ev.bytes)).toEqual(Array.from(bytes));
  });

  it('drops a corrupt image without affecting other images', () => {
    const r = createBatchReceiver();
    r.onMessage(makeBatchStart('b1', 2));
    // Corrupt image: start says size 100 but a chunk is out of range.
    r.onMessage({ t: 'img-start', id: 'bad', size: 100, chunks: 1, batchId: 'b1', index: 0, name: 'bad' });
    r.onMessage({ t: 'img-chunk', id: 'bad', i: 99, data: new Uint8Array(10) });
    const badEnd = r.onMessage({ t: 'img-end', id: 'bad' });
    expect(badEnd).toBeNull();
    // Good image still completes.
    const { done, id } = feedImage(r, new Uint8Array(30), { batchId: 'b1', index: 1, name: 'good' });
    expect(done.type).toBe('image-complete');
    r.markCommitted(id);
    expect(r.committedCount()).toBe(1);
  });

  it('ignores unknown messages', () => {
    const r = createBatchReceiver();
    expect(r.onMessage({ t: 'nonsense' })).toBeNull();
    expect(r.onMessage(null)).toBeNull();
  });
});

describe('createBatchSender', () => {
  const items = [{ id: 'a', mime: 'image/jpeg', name: 'a' }, { id: 'b', mime: 'image/jpeg', name: 'b' }];

  it('starts with all items pending', () => {
    const s = createBatchSender(items);
    expect(s.pending()).toEqual(['a', 'b']);
    expect(s.failed()).toEqual([]);
    expect(s.allSettled()).toBe(false);
  });

  it('marks items done or failed from acks', () => {
    const s = createBatchSender(items);
    s.onAck({ id: 'a', ok: true });
    s.onAck({ id: 'b', ok: false });
    expect(s.pending()).toEqual([]);
    expect(s.failed()).toEqual(['b']);
    expect(s.allSettled()).toBe(true);
  });

  it('markFailed only affects still-pending items', () => {
    const s = createBatchSender(items);
    s.onAck({ id: 'a', ok: true });
    s.markFailed('a'); // already done — no-op
    s.markFailed('b');
    expect(s.failed()).toEqual(['b']);
  });
});

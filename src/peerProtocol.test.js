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

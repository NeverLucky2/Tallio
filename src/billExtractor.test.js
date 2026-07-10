import { describe, it, expect, vi } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: createMock }; } }));

import {
  parseDataUrl,
  stripMarkdownFences,
  validateResponse,
  mapError,
  extractBillFromImage,
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

  it('accepts data URLs with charset parameters', () => {
    const result = parseDataUrl('data:image/jpeg;charset=utf-8;base64,abc');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.base64).toBe('abc');
  });

  it('trims surrounding whitespace and trailing newlines', () => {
    const result = parseDataUrl('  data:image/jpeg;base64,abc\n  ');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.base64).toBe('abc');
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

  it('strips fences when wrapped by prose preamble', () => {
    const input = "Here's the extracted data:\n```json\n{\"vendor\":\"Acme\"}\n```";
    expect(stripMarkdownFences(input)).toBe('{"vendor":"Acme"}');
  });

  it('strips fences when wrapped by prose postamble', () => {
    const input = '```json\n{"vendor":"Acme"}\n```\n\nThanks!';
    expect(stripMarkdownFences(input)).toBe('{"vendor":"Acme"}');
  });

  it('extracts first JSON object from unfenced prose', () => {
    const input = 'Sure, here it is: {"vendor":"Acme"} hope this helps!';
    expect(stripMarkdownFences(input)).toBe('{"vendor":"Acme"}');
  });
});

describe('validateResponse', () => {
  it('accepts a complete valid object', () => {
    const result = validateResponse({
      vendor: 'Costco',
      month: '2026-05',
      items: [{ description: 'Eggs', amount: 4.99, date: '2026-05-09' }],
    });
    expect(result.vendor).toBe('Costco');
    expect(result.month).toBe('2026-05');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].amount).toBe(4.99);
    expect(result.items[0].date).toBe('2026-05-09');
  });

  it('accepts null vendor and month', () => {
    const result = validateResponse({
      vendor: null,
      month: null,
      items: [],
    });
    expect(result.vendor).toBeNull();
    expect(result.month).toBeNull();
    expect(result.items).toEqual([]);
  });

  it('throws when items is missing', () => {
    expect(() => validateResponse({ vendor: 'X', month: null })).toThrow();
  });

  it('throws when items is not an array', () => {
    expect(() => validateResponse({ vendor: 'X', month: null, items: 'oops' })).toThrow();
  });

  it('drops items with non-numeric amount', () => {
    const result = validateResponse({
      vendor: 'X',
      month: null,
      items: [
        { description: 'Good', amount: 5.99 },
        { description: 'Bad', amount: 'NaN' },
      ],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBe('Good');
  });

  it('drops items with zero amount but keeps negatives (refunds)', () => {
    const result = validateResponse({
      vendor: 'X',
      month: null,
      items: [
        { description: 'Free sample', amount: 0 },
        { description: 'Refund', amount: -2.50 },
        { description: 'Real item', amount: 1.99 },
      ],
    });
    expect(result.items).toHaveLength(2);
    expect(result.items.map(i => i.description)).toEqual(['Refund', 'Real item']);
  });

  it('drops items with empty description', () => {
    const result = validateResponse({
      vendor: 'X',
      month: null,
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

  it('coerces empty/whitespace vendor and month to null', () => {
    const result = validateResponse({
      vendor: '',
      month: '   ',
      items: [],
    });
    expect(result.vendor).toBeNull();
    expect(result.month).toBeNull();
  });

  it('truncates a YYYY-MM-DD month value to YYYY-MM', () => {
    const result = validateResponse({
      vendor: 'X',
      month: '2026-05-09',
      items: [],
    });
    expect(result.month).toBe('2026-05');
  });

  it('passes through a YYYY-MM month value', () => {
    const result = validateResponse({
      vendor: 'X',
      month: '2026-05',
      items: [],
    });
    expect(result.month).toBe('2026-05');
  });

  it('rejects a malformed month string', () => {
    const result = validateResponse({
      vendor: 'X',
      month: 'May 2026',
      items: [],
    });
    expect(result.month).toBeNull();
  });

  it('keeps item.date when it is a valid YYYY-MM-DD', () => {
    const result = validateResponse({
      vendor: 'X',
      month: '2026-05',
      items: [{ description: 'Coffee', amount: 5, date: '2026-05-09' }],
    });
    expect(result.items[0].date).toBe('2026-05-09');
  });

  it('drops item.date when it is malformed', () => {
    const result = validateResponse({
      vendor: 'X',
      month: '2026-05',
      items: [{ description: 'Coffee', amount: 5, date: 'May 9' }],
    });
    expect(result.items[0].date).toBeNull();
  });

  it('sets item.date to null when missing', () => {
    const result = validateResponse({
      vendor: 'X',
      month: '2026-05',
      items: [{ description: 'Coffee', amount: 5 }],
    });
    expect(result.items[0].date).toBeNull();
  });
});

describe('validateResponse (negative amounts)', () => {
  it('accepts negative amount (refund line)', () => {
    const parsed = {
      vendor: 'Chase',
      month: '2026-05',
      items: [{ description: 'Whole Foods refund', amount: -40, date: '2026-05-12' }],
    };
    const out = validateResponse(parsed);
    expect(out.items).toHaveLength(1);
    expect(out.items[0].amount).toBe(-40);
  });

  it('rejects amount === 0', () => {
    const parsed = {
      vendor: 'Chase',
      month: '2026-05',
      items: [
        { description: 'Real line', amount: 10, date: '2026-05-01' },
        { description: 'Zero',      amount:  0, date: '2026-05-02' },
      ],
    };
    const out = validateResponse(parsed);
    expect(out.items).toHaveLength(1);
    expect(out.items[0].description).toBe('Real line');
  });

  it('still rejects non-finite amounts', () => {
    const parsed = {
      vendor: 'V', month: '2026-05',
      items: [{ description: 'NaN', amount: NaN, date: null }],
    };
    expect(validateResponse(parsed).items).toHaveLength(0);
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

describe('extractBillFromImage signal', () => {
  it('forwards the abort signal to messages.create', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: '{"vendor":null,"month":null,"items":[]}' }] });
    const controller = new AbortController();
    await extractBillFromImage('data:image/png;base64,QUJD', { apiKey: 'sk-ant-x', model: 'm', signal: controller.signal });
    expect(createMock).toHaveBeenCalledWith(expect.any(Object), { signal: controller.signal });
  });
});

// src/fonts.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('offline fonts', () => {
  it('index.html does not reference the Google Fonts CDN', () => {
    const html = readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    expect(html).not.toMatch(/fonts\.googleapis\.com/);
    expect(html).not.toMatch(/fonts\.gstatic\.com/);
  });
});

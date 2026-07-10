// src/reloadApp.test.js
import { describe, it, expect } from 'vitest';
import { reloadApp } from './reloadApp.js';
describe('reloadApp', () => {
  it('is a callable function', () => { expect(typeof reloadApp).toBe('function'); });
});

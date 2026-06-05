import { describe, it, expect } from 'vitest';
import { listImageGroups, moveTargetGroups } from './imageGroups.js';

const imgs = (groups) => groups.map((g, i) => ({ id: String(i), group: g }));

describe('listImageGroups', () => {
  it('lists custom groups first (even when empty), then image-only groups, Uncategorized last', () => {
    const images = imgs(['Pets', undefined, 'Scenery']);
    expect(listImageGroups(images, ['Family', 'Pets']))
      .toEqual(['Family', 'Pets', 'Scenery', 'Uncategorized']);
  });

  it('keeps an empty custom group visible', () => {
    expect(listImageGroups([], ['Family'])).toEqual(['Family']);
  });

  it('omits Uncategorized when nothing is uncategorized', () => {
    expect(listImageGroups(imgs(['Pets']), ['Pets'])).toEqual(['Pets']);
  });
});

describe('moveTargetGroups', () => {
  it('includes all groups + Uncategorized, excluding the current one', () => {
    const images = imgs(['Pets']);
    expect(moveTargetGroups(images, ['Family', 'Pets'], 'Pets'))
      .toEqual(['Family', 'Uncategorized']);
  });

  it('always offers Uncategorized as a target', () => {
    expect(moveTargetGroups([], ['Family'], null)).toEqual(['Family', 'Uncategorized']);
  });
});

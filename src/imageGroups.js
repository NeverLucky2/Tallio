// src/imageGroups.js
// Pure helpers for the image-library group sections. Custom groups (persisted in
// appearance) are first-class: they show even when empty and only disappear when
// explicitly deleted. "Uncategorized" holds images with no/Uncategorized group.
const UNCATEGORIZED = 'Uncategorized';

function groupsFromImages(images) {
  const seen = [];
  for (const im of images || []) {
    const g = (im && im.group) || UNCATEGORIZED;
    if (!seen.includes(g)) seen.push(g);
  }
  return seen;
}

// Ordered display sections: custom groups (in order, even if empty), then any
// group only referenced by images, then Uncategorized last (only if non-empty).
export function listImageGroups(images, customGroups = []) {
  const fromImages = groupsFromImages(images);
  const ordered = [];
  for (const g of customGroups) if (g && g !== UNCATEGORIZED && !ordered.includes(g)) ordered.push(g);
  for (const g of fromImages) if (g !== UNCATEGORIZED && !ordered.includes(g)) ordered.push(g);
  if (fromImages.includes(UNCATEGORIZED)) ordered.push(UNCATEGORIZED);
  return ordered;
}

// Move targets always include Uncategorized; the current group is excluded.
export function moveTargetGroups(images, customGroups = [], exclude = null) {
  const all = listImageGroups(images, customGroups);
  const targets = [...all];
  if (!targets.includes(UNCATEGORIZED)) targets.push(UNCATEGORIZED);
  return targets.filter(g => g !== exclude);
}

// src/scanMatch.js
// Guess which existing account a scanned bill belongs to by matching the vendor /
// card name (printed at the top of the bill) against account names. Conservative:
// the user confirms every scan, so a wrong guess costs one click. Pure + testable.

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(s) {
  return normalize(s).split(' ').filter(t => t.length >= 3);
}

export function matchAccountByVendor(vendor, accounts) {
  const v = normalize(vendor);
  if (!v || !accounts || accounts.length === 0) return null;
  const vTokens = new Set(tokens(vendor));

  for (const a of accounts) {
    const n = normalize(a.name);
    if (!n) continue;
    if (n === v || v.includes(n) || n.includes(v)) return a;
  }
  // Fall back to a shared significant token.
  for (const a of accounts) {
    if (tokens(a.name).some(t => vTokens.has(t))) return a;
  }
  return null;
}

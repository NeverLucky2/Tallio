// src/seasonalMath.js
// Pure date -> season / holiday mapping (Northern hemisphere).
export function seasonForDate(date) {
  const m = (date instanceof Date ? date.getMonth() : new Date().getMonth()); // 0-11
  if (m === 11 || m === 0 || m === 1) return 'winter';
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  return 'autumn';
}

export function holidayForDate(date) {
  const m = date.getMonth() + 1;
  const day = date.getDate();
  if ((m === 12 && day === 31) || (m === 1 && day === 1)) return 'newyear';
  if (m === 10 && day === 31) return 'halloween';
  return null;
}

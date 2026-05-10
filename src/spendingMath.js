const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function migrateBills(bills) {
  if (!Array.isArray(bills)) return [];
  return bills.map(bill => {
    if (bill && typeof bill.month === 'string' && MONTH_RE.test(bill.month)) {
      const { date, ...rest } = bill;
      return rest;
    }
    let month = currentMonth();
    if (bill && typeof bill.date === 'string' && DATE_RE.test(bill.date)) {
      month = bill.date.slice(0, 7);
    }
    const { date, ...rest } = bill || {};
    return { ...rest, month };
  });
}

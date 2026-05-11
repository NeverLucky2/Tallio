function formatMonth(monthString) {
  const [y, m] = monthString.split('-').map(n => parseInt(n, 10));
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function nextMonthLabel(monthString) {
  const [y, m] = monthString.split('-').map(n => parseInt(n, 10));
  const total = y * 12 + (m - 1) + 1;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return formatMonth(`${ny}-${String(nm).padStart(2, '0')}`);
}

export default function RecurringConflictDialog({
  conflict, sourceBill, existingBill, onLink, onDuplicate, onSkip,
}) {
  const vendor = sourceBill?.vendor || existingBill?.vendor || 'this vendor';
  const monthLabel = formatMonth(conflict.targetMonth);
  const nextMonth = nextMonthLabel(conflict.targetMonth);

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog dialog-conflict">
        <h3 className="dialog-title">{monthLabel} already has a {vendor} bill.</h3>
        <div className="dialog-body">
          <p>
            <strong>{vendor}</strong> is set to recur monthly, and there&apos;s already a bill from
            this vendor in <strong>{monthLabel}</strong>. What should happen?
          </p>
          <ul className="conflict-options">
            <li><strong>Link</strong> — join the existing {monthLabel} bill to the recurring chain.</li>
            <li><strong>Duplicate</strong> — create a separate recurring instance alongside it.</li>
            <li><strong>Skip</strong> — leave {monthLabel} alone; resume the chain in {nextMonth}.</li>
          </ul>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => onSkip(conflict)}>Skip</button>
          <button type="button" className="btn btn-secondary" onClick={() => onDuplicate(conflict)}>Duplicate</button>
          <button type="button" className="btn btn-primary"   onClick={() => onLink(conflict)}>Link</button>
        </div>
      </div>
    </div>
  );
}

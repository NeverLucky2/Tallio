function formatMonth(monthString) {
  const [y, m] = monthString.split('-').map(n => parseInt(n, 10));
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default function RecurringConflictDialog({
  conflict, sourceBill, existingBill, onLink, onDuplicate, onSkip,
}) {
  const vendor = sourceBill?.vendor || existingBill?.vendor || 'this vendor';
  const monthLabel = formatMonth(conflict.targetMonth);

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog dialog-conflict">
        <h3 className="dialog-title">{vendor} — {monthLabel} conflict</h3>
        <div className="dialog-body">
          <p>
            This vendor is set to recur monthly, but there&apos;s already a bill for this month.
            What should happen?
          </p>
          <ul className="conflict-options">
            <li><strong>Link</strong> — join the existing bill to the recurring chain.</li>
            <li><strong>Duplicate</strong> — create a separate recurring instance alongside it.</li>
            <li><strong>Skip</strong> — leave this month alone; resume the chain next month.</li>
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

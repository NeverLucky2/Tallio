export default function RecurringTipDialog({ onDismiss }) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog dialog-tip">
        <h3 className="dialog-title">About recurring bills</h3>
        <div className="dialog-body">
          <p>
            Marking this bill as recurring tells BillTracker to <strong>auto-create
            next month's copy</strong> the next time you open the app. The <strong>latest
            instance</strong> in the chain is always the source — editing future months
            naturally updates what gets copied forward.
          </p>
          <p>
            If you change your mind, click <strong>Recurring · on</strong> to turn it
            off, or hit <strong>Undo</strong> in the top toolbar to back out completely.
          </p>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={onDismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

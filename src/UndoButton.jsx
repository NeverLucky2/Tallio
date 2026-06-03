export default function UndoButton({ count = 0, onUndo }) {
  return (
    <button
      type="button"
      onClick={onUndo}
      disabled={count === 0}
      className={`btn btn-undo${count > 0 ? ' active' : ''}`}
    >
      ↩ Undo{count > 0 ? ` (${count})` : ''}
    </button>
  );
}

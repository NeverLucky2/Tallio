// src/LiveFilePill.jsx
// Small status indicator for the linked live file.
export default function LiveFilePill({ status, fileName, lastSavedAt }) {
  if (status === 'linked') {
    return (
      <span className="live-file-pill live-file-pill--linked" title={fileName}>
        ● Linked to {fileName}{lastSavedAt ? ' · saved' : ''}
      </span>
    );
  }
  return <span className="live-file-pill">○ Not linked · using browser storage</span>;
}

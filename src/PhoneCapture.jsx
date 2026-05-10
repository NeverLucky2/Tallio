import React from 'react';

export default function PhoneCapture() {
  const sessionId = window.location.hash.replace(/^#s=/, '');

  if (!sessionId) {
    return (
      <div className="phone-root phone-error">
        <h1>Invalid pairing link</h1>
        <p>This link is missing a session ID.</p>
      </div>
    );
  }

  return (
    <div className="phone-root">
      <h1>BillTracker — Phone</h1>
      <p>Session: <code>{sessionId}</code></p>
      <p>(stub)</p>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

function formatRemaining(ms) {
  if (ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function statusLabel(status) {
  switch (status) {
    case 'connecting': return 'Connecting to pairing service…';
    case 'waiting':    return 'Waiting for phone…';
    case 'paired':     return 'Phone connected · ready';
    case 'receiving':  return 'Receiving image…';
    case 'disconnected': return 'Phone disconnected';
    case 'expired':    return 'Pairing expired';
    case 'error':      return 'Pairing error';
    default:           return '';
  }
}

function statusToneClass(status) {
  if (status === 'paired' || status === 'receiving') return 'pair-status-pill pair-status-good';
  if (status === 'error' || status === 'expired')    return 'pair-status-pill pair-status-bad';
  return 'pair-status-pill';
}

export default function PairingPanel({ peer, onClose }) {
  const { sessionId, status, errorMessage, expiresAt, receiveProgress, start, unpair } = peer;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const url = sessionId
    ? `${window.location.origin}/pair#s=${sessionId}`
    : null;

  const handleClose = () => {
    unpair();
    onClose();
  };

  return (
    <div className="pair-overlay" onClick={handleClose}>
      <div className="pair-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pair-header">
          <h2 className="pair-title">Pair Phone</h2>
          <button className="pair-close" onClick={handleClose}>×</button>
        </div>

        <div className="pair-body">
          {status === 'error' ? (
            <div className="pair-error">
              <p>{errorMessage || 'Pairing failed.'}</p>
              <button className="btn btn-primary" onClick={start}>Retry</button>
            </div>
          ) : status === 'expired' ? (
            <div className="pair-error">
              <p>Pairing expired. Click below to generate a fresh code.</p>
              <button className="btn btn-primary" onClick={start}>New Code</button>
            </div>
          ) : url ? (
            <>
              <div className="pair-qr-card">
                <QRCodeSVG
                  value={url}
                  size={232}
                  bgColor="#f0e6d2"
                  fgColor="#0a0a0f"
                  level="M"
                  includeMargin
                />
              </div>
              <p className="pair-instructions">
                Open your phone camera and scan this code. The pairing page will
                open in your phone's browser.
              </p>
            </>
          ) : (
            <p className="pair-instructions">Generating pairing code…</p>
          )}

          <div className={statusToneClass(status)}>
            <span className="pair-status-dot" />
            {statusLabel(status)}
            {status === 'receiving' && receiveProgress > 0 && (
              <span className="pair-progress">{Math.round(receiveProgress * 100)}%</span>
            )}
          </div>

          {expiresAt && (status === 'waiting' || status === 'disconnected') && (
            <p className="pair-countdown">
              Expires in <span className="pair-countdown-num">{formatRemaining(expiresAt - now)}</span>
            </p>
          )}
        </div>

        <div className="pair-footer">
          <button className="btn" onClick={handleClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

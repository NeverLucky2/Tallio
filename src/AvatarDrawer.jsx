// src/AvatarDrawer.jsx
// Right slide-in account drawer, anchored to the header avatar. Closes on
// scrim click, ×, Escape, or item select. Reduced motion skips the slide.
import React, { useEffect } from 'react';
import './AvatarDrawer.css';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function AvatarDrawer({ open, onClose, items = [], version = '', avatar = null, reducedMotion }) {
  const rm = reducedMotion ?? prefersReducedMotion();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const select = (it) => { it.onSelect(); if (onClose) onClose(); };

  return (
    <div className="avatar-drawer-root">
      <div className="avatar-drawer-scrim" onClick={() => onClose && onClose()} role="presentation" />
      <div className={`avatar-drawer-panel${rm ? ' no-anim' : ''}`} role="dialog" aria-modal="true" aria-label="Account menu">
        <div className="avatar-drawer-head">
          {avatar || <span className="avatar-drawer-avatar" aria-hidden="true">✦</span>}
          <div className="avatar-drawer-id">
            <div className="avatar-drawer-title">Your Tallio</div>
            <div className="avatar-drawer-sub">Account</div>
          </div>
          <button type="button" className="avatar-drawer-close" aria-label="Close menu" onClick={() => onClose && onClose()}>×</button>
        </div>
        <nav className="avatar-drawer-items">
          {items.map((it) => (
            <button key={it.label} type="button" className="avatar-drawer-item" onClick={() => select(it)}>
              <span className="avatar-drawer-item-icon" aria-hidden="true">{it.icon}</span>
              <span>{it.label}</span>
            </button>
          ))}
        </nav>
        {version && <div className="avatar-drawer-version">Tallio {version}</div>}
      </div>
    </div>
  );
}

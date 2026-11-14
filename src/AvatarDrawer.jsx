// src/AvatarDrawer.jsx
// Right slide-in menu drawer, anchored to the header avatar. Rows are grouped
// into titled sections; an optional file card sits after the first section.
// Closes on scrim click, ×, Escape, or item select. Reduced motion skips the slide.
import React, { useEffect } from 'react';
import UiIcon from './ui/UiIcon.jsx';
import './AvatarDrawer.css';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function Section({ title, children }) {
  return (
    <div className="avatar-drawer-section">
      <div className="avatar-drawer-section-title">{title}</div>
      {children}
    </div>
  );
}

export default function AvatarDrawer({ open, onClose, sections = [], fileCard = null, footerNote = '', avatar = null, reducedMotion }) {
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
            <div className="avatar-drawer-title">Tallio</div>
            <div className="avatar-drawer-sub">Private to this device</div>
          </div>
          <button type="button" className="avatar-drawer-close" aria-label="Close menu" onClick={() => onClose && onClose()}>
            <UiIcon name="close" size={15} />
          </button>
        </div>
        <nav className="avatar-drawer-body">
          {sections.map((sec, i) => (
            <React.Fragment key={sec.title}>
              <Section title={sec.title}>
                {sec.items.map((it) => (
                  <button key={it.label} type="button" className={`avatar-drawer-item${it.danger ? ' danger' : ''}`} onClick={() => select(it)}>
                    <span className="avatar-drawer-item-icon" aria-hidden="true"><UiIcon name={it.icon} size={15} /></span>
                    <span className="avatar-drawer-item-text">
                      <span className="avatar-drawer-item-label">{it.label}</span>
                      {it.hint && <span className="avatar-drawer-item-hint">{it.hint}</span>}
                    </span>
                    {it.chevron && <UiIcon name="chevronRight" size={13} className="avatar-drawer-item-chev" />}
                  </button>
                ))}
              </Section>
              {i === 0 && fileCard && <Section title="Budget file">{fileCard}</Section>}
            </React.Fragment>
          ))}
        </nav>
        <div className="avatar-drawer-foot">
          <span>Tallio</span>
          {footerNote && <span className="avatar-drawer-foot-note">{footerNote}</span>}
        </div>
      </div>
    </div>
  );
}

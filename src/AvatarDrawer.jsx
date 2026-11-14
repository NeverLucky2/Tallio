// src/AvatarDrawer.jsx
// Right slide-in menu drawer, anchored to the header avatar. Rows are grouped
// into titled sections; an optional file card sits after the first section
// (`fileCard` is a node, or `(act) => node` where `act(fn)` wraps a card action
// so it closes the drawer the same guarded way a row does).
// Closes on scrim click, ×, Escape, or item select. Reduced motion skips the slide.
import React, { useEffect, useRef, useState } from 'react';
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

const CLOSE_FALLBACK_MS = 220;

export default function AvatarDrawer({ open, ...rest }) {
  // The panel mounts fresh on every open, so its closing state, focus memory
  // and timers never leak from one opening to the next.
  return open ? <DrawerPanel {...rest} /> : null;
}

function DrawerPanel({ onClose, sections = [], fileCard = null, footerNote = '', avatar = null, reducedMotion }) {
  const rm = reducedMotion ?? prefersReducedMotion();
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);   // a close is already under way
  const doneRef = useRef(false);      // onClose has been called
  const timerRef = useRef(null);
  const panelRef = useRef(null);
  const closeBtnRef = useRef(null);
  const keepFocusRef = useRef(false); // a row opened something; don't pull focus back to the trigger

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(timerRef.current);
    if (onClose) onClose();
  };

  // Reduced motion closes at once. Otherwise slide out first, then tell the
  // parent; the timer covers browsers/tests where animationend never fires.
  const requestClose = () => {
    if (rm) { if (onClose) onClose(); return; }
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timerRef.current = setTimeout(finish, CLOSE_FALLBACK_MS);
  };

  const select = (it) => {
    if (closingRef.current) return;
    keepFocusRef.current = true;
    it.onSelect();
    requestClose();
  };

  // Wraps a file-card action so it shares the rows' guarded close (runs once,
  // ignored while closing, slides out) and returns focus to the trigger.
  const act = (fn) => () => {
    if (closingRef.current) return;
    fn();
    requestClose();
  };
  const card = typeof fileCard === 'function' ? fileCard(act) : fileCard;

  // Focus moves into the drawer on open and back to where it was on close.
  useEffect(() => {
    const previous = document.activeElement;
    if (closeBtnRef.current) closeBtnRef.current.focus();
    return () => {
      clearTimeout(timerRef.current);
      if (keepFocusRef.current) return;
      if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const trapTab = (e) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll('button:not([disabled])')];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const onAnimationEnd = (e) => {
    if (closingRef.current && e.target === e.currentTarget) finish();
  };

  return (
    <div className="avatar-drawer-root">
      <div className={`avatar-drawer-scrim${closing ? ' closing' : ''}`} onClick={requestClose} role="presentation" />
      <div
        ref={panelRef}
        className={`avatar-drawer-panel${rm ? ' no-anim' : ''}${closing ? ' closing' : ''}`}
        role="dialog" aria-modal="true" aria-label="Account menu"
        onKeyDown={trapTab} onAnimationEnd={onAnimationEnd}
      >
        <div className="avatar-drawer-head">
          {avatar || <span className="avatar-drawer-avatar" aria-hidden="true">✦</span>}
          <div className="avatar-drawer-id">
            <div className="avatar-drawer-title">Tallio</div>
            <div className="avatar-drawer-sub">Private to this device</div>
          </div>
          <button ref={closeBtnRef} type="button" className="avatar-drawer-close" aria-label="Close menu" onClick={requestClose}>
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
              {i === 0 && card && <Section title="Budget file">{card}</Section>}
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

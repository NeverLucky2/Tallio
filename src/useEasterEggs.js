// src/useEasterEggs.js
// Detects the Konami code and a rapid logo click-streak, producing a transient
// reveal (rendered by reusing CelebrationLayer). No persistence; purely playful.
import { useState, useRef, useCallback, useEffect } from 'react';
import { KONAMI_SEQUENCE, endsWithSequence } from './konami.js';

const REVEALS = {
  konami: { key: 'egg:konami', title: '🎮 You found the code!', detail: 'Up up down down… nice.' },
  logo:   { key: 'egg:logo', title: '👋 Hey, that tickles!', detail: 'You found a secret.' },
};

export default function useEasterEggs({ clickThreshold = 7, clickWindowMs = 3000 } = {}) {
  const [reveal, setReveal] = useState(null);
  const bufferRef = useRef([]);
  const clicksRef = useRef([]);

  // Konami: window keydown, ignored while typing in fields.
  useEffect(() => {
    const onKeyDown = (e) => {
      const el = e.target;
      const tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el && el.isContentEditable)) return;
      const key = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const buf = [...bufferRef.current, key].slice(-KONAMI_SEQUENCE.length);
      bufferRef.current = buf;
      if (endsWithSequence(buf, KONAMI_SEQUENCE)) {
        bufferRef.current = [];
        setReveal(REVEALS.konami);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const registerLogoClick = useCallback(() => {
    const now = Date.now();
    const recent = [...clicksRef.current, now].filter((t) => now - t <= clickWindowMs);
    clicksRef.current = recent;
    if (recent.length >= clickThreshold) {
      clicksRef.current = [];
      setReveal(REVEALS.logo);
    }
  }, [clickThreshold, clickWindowMs]);

  const dismiss = useCallback(() => setReveal(null), []);

  return { reveal, dismiss, registerLogoClick };
}

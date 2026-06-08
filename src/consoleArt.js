// src/consoleArt.js
// A little wink for anyone who opens DevTools.
export function consoleArt() {
  return {
    text: '%c✦ Tallio — made with love. Curious? Try ↑↑↓↓←→←→ B A ✦',
    style: 'color:#5b8def;font-weight:700;font-size:13px;padding:4px 0;',
  };
}

export function printConsoleArt() {
  const { text, style } = consoleArt();
  console.log(text, style);
}

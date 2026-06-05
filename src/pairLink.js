// src/pairLink.js
// Pure helpers for the phone pairing deep-link. The link lives in the URL hash:
//   scan:    /pair#s=<sessionId>
//   library: /pair#s=<sessionId>&m=lib
export function parsePairHash(hash) {
  const raw = (hash || '').replace(/^#/, '');
  const params = new URLSearchParams(raw);
  return {
    sessionId: params.get('s') || '',
    mode: params.get('m') === 'lib' ? 'library' : 'scan',
  };
}

export function buildPairUrl(origin, sessionId, mode = 'scan') {
  const base = `${origin}/pair#s=${sessionId}`;
  return mode === 'library' ? `${base}&m=lib` : base;
}

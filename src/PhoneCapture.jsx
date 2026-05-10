import React, { useCallback, useEffect, useRef, useState } from 'react';
import usePhonePeer from './usePhonePeer.js';

function getSessionId() {
  return window.location.hash.replace(/^#s=/, '');
}

async function captureToBlob(video) {
  const maxEdge = 1600;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const longest = Math.max(vw, vh);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const cw = Math.round(vw * scale);
  const ch = Math.round(vh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, cw, ch);
  return new Promise((resolve) => {
    canvas.toBlob(b => resolve(b), 'image/jpeg', 0.85);
  });
}

export default function PhoneCapture() {
  const sessionId = getSessionId();
  const peer = usePhonePeer(sessionId);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const acquiringRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [captured, setCaptured] = useState(null); // { blob, previewUrl }
  const [justSent, setJustSent] = useState(false);

  const onSend = async () => {
    if (!captured) return;
    const arrayBuffer = await captured.blob.arrayBuffer();
    await peer.sendImage(new Uint8Array(arrayBuffer));
    setCaptured(null);            // useEffect handles previewUrl revocation
    setJustSent(true);
  };

  useEffect(() => {
    if (!justSent) return;
    const t = setTimeout(() => setJustSent(false), 1500);
    return () => clearTimeout(t);
  }, [justSent]);

  const onShutter = async () => {
    if (!videoRef.current || !cameraReady) return;
    const blob = await captureToBlob(videoRef.current);
    if (!blob) return;
    const previewUrl = URL.createObjectURL(blob);
    setCaptured({ blob, previewUrl });
  };

  const onRetake = () => setCaptured(null);

  const retryCamera = () => {
    // Releasing the stream isn't needed (acquire effect early-returns if streamRef.current exists),
    // but if the previous failure left no stream, the effect needs a dep change to re-fire.
    setCameraError(null);
    setCameraAttempt(n => n + 1);
  };

  // Acquire camera once when the peer becomes camera-eligible.
  // Survives ready ↔ sending transitions so the camera doesn't flicker
  // on every send.
  useEffect(() => {
    const needsCam = peer.status === 'ready' || peer.status === 'sending';
    if (!needsCam) return;
    if (streamRef.current) return;
    if (acquiringRef.current) return;

    setCameraError(null);
    acquiringRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        // If the video element is mounted right now, attach immediately.
        // Otherwise the callback ref (setVideoRef below) attaches when it mounts.
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play()
            .then(() => setCameraReady(true))
            .catch(() => setCameraError('Tap the screen to start the camera.'));
        }
      } catch (err) {
        const name = err && err.name;
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraError('Camera access denied. Enable camera permissions in your browser settings.');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setCameraError('No camera was found on this device.');
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          setCameraError('Camera is in use by another app. Close it and retry.');
        } else if (name === 'OverconstrainedError') {
          setCameraError("This camera doesn't support the requested resolution.");
        } else {
          setCameraError(`Couldn't start camera: ${name || 'unknown error'}.`);
        }
      } finally {
        acquiringRef.current = false;
      }
    })();

    return () => { cancelled = true; };
  }, [peer.status, cameraAttempt]);

  // Release the stream when the peer leaves camera-eligible states.
  useEffect(() => {
    const needsCam = peer.status === 'ready' || peer.status === 'sending';
    if (needsCam) return;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, [peer.status]);

  // Hard cleanup on component unmount.
  useEffect(() => () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Owns previewUrl lifetime: revokes on unmount and whenever the previewUrl
  // changes (covers double-shutter and unmount-mid-preview leaks).
  useEffect(() => {
    const url = captured?.previewUrl;
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [captured?.previewUrl]);

  // Callback ref: attaches whichever <video> element is currently mounted
  // to the existing stream. This is what makes ready → preview → ready
  // round-trips work without re-acquiring the camera.
  const setVideoRef = useCallback((node) => {
    videoRef.current = node;
    if (node && streamRef.current && node.srcObject !== streamRef.current) {
      node.srcObject = streamRef.current;
      node.play()
        .then(() => setCameraReady(true))
        .catch(() => setCameraError('Tap the screen to start the camera.'));
    }
  }, []);

  if (!sessionId) {
    return (
      <div className="phone-root phone-error">
        <h1>Invalid pairing link</h1>
        <p>This link is missing a session ID.</p>
      </div>
    );
  }

  if (peer.status === 'error') {
    return (
      <div className="phone-root phone-error">
        <h1>Couldn't pair</h1>
        <p>{peer.errorMessage}</p>
        <button className="phone-btn phone-btn-primary" onClick={peer.retry}>Retry</button>
      </div>
    );
  }

  if (peer.status === 'disconnected') {
    return (
      <div className="phone-root phone-error">
        <h1>Desktop disconnected</h1>
        <p>The desktop closed the pairing or lost connection.</p>
        <button className="phone-btn phone-btn-primary" onClick={peer.retry}>Reconnect</button>
      </div>
    );
  }

  if (peer.status === 'connecting') {
    return (
      <div className="phone-root">
        <div className="phone-spinner" />
        <h1>Connecting…</h1>
        <p className="phone-sub">Linking to your desktop</p>
      </div>
    );
  }

  if (cameraError) {
    return (
      <div className="phone-root phone-error">
        <h1>Camera blocked</h1>
        <p>{cameraError}</p>
        <button className="phone-btn phone-btn-primary" onClick={retryCamera}>Retry</button>
      </div>
    );
  }

  if (justSent) {
    return (
      <div className="phone-root">
        <div className="phone-check">✓</div>
        <h1>Sent to desktop</h1>
        <p className="phone-sub">Ready for the next bill</p>
      </div>
    );
  }

  if (peer.status === 'sending') {
    return (
      <div className="phone-root">
        <div className="phone-spinner" />
        <h1>Sending…</h1>
        <p className="phone-sub">{Math.round(peer.sendProgress * 100)}% transferred</p>
      </div>
    );
  }

  // TODO: a transient peer disconnect/error during preview currently tears
  // the captured image away because those branches render before this one.
  // For v1 we accept the loss; revisit if it becomes annoying.
  if (captured) {
    return (
      <div className="phone-camera">
        <div className="phone-camera-topbar">
          <span className="phone-camera-title">Looks good?</span>
        </div>

        <div className="phone-camera-viewport">
          <img src={captured.previewUrl} alt="Captured bill" className="phone-preview-img" />
        </div>

        <div className="phone-preview-actions">
          <button className="phone-btn" onClick={onRetake}>Retake</button>
          <button className="phone-btn phone-btn-primary" onClick={onSend}>Send to desktop</button>
        </div>
      </div>
    );
  }

  return (
    <div className="phone-camera">
      <div className="phone-camera-topbar">
        <span className="phone-camera-title">Scan a bill</span>
        <span className="phone-camera-status">● connected</span>
      </div>

      <div className="phone-camera-viewport">
        <video
          ref={setVideoRef}
          className="phone-camera-video"
          autoPlay
          playsInline
          muted
        />
        <div className="phone-camera-frame">
          <div className="phone-camera-frame-label">Position bill within frame</div>
        </div>
      </div>

      <div className="phone-camera-bottom">
        <button
          className="phone-shutter"
          disabled={!cameraReady}
          aria-label="Capture"
          onClick={onShutter}
        >
          <span className="phone-shutter-inner" />
        </button>
      </div>
    </div>
  );
}

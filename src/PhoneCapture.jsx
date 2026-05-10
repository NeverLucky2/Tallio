import React, { useCallback, useEffect, useRef, useState } from 'react';
import usePhonePeer from './usePhonePeer.js';

function getSessionId() {
  return window.location.hash.replace(/^#s=/, '');
}

export default function PhoneCapture() {
  const sessionId = getSessionId();
  const peer = usePhonePeer(sessionId);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  // Acquire camera once when the peer becomes camera-eligible.
  // Survives ready ↔ sending transitions so the camera doesn't flicker
  // on every send.
  useEffect(() => {
    const needsCam = peer.status === 'ready' || peer.status === 'sending';
    if (!needsCam) return;
    if (streamRef.current) return;

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
          videoRef.current.play().catch(() => { /* autoplay policy; muted=true should let it play */ });
          setCameraReady(true);
        }
      } catch (err) {
        setCameraError('Camera access denied. Enable camera permissions and reload.');
      }
    })();

    return () => { cancelled = true; };
  }, [peer.status]);

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

  // Callback ref: attaches whichever <video> element is currently mounted
  // to the existing stream. This is what makes ready → preview → ready
  // round-trips work without re-acquiring the camera.
  const setVideoRef = useCallback((node) => {
    videoRef.current = node;
    if (node && streamRef.current && node.srcObject !== streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => { /* autoplay policy */ });
      setCameraReady(true);
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
        >
          <span className="phone-shutter-inner" />
        </button>
      </div>
    </div>
  );
}

import React, { useState, useRef, useCallback, useEffect } from 'react';
import PhoneCapture from './PhoneCapture.jsx';
import useDesktopPeer from './useDesktopPeer.js';
import PairingPanel from './PairingPanel.jsx';
import useSettings from './useSettings.js';
import SettingsPanel from './SettingsPanel.jsx';
import SpendingChart from './SpendingChart.jsx';
import { extractBillFromImage } from './billExtractor.js';
import { migrateBills, getItemDate, findRecurringCharges, aggregateByKeyword } from './spendingMath.js';
import './App.css';

const categories = [
  { name: "Utilities",      icon: "⚡", color: "#F59E0B" },
  { name: "Groceries",      icon: "🛒", color: "#10B981" },
  { name: "Healthcare",     icon: "💊", color: "#EF4444" },
  { name: "Fitness",        icon: "🧗", color: "#84CC16" },
  { name: "Insurance",      icon: "🛡️", color: "#6366F1" },
  { name: "Entertainment",  icon: "🎬", color: "#EC4899" },
  { name: "Transportation", icon: "🚗", color: "#8B5CF6" },
  { name: "Dining",         icon: "🍽️", color: "#F97316" },
  { name: "Shopping",       icon: "🛍️", color: "#14B8A6" },
  { name: "Subscriptions",  icon: "📱", color: "#3B82F6" },
  { name: "Parking",        icon: "🅿️", color: "#64748B" },
  { name: "Donations",      icon: "🙏", color: "#e879a0" },
  { name: "Other",          icon: "📋", color: "#6B7280" }
];

const FALLBACK_CATEGORY = categories.find(c => c.name === 'Other');

const autoCategorizeTx = (description) => {
  const desc = description.toUpperCase();
  if (desc.includes('MCDONALD') || desc.includes('KFC') || desc.includes('POPEYES') ||
      desc.includes('KRISPY') || desc.includes('RESTAURANT') || desc.includes('CHINESE') ||
      desc.includes('SHARK\'S FISH') || desc.includes('HOY\'S')) return "Dining";
  if (desc.includes('WAL-MART') || desc.includes('WALMART') || desc.includes('TARGET')) return "Shopping";
  if (desc.includes('EBAY') || desc.includes('TEMU') || desc.includes('AMAZON')) return "Shopping";
  if (desc.includes('LOT A') || desc.includes('PARKING') || desc.includes('PAY ON FOOT')) return "Parking";
  if (desc.includes('HOME DEPOT') || desc.includes('LOWES')) return "Shopping";
  if (desc.includes('BOWLERO') || desc.includes('WHITE CASTLE') || desc.includes('ENTERTAINMENT')) return "Entertainment";
  if (desc.includes('CLAUDE.AI') || desc.includes('SUBSCRIPTION') || desc.includes('NETFLIX')) return "Subscriptions";
  if (desc.includes('GAS') || desc.includes('SHELL') || desc.includes('BP') || desc.includes('EXXON')) return "Transportation";
  if (desc.includes('CHURCH') || desc.includes('CHRISTIAN') || desc.includes('CHAPEL') ||
      desc.includes('MINISTRY') || desc.includes('MINISTRIES') || desc.includes('MISSION') ||
      desc.includes('SALVATION ARMY') || desc.includes('GOODWILL') || desc.includes('HABITAT') ||
      desc.includes('RED CROSS') || desc.includes('DONATION') || desc.includes('TITHE') ||
      desc.includes('PARISH') || desc.includes('DIOCESE') || desc.includes('SYNAGOGUE') ||
      desc.includes('MOSQUE') || desc.includes('TEMPLE') || desc.includes('CHARITY') ||
      desc.includes('FOUNDATION') || desc.includes('NONPROFIT') || desc.includes('NON-PROFIT')) return "Donations";
  if (desc.includes('FIRST ASCENT') || desc.includes('GYM') || desc.includes('FITNESS') ||
      desc.includes('CLIMBING') || desc.includes('CROSSFIT') || desc.includes('YOGA') ||
      desc.includes('PILATES')) return "Fitness";
  return "Other";
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

const formatMonth = (monthString) => {
  if (!monthString || !/^\d{4}-\d{2}$/.test(monthString)) return '';
  const [y, m] = monthString.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });
};

const formatMonthCompact = (monthString) => {
  if (!monthString || !/^\d{4}-\d{2}$/.test(monthString)) return '';
  const [y, m] = monthString.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric'
  });
};

const currentMonthKey = () => new Date().toISOString().slice(0, 7);

const shiftMonth = (monthString, delta) => {
  const [y, m] = monthString.split('-').map(n => parseInt(n, 10));
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const MonthToggle = ({ selectedMonth, onChange }) => {
  const today = currentMonthKey();
  const canNext = selectedMonth < today;
  return (
    <div className="month-toggle" role="group" aria-label="Month filter">
      <button
        type="button"
        className="month-toggle-btn"
        onClick={() => onChange(shiftMonth(selectedMonth, -1))}
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className="month-toggle-label">{formatMonthCompact(selectedMonth)}</span>
      <button
        type="button"
        className="month-toggle-btn"
        onClick={() => canNext && onChange(shiftMonth(selectedMonth, 1))}
        disabled={!canNext}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
};


// ---- Camera Component ----

const CameraCapture = ({ onCapture, onClose }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.onloadedmetadata = () => setIsReady(true);
        }
      } catch (err) {
        setError("Camera access denied. Please enable camera permissions.");
      }
    };
    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    onCapture(imageData, 'camera');
  };

  return (
    <div className="camera-overlay">
      <div className="camera-topbar">
        <h2 className="camera-title">Scan Bill</h2>
        <button className="camera-close" onClick={onClose}>×</button>
      </div>

      <div className="camera-viewport">
        {error ? (
          <div className="camera-error">{error}</div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline className="camera-video" />
            <div className="camera-frame">
              <div className="camera-frame-label">Position bill within frame</div>
            </div>
          </>
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      <div className="camera-bottom">
        <button onClick={capturePhoto} disabled={!isReady} className="camera-shutter">
          <div
            className="camera-shutter-inner"
            style={{ background: isReady ? 'var(--green)' : 'rgba(255,255,255,0.18)' }}
          />
        </button>
      </div>
    </div>
  );
};


// ---- Bill Item Row ----

const BillItem = ({ item, bill, onUpdate, onDelete, isMobile }) => {
  const category = categories.find(c => c.name === item.category) || FALLBACK_CATEGORY;
  const itemDate = item.date || getItemDate(bill, item);

  if (isMobile) {
    return (
      <div className="item-row-mobile">
        <div className="item-row-mobile-top">
          <div className="item-row-mobile-top-left">
            <div
              className="item-icon"
              style={{ background: `${category.color}18`, border: `1px solid ${category.color}28` }}
            >
              {category.icon}
            </div>
            <input
              type="text"
              value={item.description}
              onChange={(e) => onUpdate({ ...item, description: e.target.value })}
              className="input-transparent"
              placeholder="Description"
            />
          </div>
          <button className="btn-delete" onClick={onDelete}>×</button>
        </div>
        <div className="item-row-mobile-bottom">
          <input
            type="date"
            value={itemDate}
            onChange={(e) => onUpdate({ ...item, date: e.target.value })}
            className="input item-date"
            style={{ width: '140px', flexShrink: 0 }}
          />
          <select
            value={item.category}
            onChange={(e) => onUpdate({ ...item, category: e.target.value })}
            className="select"
          >
            {categories.map(cat => (
              <option key={cat.name} value={cat.name}>{cat.icon} {cat.name}</option>
            ))}
          </select>
          <div className="input-amount-wrap" style={{ width: '110px', flexShrink: 0 }}>
            <span className="input-amount-prefix">$</span>
            <input
              type="number"
              value={item.amount}
              onChange={(e) => onUpdate({ ...item, amount: parseFloat(e.target.value) || 0 })}
              className="input-amount"
              step="0.01"
              min="0"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="item-row">
      <div
        className="item-icon"
        style={{ background: `${category.color}18`, border: `1px solid ${category.color}28` }}
      >
        {category.icon}
      </div>
      <input
        type="date"
        value={itemDate}
        onChange={(e) => onUpdate({ ...item, date: e.target.value })}
        className="input item-date"
      />
      <select
        value={item.category}
        onChange={(e) => onUpdate({ ...item, category: e.target.value })}
        className="select"
      >
        {categories.map(cat => (
          <option key={cat.name} value={cat.name}>{cat.icon} {cat.name}</option>
        ))}
      </select>
      <input
        type="text"
        value={item.description}
        onChange={(e) => onUpdate({ ...item, description: e.target.value })}
        className="input-transparent"
        placeholder="Description"
      />
      <div className="input-amount-wrap">
        <span className="input-amount-prefix">$</span>
        <input
          type="number"
          value={item.amount}
          onChange={(e) => onUpdate({ ...item, amount: parseFloat(e.target.value) || 0 })}
          className="input-amount"
          step="0.01"
          min="0"
        />
      </div>
      <button className="btn-delete" onClick={onDelete}>×</button>
    </div>
  );
};


// ---- Confirm Dialog ----

const ConfirmDialog = ({ title, message, confirmLabel = "OK", variant = "default", onConfirm, onCancel }) => (
  <div className="dialog-overlay" onClick={onCancel ?? onConfirm}>
    <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
      <h2 className="dialog-title">{title}</h2>
      <p className="dialog-body">{message}</p>
      <div className="dialog-actions">
        {onCancel && (
          <button className="btn dialog-btn-cancel" onClick={onCancel}>Cancel</button>
        )}
        <button
          className={`btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'} dialog-btn-confirm`}
          onClick={onConfirm}
          autoFocus
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);


// ---- Bill Card ----

const BillCard = ({ bill, onUpdate, onDelete, onDeleteItem, isMobile, highlighted = false, cardRef = null }) => {
  const [isExpanded, setIsExpanded] = useState(highlighted);
  const total = bill.items.reduce((sum, item) => sum + item.amount, 0);

  const addItem = () => {
    const newItem = { id: Date.now(), description: "", amount: 0, category: "Other", date: null };
    onUpdate({ ...bill, items: [...bill.items, newItem] });
  };

  const updateItem = (updatedItem) => {
    onUpdate({
      ...bill,
      items: bill.items.map(item => item.id === updatedItem.id ? updatedItem : item)
    });
  };

  const deleteItem = (itemId) => onDeleteItem(bill.id, itemId);

  const initial = (bill.vendor || "?").charAt(0).toUpperCase();

  return (
    <div
      ref={cardRef}
      className={`bill-card${highlighted ? ' bill-card-highlighted' : ''}`}
    >
      <div className="bill-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="bill-icon">
          <span className="bill-icon-char">{initial}</span>
        </div>
        <div className="bill-info">
          <h3 className="bill-vendor">{bill.vendor || "Untitled Bill"}</h3>
          <div className="bill-meta">
            {formatMonth(bill.month)}
            <div className="bill-meta-dot" />
            {bill.items.length} item{bill.items.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="bill-right">
          <span className="bill-total">{formatCurrency(total)}</span>
          <span className={`bill-chevron${isExpanded ? ' bill-chevron-open' : ''}`}>▾</span>
        </div>
      </div>

      {isExpanded && (
        <div className="bill-body">
          <div className="bill-fields">
            <input
              type="text"
              value={bill.vendor}
              onChange={(e) => onUpdate({ ...bill, vendor: e.target.value })}
              placeholder="Vendor name"
              className="input"
              style={{ flex: 1 }}
            />
            <input
              type="month"
              value={bill.month}
              onChange={(e) => onUpdate({ ...bill, month: e.target.value })}
              className="input"
              style={{ width: isMobile ? '100%' : '160px', flex: isMobile ? '1 1 auto' : '0 0 auto' }}
            />
          </div>

          <div className="bill-items-list">
            {bill.items.map(item => (
              <BillItem
                key={item.id}
                item={item}
                bill={bill}
                onUpdate={updateItem}
                onDelete={() => deleteItem(item.id)}
                isMobile={isMobile}
              />
            ))}
          </div>

          <div className="bill-footer">
            <button className="btn btn-add" onClick={addItem}>+ Add Item</button>
            <button className="btn btn-danger" onClick={() => onDelete(bill.id)}>Delete Bill</button>
          </div>
        </div>
      )}
    </div>
  );
};


// ---- Summary Card ----

const SummaryCard = ({ title, amount, isCount, colorKey, delta }) => (
  <div className={`stat-card stat-card-${colorKey}`}>
    <div className="stat-label">
      <div className={`stat-dot stat-dot-${colorKey}`} />
      {title}
    </div>
    <div className="stat-value">
      {isCount ? amount : formatCurrency(amount)}
    </div>
    {delta && (
      <div className={`stat-delta stat-delta-${delta.direction}`}>
        {delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '·'} {delta.pct}%
        <span className="stat-delta-ref"> vs {delta.prevLabel}</span>
      </div>
    )}
  </div>
);


// ---- Category Breakdown ----

const CategoryBreakdown = ({ bills, selectedMonth }) => {
  const categoryTotals = {};
  bills.forEach(bill => {
    bill.items.forEach(item => {
      if (!categoryTotals[item.category]) categoryTotals[item.category] = 0;
      categoryTotals[item.category] += item.amount;
    });
  });

  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  const maxAmount = Math.max(...sortedCategories.map(([, amount]) => amount), 1);

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="panel-title">Categories</h3>
        {selectedMonth && (
          <span className="panel-sub">{formatMonthCompact(selectedMonth)}</span>
        )}
      </div>

      {sortedCategories.length === 0 ? (
        <p className="panel-empty">No expenses for {selectedMonth ? formatMonth(selectedMonth) : 'this period'}</p>
      ) : (
        <div className="cat-list">
          {sortedCategories.map(([categoryName, amount]) => {
            const category = categories.find(c => c.name === categoryName) || FALLBACK_CATEGORY;
            const percentage = (amount / maxAmount) * 100;
            return (
              <div key={categoryName}>
                <div className="cat-meta">
                  <div className="cat-name">
                    <span className="cat-icon">{category.icon}</span>
                    {categoryName}
                  </div>
                  <span className="cat-amount" style={{ color: category.color }}>
                    {formatCurrency(amount)}
                  </span>
                </div>
                <div className="cat-track">
                  <div
                    className="cat-fill"
                    style={{ width: `${percentage}%`, background: category.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


// ---- Tracked Keywords Panel ----

const TrackedPanel = ({ bills, keywords, onAdd, onRemove, selectedMonth }) => {
  const [draft, setDraft] = useState('');

  const submit = () => {
    const k = draft.trim();
    if (!k) return;
    onAdd(k);
    setDraft('');
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="panel-title">Tracked</h3>
        {keywords.length > 0 && <span className="panel-sub">{keywords.length} keyword{keywords.length === 1 ? '' : 's'}</span>}
      </div>

      <div className="track-input-row">
        <input
          type="text"
          className="track-input"
          placeholder="Track a keyword (e.g. CHURCH, MCDONALD)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button type="button" className="track-add" onClick={submit} aria-label="Add keyword">+</button>
      </div>

      {keywords.length === 0 ? (
        <p className="panel-empty">Pin keywords to monitor spending at specific places.</p>
      ) : (
        <div className="track-list">
          {keywords.map(kw => {
            const summary = aggregateByKeyword(bills, kw);
            const thisMonth = summary.byMonth[selectedMonth] || 0;
            const prevMonthKey = shiftMonth(selectedMonth, -1);
            const prevMonth = summary.byMonth[prevMonthKey] || 0;
            let delta = null;
            if (prevMonth > 0) {
              const change = (thisMonth - prevMonth) / prevMonth;
              delta = {
                pct: Math.round(Math.abs(change) * 100),
                direction: change > 0.005 ? 'up' : change < -0.005 ? 'down' : 'flat',
              };
            }
            const cat = categories.find(c => c.name === summary.category) || FALLBACK_CATEGORY;
            return (
              <div key={kw} className="track-row">
                <div className="track-row-main">
                  <span className="track-icon" style={{ background: `${cat.color}18`, border: `1px solid ${cat.color}28` }}>
                    {cat.icon}
                  </span>
                  <div className="track-row-text">
                    <div className="track-row-keyword">{kw}</div>
                    <div className="track-row-meta">
                      {summary.occurrences > 0
                        ? `last ${summary.lastDate} · ${summary.occurrences} hit${summary.occurrences === 1 ? '' : 's'}`
                        : 'No matches yet'}
                    </div>
                  </div>
                </div>
                <div className="track-row-right">
                  <div className="track-amount">{formatCurrency(thisMonth)}</div>
                  {delta && (
                    <span className={`track-delta track-delta-${delta.direction}`}>
                      {delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '·'} {delta.pct}%
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="track-remove"
                  onClick={() => onRemove(kw)}
                  aria-label={`Stop tracking ${kw}`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


// ---- Subscriptions Panel ----

const Subscriptions = ({ bills, today, trackedKeywords = [] }) => {
  const all = findRecurringCharges(bills, today);
  const charges = all.filter(c => !trackedKeywords.some(kw =>
    c.description.toUpperCase().includes(kw.toUpperCase())
  ));
  if (charges.length === 0) return null;

  const monthlyTotal = charges
    .filter(c => c.active)
    .reduce((s, c) => s + c.lastAmount, 0);

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="panel-title">Subscriptions</h3>
        <span className="panel-sub">~{formatCurrency(monthlyTotal)}/mo</span>
      </div>
      <div className="sub-list">
        {charges.map(c => {
          const cat = categories.find(k => k.name === c.category) || FALLBACK_CATEGORY;
          return (
            <div key={`${c.vendor}-${c.description}`} className={`sub-row${c.active ? '' : ' sub-row-inactive'}`}>
              <div className="sub-row-main">
                <span className="sub-icon" style={{ background: `${cat.color}18`, border: `1px solid ${cat.color}28` }}>
                  {cat.icon}
                </span>
                <div className="sub-row-text">
                  <div className="sub-row-desc">{c.description}</div>
                  <div className="sub-row-meta">
                    {c.vendor} · {c.monthCount} mo · last {c.lastDate}
                  </div>
                </div>
              </div>
              <div className="sub-row-right">
                <div className="sub-amount">
                  {formatCurrency(c.lastAmount)}
                  {c.varies && <span className="sub-varies" title={`Avg ${formatCurrency(c.avgAmount)}`}>varies</span>}
                </div>
                <span className={`sub-badge${c.active ? ' sub-badge-active' : ' sub-badge-inactive'}`}>
                  {c.active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


// ---- Main App ----

function BillTracker() {
  const [bills, setBills] = useState(() => {
    try {
      const saved = localStorage.getItem('billtracker-bills');
      return saved ? migrateBills(JSON.parse(saved)) : [];
    } catch {
      return [];
    }
  });
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonthKey());
  const [searchTerm, setSearchTerm] = useState('');
  const [trackedKeywords, setTrackedKeywords] = useState(() => {
    try {
      const saved = localStorage.getItem('billtracker-tracked-keywords');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [history, setHistory] = useState([]);
  const [undoToast, setUndoToast] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [newlyAddedBillId, setNewlyAddedBillId] = useState(null);
  const [pendingDeleteBillId, setPendingDeleteBillId] = useState(null);
  const [showUndoTip, setShowUndoTip] = useState(false);
  const [undoTipSeen, setUndoTipSeen] = useState(() => {
    try { return localStorage.getItem('billtracker-undo-tip-seen') === 'true'; } catch { return false; }
  });
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const desktopPeer = useDesktopPeer();
  const [showPairing, setShowPairing] = useState(false);
  const settings = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [settingsBanner, setSettingsBanner] = useState(null);

  const openSettings = (banner = null) => {
    setSettingsBanner(banner);
    setShowSettings(true);
  };

  const closeSettings = () => {
    setShowSettings(false);
    setSettingsBanner(null);
  };

  const openPairing = () => {
    if (!desktopPeer.active) desktopPeer.start();
    setShowPairing(true);
  };

  useEffect(() => {
    if (!desktopPeer.lastImage) return;
    let cancelled = false;
    (async () => {
      const processed = await handleCapture(desktopPeer.lastImage.dataUrl, 'phone');
      if (cancelled) return;
      // Only drain the queued image when handleCapture actually attempted processing.
      // If it intercepted (no API key), leave the image queued so a save re-triggers
      // this effect via the settings.hasKey dep.
      if (processed) desktopPeer.consumeImage();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopPeer.lastImage, settings.hasKey]);

  const fileInputRef = useRef(null);
  const toastTimerRef = useRef(null);
  const newBillRef = useRef(null);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;

  useEffect(() => {
    try {
      localStorage.setItem('billtracker-bills', JSON.stringify(bills));
    } catch (e) {
      console.error('Failed to save bills:', e);
    }
  }, [bills]);

  useEffect(() => {
    try {
      localStorage.setItem('billtracker-tracked-keywords', JSON.stringify(trackedKeywords));
    } catch (e) {
      console.error('Failed to save tracked keywords:', e);
    }
  }, [trackedKeywords]);

  useEffect(() => {
    try {
      localStorage.setItem('billtracker-undo-tip-seen', undoTipSeen ? 'true' : 'false');
    } catch (e) {
      console.error('Failed to save undo tip flag:', e);
    }
  }, [undoTipSeen]);

  const addKeyword = (raw) => {
    const k = raw.trim().toUpperCase();
    if (!k) return;
    setTrackedKeywords(prev => prev.includes(k) ? prev : [...prev, k]);
  };

  const removeKeyword = (kw) => {
    setTrackedKeywords(prev => prev.filter(k => k !== kw));
  };

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!newlyAddedBillId) return;
    newBillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const timer = setTimeout(() => setNewlyAddedBillId(null), 1500);
    return () => clearTimeout(timer);
  }, [newlyAddedBillId]);

  const pushHistory = (currentBills) => {
    setHistory(prev => [...prev.slice(-19), currentBills]);
  };

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setBills(prev);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setUndoToast(true);
    toastTimerRef.current = setTimeout(() => setUndoToast(false), 2000);
  };

  const totalExpenses = bills.reduce((sum, bill) =>
    sum + bill.items.reduce((itemSum, item) => itemSum + item.amount, 0), 0
  );

  const todayMonth = currentMonthKey();
  const monthBills = bills.filter(bill => bill.month === selectedMonth);
  const selectedMonthTotal = monthBills.reduce((sum, bill) =>
    sum + bill.items.reduce((itemSum, item) => itemSum + item.amount, 0), 0
  );
  const monthCardTitle = selectedMonth === todayMonth
    ? 'This Month'
    : formatMonthCompact(selectedMonth);

  const previousMonth = shiftMonth(selectedMonth, -1);
  const previousMonthTotal = bills
    .filter(bill => bill.month === previousMonth)
    .reduce((sum, bill) =>
      sum + bill.items.reduce((itemSum, item) => itemSum + item.amount, 0), 0
    );

  let monthDelta = null;
  if (previousMonthTotal > 0) {
    const change = (selectedMonthTotal - previousMonthTotal) / previousMonthTotal;
    monthDelta = {
      pct: Math.round(Math.abs(change) * 100),
      direction: change > 0.005 ? 'up' : change < -0.005 ? 'down' : 'flat',
      prevLabel: formatMonthCompact(previousMonth),
    };
  }

  const searchActive = searchTerm.trim().length > 0;
  const matchesSearch = (bill, term) => {
    if (!term) return true;
    const t = term.toLowerCase();
    if ((bill.vendor || '').toLowerCase().includes(t)) return true;
    const num = parseFloat(t);
    for (const item of bill.items || []) {
      if ((item.description || '').toLowerCase().includes(t)) return true;
      if ((item.category || '').toLowerCase().includes(t)) return true;
      if (Number.isFinite(num) && Math.abs(item.amount - num) < 0.01) return true;
    }
    return false;
  };

  const visibleBills = searchActive
    ? bills.filter(b => matchesSearch(b, searchTerm))
    : monthBills;

  const handleCapture = async (imageData, source) => {
    setShowCamera(false);

    if (!settings.hasKey) {
      const banner = source === 'phone'
        ? 'Phone captured a bill — add an Anthropic API key to process it.'
        : 'Add an Anthropic API key to scan bills.';
      openSettings(banner);
      return false;
    }

    setIsProcessing(true);
    setProcessingStatus('Reading bill…');

    try {
      const { vendor, month, items } = await extractBillFromImage(imageData, {
        apiKey: settings.apiKey,
        model: settings.model,
      });

      const mappedItems = items.map(it => ({
        id: crypto.randomUUID(),
        description: it.description,
        amount: it.amount,
        date: it.date || null,
        category: autoCategorizeTx(it.description),
      }));

      const newBill = {
        id: crypto.randomUUID(),
        vendor: vendor || 'Scanned Bill',
        month: month || new Date().toISOString().slice(0, 7),
        items: mappedItems.length > 0 ? mappedItems : [{
          id: crypto.randomUUID(),
          description: 'No items detected — add manually',
          amount: 0,
          category: 'Other',
          date: null,
        }],
      };

      setBills(prev => { pushHistory(prev); return [newBill, ...prev]; });
      setSelectedMonth(newBill.month);
      setSearchTerm('');
      setNewlyAddedBillId(newBill.id);
    } catch (err) {
      const newBill = {
        id: crypto.randomUUID(),
        vendor: 'Scanned Bill',
        month: new Date().toISOString().slice(0, 7),
        items: [{
          id: crypto.randomUUID(),
          description: `${(err.message || 'Extraction failed').replace(/\.$/, '')} — add items manually`,
          amount: 0,
          category: 'Other',
          date: null,
        }],
      };
      setBills(prev => { pushHistory(prev); return [newBill, ...prev]; });
      setSelectedMonth(newBill.month);
      setSearchTerm('');
      setNewlyAddedBillId(newBill.id);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }

    return true;
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      await handleCapture(event.target.result, 'upload');
    };
    reader.readAsDataURL(file);

    e.target.value = '';
  };

  const addManualBill = () => {
    pushHistory(bills);
    const newBill = {
      id: Date.now(),
      vendor: "",
      month: selectedMonth,
      items: [{ id: Date.now(), description: "", amount: 0, category: "Other", date: null }]
    };
    setBills(prev => [newBill, ...prev]);
    setSearchTerm('');
    setNewlyAddedBillId(newBill.id);
  };

  const updateBill = (updatedBill) => {
    pushHistory(bills);
    const previous = bills.find(b => b.id === updatedBill.id);
    setBills(prev => prev.map(bill => bill.id === updatedBill.id ? updatedBill : bill));
    if (previous && previous.month !== updatedBill.month) {
      setSelectedMonth(updatedBill.month);
    }
  };

  const maybeShowUndoTip = () => {
    if (!undoTipSeen) setShowUndoTip(true);
  };

  const dismissUndoTip = () => {
    setShowUndoTip(false);
    setUndoTipSeen(true);
  };

  const deleteBill = (billId) => {
    setPendingDeleteBillId(billId);
  };

  const confirmDeleteBill = () => {
    if (!pendingDeleteBillId) return;
    pushHistory(bills);
    setBills(prev => prev.filter(bill => bill.id !== pendingDeleteBillId));
    setPendingDeleteBillId(null);
    maybeShowUndoTip();
  };

  const cancelDeleteBill = () => setPendingDeleteBillId(null);

  const handleDeleteItem = (billId, itemId) => {
    pushHistory(bills);
    setBills(prev =>
      prev.map(b => b.id === billId ? { ...b, items: b.items.filter(i => i.id !== itemId) } : b)
    );
    maybeShowUndoTip();
  };

  const exportData = () => {
    const dataStr = JSON.stringify(bills, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billtracker-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-root">
      <div className="app-bg-gradient" />

      {/* Camera Modal */}
      {showCamera && (
        <CameraCapture
          onCapture={handleCapture}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="processing-overlay">
          <div className="processing-spinner" />
          <p className="processing-label">{processingStatus || 'Processing...'}</p>
        </div>
      )}

      {showPairing && (
        <PairingPanel
          peer={desktopPeer}
          onClose={() => setShowPairing(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onClose={closeSettings}
          banner={settingsBanner}
        />
      )}

      {pendingDeleteBillId && (
        <ConfirmDialog
          title="Delete this bill?"
          message="All items in this bill will be removed. You can undo this from the top toolbar."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={confirmDeleteBill}
          onCancel={cancelDeleteBill}
        />
      )}

      {showUndoTip && (
        <ConfirmDialog
          title="Tip: you can undo deletes"
          message="If you accidentally delete a bill or an item, click the ↩ Undo button in the top toolbar to restore it."
          confirmLabel="OK, got it"
          onConfirm={dismissUndoTip}
        />
      )}

      {/* Undo Toast */}
      {undoToast && (
        <div className="toast">
          ↩ Change undone
        </div>
      )}

      <div className="container">

        {/* Header */}
        <header className="header">
          <div className="brand">
            <div className="brand-row">
              <h1 className="brand-title">
                Bill<span className="brand-title-accent">Tracker</span>
              </h1>
              <MonthToggle selectedMonth={selectedMonth} onChange={setSelectedMonth} />
            </div>
            <p className="brand-sub">Scan · Track · Manage</p>
          </div>
          <div className="header-actions">
            <button onClick={() => openSettings()} className="btn-icon" aria-label="Settings">
              ⚙
            </button>
            <button
              onClick={undo}
              disabled={history.length === 0}
              className={`btn btn-undo${history.length > 0 ? ' active' : ''}`}
            >
              ↩ Undo{history.length > 0 ? ` (${history.length})` : ''}
            </button>
            <button onClick={exportData} className="btn">
              ↗ Export
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="stats-grid">
          <SummaryCard title="Total Expenses" amount={totalExpenses} colorKey="blue" />
          <SummaryCard title={monthCardTitle}  amount={selectedMonthTotal} colorKey="green" delta={monthDelta} />
          <SummaryCard title="Total Bills"    amount={bills.length} isCount={true} colorKey="purple" />
        </div>

        {/* Spending Hero */}
        <SpendingChart
          bills={bills}
          selectedMonth={selectedMonth}
          onSelectMonth={setSelectedMonth}
        />

        {/* Main Grid */}
        <div className="main-grid">

          {/* Bills Column */}
          <div>
            {/* Actions */}
            <div className="actions-grid">
              <button
                onClick={() => setShowCamera(true)}
                className={`btn btn-primary${isMobile ? ' btn-scan' : ''}`}
              >
                ◉ Scan
              </button>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
              />

              <button onClick={() => fileInputRef.current?.click()} className="btn btn-action">
                ↑ Upload
              </button>

              <button onClick={addManualBill} className="btn btn-action">
                + Manual
              </button>

              <button onClick={openPairing} className={`btn btn-action${desktopPeer.status === 'paired' ? ' btn-paired' : ''}`}>
                {desktopPeer.status === 'paired' ? '✓ Phone Linked' : '⌘ Pair Phone'}
              </button>

            </div>

            {/* Bills List */}
            <div className="section-header">
              <h2 className="section-title">Bills</h2>
              <span className="section-count">{visibleBills.length}</span>
            </div>

            {bills.length > 0 && (
              <div className={`search-row${searchActive ? ' search-row-active' : ''}`}>
                <span className="search-icon">⌕</span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search by vendor, description, category, or amount…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchActive && (
                  <>
                    <span className="search-scope">All months</span>
                    <button
                      type="button"
                      className="search-clear"
                      onClick={() => setSearchTerm('')}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            )}

            {bills.length === 0 ? (
              <div className="empty-state">
                <div className="empty-glyph">◈</div>
                <h3 className="empty-title">No bills yet</h3>
                <p className="empty-desc">
                  Scan a receipt, upload a PDF,<br />or add an entry manually.
                </p>
                <button onClick={() => setShowCamera(true)} className="btn btn-primary">
                  ◉ Scan Your First Bill
                </button>
              </div>
            ) : visibleBills.length === 0 ? (
              <div className="empty-state">
                <div className="empty-glyph">◌</div>
                <h3 className="empty-title">
                  {searchActive ? `No matches for "${searchTerm}"` : `No bills for ${formatMonth(selectedMonth)}`}
                </h3>
                <p className="empty-desc">
                  {searchActive ? 'Try a different keyword or amount.' : 'Use the month toggle above to view another month.'}
                </p>
              </div>
            ) : (
              visibleBills.map(bill => (
                <BillCard
                  key={bill.id}
                  bill={bill}
                  onUpdate={updateBill}
                  onDelete={deleteBill}
                  onDeleteItem={handleDeleteItem}
                  isMobile={isMobile}
                  highlighted={bill.id === newlyAddedBillId}
                  cardRef={bill.id === newlyAddedBillId ? newBillRef : null}
                />
              ))
            )}
          </div>

          {/* Sidebar */}
          <div className="sidebar">
            <CategoryBreakdown bills={searchActive ? visibleBills : monthBills} selectedMonth={searchActive ? null : selectedMonth} />
            <TrackedPanel
              bills={bills}
              keywords={trackedKeywords}
              onAdd={addKeyword}
              onRemove={removeKeyword}
              selectedMonth={selectedMonth}
            />
            <Subscriptions bills={bills} today={todayMonth} trackedKeywords={trackedKeywords} />

            <div className="formats-panel">
              <p className="formats-label">Supported Formats</p>
              <div className="format-tags">
                {['PDF', 'JPG', 'PNG', 'Camera'].map(format => (
                  <span key={format} className="format-tag">{format}</span>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function App() {
  if (typeof window !== 'undefined' && window.location.pathname === '/pair') {
    return <PhoneCapture />;
  }
  return <BillTracker />;
}

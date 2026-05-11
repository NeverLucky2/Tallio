import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import PhoneCapture from './PhoneCapture.jsx';
import useDesktopPeer from './useDesktopPeer.js';
import PairingPanel from './PairingPanel.jsx';
import useSettings from './useSettings.js';
import SettingsPanel from './SettingsPanel.jsx';
import SpendingChart from './SpendingChart.jsx';
import { extractBillFromImage } from './billExtractor.js';
import { migrateBills, getItemDate, findRecurringCharges, aggregateByKeyword, getMonthItems, getBillNet } from './spendingMath.js';
import useCategories from './useCategories.js';
import BillItem from './BillItem.jsx';
import CategoryBreakdown from './CategoryBreakdown.jsx';
import ManageCategoriesScreen from './ManageCategoriesScreen.jsx';
import { initializeFromStorage } from './initializeFromStorage.js';
import RecurringTipDialog from './RecurringTipDialog.jsx';
import { nanoid } from 'nanoid';
import './App.css';

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

const BillCard = ({ bill, defaultCategoryId, categories, categoriesById, otherCategoryId, onUpdate, onDelete, onDeleteItem, onMakeRecurring, isMobile, highlighted = false, cardRef = null }) => {
  const [isExpanded, setIsExpanded] = useState(highlighted);
  const billNet = getBillNet(bill, categoriesById);
  const direction = billNet.net > 0 ? 'in' : billNet.net < 0 ? 'out' : 'flat';
  const displayAmount = Math.abs(billNet.net);

  const addItem = () => {
    const newItem = { id: Date.now(), description: "", amount: 0, categoryId: defaultCategoryId, date: null };
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
          {bill.recurring && (
            <span className="bill-badge-recurring" aria-label="Recurring bill">
              <span className="bill-badge-glyph">↻</span> RECURRING
            </span>
          )}
          <span className={`bill-total bill-total-${direction}`}>
            {direction === 'in' ? '↑' : direction === 'out' ? '↓' : ''}
            {formatCurrency(displayAmount)}
          </span>
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
                categories={categories}
                otherCategoryId={otherCategoryId}
                onUpdate={updateItem}
                onDelete={() => deleteItem(item.id)}
                isMobile={isMobile}
              />
            ))}
          </div>

          <div className="bill-footer">
            <button className="btn btn-add" onClick={addItem}>+ Add Item</button>
            <button
              type="button"
              className={`btn btn-recurring${bill.recurring ? ' btn-recurring-on' : ''}`}
              onClick={() => onMakeRecurring(!bill.recurring)}
            >
              ↻ {bill.recurring ? 'Recurring · on' : 'Make Recurring'}
            </button>
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


// ---- Tracked Keywords Panel ----

const TrackedPanel = ({ bills, keywords, onAdd, onRemove, selectedMonth, categoriesById, fallbackCategory }) => {
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
            const summary = aggregateByKeyword(bills, kw, categoriesById);
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
            const cat = categoriesById.get(summary.categoryId) || fallbackCategory;
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


// ---- Recurring Panels (split by flow) ----

const RecurringSection = ({ title, charges, totalLabel, categoriesById, fallbackCategory }) => {
  if (charges.length === 0) return null;
  const total = charges.filter(c => c.active).reduce((s, c) => s + Math.abs(c.lastAmount), 0);
  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="panel-title">{title}</h3>
        <span className="panel-sub">~{formatCurrency(total)}/mo {totalLabel}</span>
      </div>
      <div className="sub-list">
        {charges.map(c => {
          const cat = categoriesById.get(c.categoryId) || fallbackCategory;
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
                  {formatCurrency(Math.abs(c.lastAmount))}
                  {c.varies && <span className="sub-varies" title={`Avg ${formatCurrency(Math.abs(c.avgAmount))}`}>varies</span>}
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

const RecurringPanels = ({ bills, today, trackedKeywords = [], categoriesById, fallbackCategory }) => {
  const all = findRecurringCharges(bills, today, categoriesById);
  const filtered = all.filter(c => !trackedKeywords.some(kw =>
    c.description.toUpperCase().includes(kw.toUpperCase())
  ));
  if (filtered.length === 0) return null;

  const income   = filtered.filter(c => c.flow === 'income');
  const expense  = filtered.filter(c => c.flow === 'expense');
  const savings  = filtered.filter(c => c.flow === 'savings');

  return (
    <>
      <RecurringSection
        title="Recurring · Income"
        charges={income}
        totalLabel="in"
        categoriesById={categoriesById}
        fallbackCategory={fallbackCategory}
      />
      <RecurringSection
        title="Recurring · Expenses"
        charges={expense}
        totalLabel="out"
        categoriesById={categoriesById}
        fallbackCategory={fallbackCategory}
      />
      <RecurringSection
        title="Recurring · Savings"
        charges={savings}
        totalLabel="saved"
        categoriesById={categoriesById}
        fallbackCategory={fallbackCategory}
      />
    </>
  );
};


// ---- Main App ----

function BillTracker() {
  // One-time schema-v1 → v2 migration: items.category (string) → items.categoryId (id ref).
  // Extracted to initializeFromStorage.js for testability. Writes a backup before transforming
  // so the user can recover if migration throws.
  const [{ bills: initialBills, migrationError, conflicts: initialConflicts }] = useState(() => initializeFromStorage(window.localStorage));
  const [bills, setBills] = useState(initialBills);
  const [migrationBanner, setMigrationBanner] = useState(migrationError);
  // eslint-disable-next-line no-unused-vars -- staged for Task 11 (RecurringConflictDialog)
  const [pendingConflictQueue, setPendingConflictQueue] = useState(initialConflicts || []);

  const cats = useCategories();
  const [screen, setScreen] = useState('main');

  // Confirm-and-apply state for keyword adds.
  const [pendingKeywordApply, setPendingKeywordApply] = useState(null);
  // Shape: { catId, keyword, matchingItems: [...] }

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
  const [pendingRecurringTip, setPendingRecurringTip] = useState(false);
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

  const categoriesById = React.useMemo(
    () => new Map(cats.categories.map(c => [c.id, c])),
    [cats.categories]
  );
  const fallbackCategory = React.useMemo(
    () => cats.getById(cats.otherId()) || { name: 'Other', icon: '📋', color: '#6B7280' },
    [cats]
  );

  const todayMonth = currentMonthKey();
  const monthBills = bills.filter(bill => bill.month === selectedMonth);
  const selectedMonthItems = getMonthItems(bills, selectedMonth);

  function sumByFlow(items, targetFlow) {
    let s = 0;
    for (const it of items) {
      const cat = categoriesById.get(it.categoryId);
      const flow = cat && cat.flow ? cat.flow : 'expense';
      if (flow === targetFlow) s += it.amount;
    }
    return s;
  }

  const selectedMonthIncome = sumByFlow(selectedMonthItems, 'income');
  const selectedMonthSpent  = sumByFlow(selectedMonthItems, 'expense');
  const selectedMonthSaved  = sumByFlow(selectedMonthItems, 'savings');
  const selectedMonthNet    = selectedMonthIncome - selectedMonthSpent - selectedMonthSaved;

  const previousMonth = shiftMonth(selectedMonth, -1);
  const previousMonthItems = getMonthItems(bills, previousMonth);
  const previousMonthSpent = sumByFlow(previousMonthItems, 'expense');

  let monthDelta = null;
  if (previousMonthSpent > 0) {
    const change = (selectedMonthSpent - previousMonthSpent) / previousMonthSpent;
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
      const cat = cats.getById(item.categoryId);
      if (cat && cat.name.toLowerCase().includes(t)) return true;
      if (Number.isFinite(num) && Math.abs(item.amount - num) < 0.01) return true;
    }
    return false;
  };

  const visibleBills = searchActive
    ? bills.filter(b => matchesSearch(b, searchTerm))
    : monthBills;

  const expenseItemsForBreakdown = (searchActive ? visibleBills.flatMap(b => b.items ?? []) : selectedMonthItems)
    .filter(it => {
      const cat = categoriesById.get(it.categoryId);
      const flow = cat && cat.flow ? cat.flow : 'expense';
      return flow === 'expense';
    });

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
        categoryId: cats.autoCategorize(it.description),
      }));

      const newBill = {
        id: crypto.randomUUID(),
        vendor: vendor || 'Scanned Bill',
        month: month || new Date().toISOString().slice(0, 7),
        items: mappedItems.length > 0 ? mappedItems : [{
          id: crypto.randomUUID(),
          description: 'No items detected — add manually',
          amount: 0,
          categoryId: cats.otherId(),
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
          categoryId: cats.otherId(),
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
      items: [{ id: Date.now(), description: "", amount: 0, categoryId: cats.otherId(), date: null }]
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

  const markRecurring = (billId, makeRecurring) => {
    pushHistory(bills);
    setBills(prev => prev.map(b => {
      if (b.id !== billId) return b;
      if (makeRecurring) {
        return {
          ...b,
          recurring: true,
          recurringChainId: b.recurringChainId || nanoid(8),
        };
      }
      return { ...b, recurring: false };  // keep recurringChainId for history
    }));
    try {
      if (makeRecurring && localStorage.getItem('billtracker-recurring-tip-seen') !== 'true') {
        setPendingRecurringTip(true);
      }
    } catch (e) {
      // storage unavailable — silently skip the tip
    }
    maybeShowUndoTip();
  };

  const dismissRecurringTip = () => {
    setPendingRecurringTip(false);
    try { localStorage.setItem('billtracker-recurring-tip-seen', 'true'); } catch (e) { /* quota */ }
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

      {screen === 'manage-categories' && (
        <ManageCategoriesScreen
          categories={cats.categories}
          bills={bills}
          onClose={() => setScreen('main')}
          onAddCategory={(payload) => cats.addCategory(payload)}
          onUpdateCategory={(id, patch) => cats.updateCategory(id, patch)}
          onDeleteCategory={(id) => cats.deleteCategory(id, bills)}
          onAddKeyword={(catId, kw) => {
            const result = cats.addKeyword(catId, kw, bills);
            if (result.added && result.matchingItems.length > 0) {
              setPendingKeywordApply({ catId, keyword: kw.toUpperCase(), matchingItems: result.matchingItems });
            }
            return result;
          }}
          onRemoveKeyword={(catId, kw) => cats.removeKeyword(catId, kw)}
          onAddTemplate={(catId, t) => cats.addTemplate(catId, t)}
          onRemoveTemplate={(catId, t) => cats.removeTemplate(catId, t)}
          onMoveAll={(fromId, toId) => {
            const itemRefs = cats.findItemsInCategory(fromId, bills);
            if (itemRefs.length === 0) return;
            pushHistory(bills);
            setBills(prev => cats.applyCategoryToItems(prev, itemRefs, toId));
          }}
        />
      )}

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

      {pendingRecurringTip && <RecurringTipDialog onDismiss={dismissRecurringTip} />}

      {showUndoTip && (
        <ConfirmDialog
          title="Tip: you can undo deletes"
          message="If you accidentally delete a bill or an item, click the ↩ Undo button in the top toolbar to restore it."
          confirmLabel="OK, got it"
          onConfirm={dismissUndoTip}
        />
      )}

      {pendingKeywordApply && (
        <ConfirmDialog
          title={`Apply "${pendingKeywordApply.keyword}" to existing items?`}
          message={`${pendingKeywordApply.matchingItems.length} existing item${
            pendingKeywordApply.matchingItems.length === 1 ? '' : 's'
          } would change category under this rule.`}
          confirmLabel="Apply"
          onConfirm={() => {
            pushHistory(bills);
            setBills(prev => cats.applyCategoryToItems(prev, pendingKeywordApply.matchingItems, pendingKeywordApply.catId));
            setPendingKeywordApply(null);
          }}
          onCancel={() => setPendingKeywordApply(null)}
        />
      )}

      {/* Undo Toast */}
      {undoToast && (
        <div className="toast">
          ↩ Change undone
        </div>
      )}

      {/* Migration recovery banner */}
      {migrationBanner && (
        <div className="toast toast-error">
          {migrationBanner.message}
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Dismiss"
            onClick={() => setMigrationBanner(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Storage quota error toast */}
      {cats.storageError && (
        <div className="toast toast-error">
          {cats.storageError.message}
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Dismiss"
            onClick={cats.clearStorageError}
          >
            ×
          </button>
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
              type="button"
              onClick={() => setScreen('manage-categories')}
              className="btn"
              aria-label="Manage Categories"
            >
              ☰ Categories
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
          <SummaryCard title="Income" amount={selectedMonthIncome} colorKey="green" />
          <SummaryCard title="Spent"  amount={selectedMonthSpent}  colorKey="red"   delta={monthDelta} />
          <SummaryCard title="Saved"  amount={selectedMonthSaved}  colorKey="blue"  />
          <SummaryCard title="Net"    amount={selectedMonthNet}    colorKey="amber" />
        </div>

        {/* Spending Hero */}
        <SpendingChart
          bills={bills}
          selectedMonth={selectedMonth}
          onSelectMonth={setSelectedMonth}
          categoriesById={categoriesById}
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
                  defaultCategoryId={cats.otherId()}
                  categories={cats.categories}
                  categoriesById={categoriesById}
                  otherCategoryId={cats.otherId()}
                  onUpdate={updateBill}
                  onDelete={deleteBill}
                  onDeleteItem={handleDeleteItem}
                  onMakeRecurring={(makeRecurring) => markRecurring(bill.id, makeRecurring)}
                  isMobile={isMobile}
                  highlighted={bill.id === newlyAddedBillId}
                  cardRef={bill.id === newlyAddedBillId ? newBillRef : null}
                />
              ))
            )}
          </div>

          {/* Sidebar */}
          <div className="sidebar">
            <CategoryBreakdown
              items={expenseItemsForBreakdown}
              categories={cats.categories}
              otherCategoryId={cats.otherId()}
              selectedMonth={searchActive ? null : selectedMonth}
              onUpdateCategory={cats.updateCategory}
            />
            <TrackedPanel
              bills={bills}
              keywords={trackedKeywords}
              onAdd={addKeyword}
              onRemove={removeKeyword}
              selectedMonth={selectedMonth}
              categoriesById={categoriesById}
              fallbackCategory={fallbackCategory}
            />
            <RecurringPanels
              bills={bills}
              today={todayMonth}
              trackedKeywords={trackedKeywords}
              categoriesById={categoriesById}
              fallbackCategory={fallbackCategory}
            />

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

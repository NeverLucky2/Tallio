import React, { useState, useRef, useCallback, useEffect } from 'react';
import Tesseract from 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';
import PhoneCapture from './PhoneCapture.jsx';
import useDesktopPeer from './useDesktopPeer.js';
import PairingPanel from './PairingPanel.jsx';
import './App.css';

const performOCR = async (imageSource, onProgress) => {
  try {
    const result = await Tesseract.recognize(
      imageSource,
      'eng',
      {
        logger: m => {
          if (m.status === 'recognizing text' && onProgress) {
            onProgress(Math.round(m.progress * 100));
          }
        }
      }
    );
    return result.data.text;
  } catch (error) {
    console.error('OCR Error:', error);
    return '';
  }
};

const parseTransactions = (text) => {
  const lines = text.split('\n').filter(l => l.trim());
  const items = [];

  for (const line of lines) {
    const amountMatch = line.match(/(.+?)\s+\$?([\d,]+\.\d{2})\s*$/);
    if (amountMatch) {
      const description = amountMatch[1].trim();
      const amount = parseFloat(amountMatch[2].replace(',', ''));

      if (description.length > 3 && !isNaN(amount) && amount > 0 && amount < 100000) {
        const skipWords = ['total', 'balance', 'payment', 'credit', 'amount', 'date', 'description', 'trans'];
        const lowerDesc = description.toLowerCase();
        if (!skipWords.some(w => lowerDesc.includes(w) && description.length < 30)) {
          items.push({
            id: Date.now() + Math.random(),
            description: description,
            amount: amount,
            category: autoCategorizeTx(description)
          });
        }
      }
    }
  }

  return items;
};

const categories = [
  { name: "Utilities",      icon: "⚡", color: "#F59E0B" },
  { name: "Groceries",      icon: "🛒", color: "#10B981" },
  { name: "Healthcare",     icon: "💊", color: "#EF4444" },
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
  return "Other";
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
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

const BillItem = ({ item, onUpdate, onDelete, isMobile }) => {
  const category = categories.find(c => c.name === item.category) || categories[10];

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
        type="text"
        value={item.description}
        onChange={(e) => onUpdate({ ...item, description: e.target.value })}
        className="input-transparent"
        placeholder="Description"
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


// ---- Bill Card ----

const BillCard = ({ bill, onUpdate, onDelete, isMobile }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const total = bill.items.reduce((sum, item) => sum + item.amount, 0);

  const addItem = () => {
    const newItem = { id: Date.now(), description: "", amount: 0, category: "Other" };
    onUpdate({ ...bill, items: [...bill.items, newItem] });
  };

  const updateItem = (updatedItem) => {
    onUpdate({
      ...bill,
      items: bill.items.map(item => item.id === updatedItem.id ? updatedItem : item)
    });
  };

  const deleteItem = (itemId) => {
    onUpdate({ ...bill, items: bill.items.filter(item => item.id !== itemId) });
  };

  const initial = (bill.vendor || "?").charAt(0).toUpperCase();

  return (
    <div className="bill-card">
      <div className="bill-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="bill-icon">
          <span className="bill-icon-char">{initial}</span>
        </div>
        <div className="bill-info">
          <h3 className="bill-vendor">{bill.vendor || "Untitled Bill"}</h3>
          <div className="bill-meta">
            {formatDate(bill.date)}
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
              type="date"
              value={bill.date}
              onChange={(e) => onUpdate({ ...bill, date: e.target.value })}
              className="input"
              style={{ width: isMobile ? '100%' : '160px', flex: isMobile ? '1 1 auto' : '0 0 auto' }}
            />
          </div>

          <div className="bill-items-list">
            {bill.items.map(item => (
              <BillItem
                key={item.id}
                item={item}
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

const SummaryCard = ({ title, amount, isCount, colorKey }) => (
  <div className={`stat-card stat-card-${colorKey}`}>
    <div className="stat-label">
      <div className={`stat-dot stat-dot-${colorKey}`} />
      {title}
    </div>
    <div className="stat-value">
      {isCount ? amount : formatCurrency(amount)}
    </div>
  </div>
);


// ---- Category Breakdown ----

const CategoryBreakdown = ({ bills }) => {
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
        <h3 className="panel-title">Spending</h3>
      </div>

      {sortedCategories.length === 0 ? (
        <p className="panel-empty">No expenses recorded yet</p>
      ) : (
        <div className="cat-list">
          {sortedCategories.map(([categoryName, amount]) => {
            const category = categories.find(c => c.name === categoryName) || categories[10];
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


// ---- Main App ----

function BillTracker() {
  const [bills, setBills] = useState([]);
  const [history, setHistory] = useState([]);
  const [undoToast, setUndoToast] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const desktopPeer = useDesktopPeer();
  const [showPairing, setShowPairing] = useState(false);

  const openPairing = () => {
    if (!desktopPeer.active) desktopPeer.start();
    setShowPairing(true);
  };

  useEffect(() => {
    if (!desktopPeer.lastImage) return;
    handleCapture(desktopPeer.lastImage.dataUrl, 'phone');
    desktopPeer.consumeImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopPeer.lastImage]);

  const fileInputRef = useRef(null);
  const toastTimerRef = useRef(null);
  const hasLoaded = useRef(false);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;

  useEffect(() => {
    try {
      const saved = localStorage.getItem('billtracker-bills');
      if (saved) setBills(JSON.parse(saved));
    } catch (e) {
      // No saved bills yet
    } finally {
      hasLoaded.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) return;
    try {
      localStorage.setItem('billtracker-bills', JSON.stringify(bills));
    } catch (e) {
      console.error('Failed to save bills:', e);
    }
  }, [bills]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const thisMonthBills = bills.filter(bill => {
    const billDate = new Date(bill.date);
    const now = new Date();
    return billDate.getMonth() === now.getMonth() && billDate.getFullYear() === now.getFullYear();
  });

  const thisMonthTotal = thisMonthBills.reduce((sum, bill) =>
    sum + bill.items.reduce((itemSum, item) => itemSum + item.amount, 0), 0
  );

  const parseBillText = (text) => {
    const lines = text.split('\n').filter(l => l.trim());
    const items = [];
    const txPattern = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)\s+(.+?)\s+\$?([\d,]+\.?\d*)\s*$/i;
    for (const line of lines) {
      const match = line.match(txPattern);
      if (match) {
        const description = match[5].trim();
        const amount = parseFloat(match[6].replace(',', ''));
        if (!isNaN(amount) && amount > 0) {
          items.push({
            id: Date.now() + Math.random(),
            description,
            amount,
            category: autoCategorizeTx(description),
            transDate: `${match[1]} ${match[2]}`,
            postDate: `${match[3]} ${match[4]}`
          });
        }
      }
    }
    return items;
  };

  const handleCapture = async (imageData, type) => {
    setShowCamera(false);
    setIsProcessing(true);
    setOcrProgress(0);
    setProcessingStatus('Initializing OCR...');

    try {
      setProcessingStatus('Extracting text...');
      const extractedText = await performOCR(imageData, (progress) => {
        setOcrProgress(progress);
        setProcessingStatus(`Extracting text... ${progress}%`);
      });

      setProcessingStatus('Parsing transactions...');
      const items = parseTransactions(extractedText);

      const newBill = {
        id: Date.now(),
        vendor: items.length > 0 ? "Scanned Bill" : "New Bill",
        date: new Date().toISOString().split('T')[0],
        items: items.length > 0 ? items : [{
          id: Date.now(),
          description: "No transactions detected — add manually",
          amount: 0,
          category: "Other"
        }],
        rawText: extractedText
      };

      setBills(prev => { pushHistory(prev); return [newBill, ...prev]; });
    } catch (error) {
      console.error('Processing Error:', error);
      const newBill = {
        id: Date.now(),
        vendor: "Scanned Bill",
        date: new Date().toISOString().split('T')[0],
        items: [{ id: Date.now(), description: "OCR failed — add items manually", amount: 0, category: "Other" }]
      };
      setBills(prev => { pushHistory(prev); return [newBill, ...prev]; });
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
      setOcrProgress(0);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    setOcrProgress(0);

    if (file.type === 'application/pdf') {
      setProcessingStatus('Converting PDF to image...');
      try {
        const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.mjs');
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.mjs';

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const allItems = [];
        const pageCount = Math.min(pdf.numPages, 5);

        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
          setProcessingStatus(`Processing page ${pageNum} of ${pageCount}...`);
          const page = await pdf.getPage(pageNum);
          const scale = 2;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport }).promise;
          const imageData = canvas.toDataURL('image/png');
          setProcessingStatus(`OCR on page ${pageNum}...`);
          const text = await performOCR(imageData, (progress) => {
            const overallProgress = Math.round(((pageNum - 1) / pageCount * 100) + (progress / pageCount));
            setOcrProgress(overallProgress);
          });
          const pageItems = parseTransactions(text);
          allItems.push(...pageItems);
        }

        const newBill = {
          id: Date.now(),
          vendor: file.name.replace('.pdf', ''),
          date: new Date().toISOString().split('T')[0],
          items: allItems.length > 0 ? allItems : [{
            id: Date.now(),
            description: "No transactions detected — add manually",
            amount: 0,
            category: "Other"
          }]
        };
        setBills(prev => [newBill, ...prev]);
      } catch (error) {
        console.error('PDF processing error:', error);
        setProcessingStatus('Error processing PDF');
        const newBill = {
          id: Date.now(),
          vendor: file.name.replace('.pdf', ''),
          date: new Date().toISOString().split('T')[0],
          items: [{ id: Date.now(), description: "PDF processing failed — add manually", amount: 0, category: "Other" }]
        };
        setBills(prev => [newBill, ...prev]);
      } finally {
        setIsProcessing(false);
        setProcessingStatus('');
        setOcrProgress(0);
      }
    } else {
      setProcessingStatus('Loading image...');
      const reader = new FileReader();
      reader.onload = async (event) => {
        await handleCapture(event.target.result, 'image');
      };
      reader.readAsDataURL(file);
    }

    e.target.value = '';
  };

  const addManualBill = () => {
    pushHistory(bills);
    const newBill = {
      id: Date.now(),
      vendor: "",
      date: new Date().toISOString().split('T')[0],
      items: [{ id: Date.now(), description: "", amount: 0, category: "Other" }]
    };
    setBills(prev => [newBill, ...prev]);
  };

  const updateBill = (updatedBill) => {
    pushHistory(bills);
    setBills(prev => prev.map(bill => bill.id === updatedBill.id ? updatedBill : bill));
  };

  const deleteBill = (billId) => {
    pushHistory(bills);
    setBills(prev => prev.filter(bill => bill.id !== billId));
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
          {ocrProgress > 0 && (
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${ocrProgress}%` }} />
            </div>
          )}
          <p className="processing-hint">Powered by Tesseract.js free OCR</p>
        </div>
      )}

      {showPairing && (
        <PairingPanel
          peer={desktopPeer}
          onClose={() => setShowPairing(false)}
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
            <h1 className="brand-title">
              Bill<span className="brand-title-accent">Tracker</span>
            </h1>
            <p className="brand-sub">Scan · Track · Manage</p>
          </div>
          <div className="header-actions">
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
          <SummaryCard title="This Month"     amount={thisMonthTotal} colorKey="green" />
          <SummaryCard title="Total Bills"    amount={bills.length} isCount={true} colorKey="purple" />
        </div>

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

              <button onClick={openPairing} className="btn btn-action">
                ⌘ Pair Phone
              </button>

              {!isMobile && (
                <div className="format-badge">PDF · OCR</div>
              )}
            </div>

            {/* Bills List */}
            <div className="section-header">
              <h2 className="section-title">Bills</h2>
              <span className="section-count">{bills.length}</span>
            </div>

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
            ) : (
              bills.map(bill => (
                <BillCard
                  key={bill.id}
                  bill={bill}
                  onUpdate={updateBill}
                  onDelete={deleteBill}
                  isMobile={isMobile}
                />
              ))
            )}
          </div>

          {/* Sidebar */}
          <div className="sidebar">
            <CategoryBreakdown bills={bills} />

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

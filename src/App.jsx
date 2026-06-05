import React, { useState, useRef, useEffect, useMemo } from 'react';
import PhoneCapture from './PhoneCapture.jsx';
import useDesktopPeer from './useDesktopPeer.js';
import PairingPanel from './PairingPanel.jsx';
import useSettings from './useSettings.js';
import SettingsPanel from './SettingsPanel.jsx';
import useAppearance from './useAppearance.js';
import useBackgroundPhotos from './useBackgroundPhotos.js';
import AppearanceScreen from './AppearanceScreen.jsx';
import BackgroundLayer from './BackgroundLayer.jsx';
import Icon from './Icon.jsx';
import { extractBillFromImage } from './billExtractor.js';
import useCategories from './useCategories.js';
import useLedger from './useLedger.js';
import useAccountTypes from './useAccountTypes.js';
import useReportAcks from './useReportAcks.js';
import AccountTypesScreen from './AccountTypesScreen.jsx';
import AccountList from './AccountList.jsx';
import Register from './Register.jsx';
import TransactionEditor from './TransactionEditor.jsx';
import TransferEditor from './TransferEditor.jsx';
import { resolveTransfer, payFromUpdate, transferDraftForAccount } from './accountsModel.js';
import AccountEditor from './AccountEditor.jsx';
import ManageCategoriesScreen from './ManageCategoriesScreen.jsx';
import UndoButton from './UndoButton.jsx';
import ReportsScreen from './ReportsScreen.jsx';
import { initializeFromStorage } from './initializeFromStorage.js';
import { buildArchive } from './exportArchive.js';
import { listImages } from './imageStore.js';
import './App.css';
import pkg from '../package.json';


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
      } catch {
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


// ---- Main App ----

function Tallio() {
  // One-time schema migration runs here (v1→v4). initializeFromStorage returns the
  // flat ledger ({ accounts, transactions }) plus any migration error to surface.
  const [{ accounts: initAccounts, transactions: initTransactions, migrationError }] =
    useState(() => initializeFromStorage(window.localStorage));
  const [migrationBanner, setMigrationBanner] = useState(migrationError);

  const ledger = useLedger({ accounts: initAccounts, transactions: initTransactions });
  const cats = useCategories();
  const accountTypes = useAccountTypes();
  const acks = useReportAcks();
  const categoriesById = useMemo(() => new Map(cats.categories.map(c => [c.id, c])), [cats.categories]);

  const [screen, setScreen] = useState('main'); // 'main' | 'manage-categories' | 'account-types'
  const [selectedAccountId, setSelectedAccountId] = useState(initAccounts[0]?.id ?? null);
  const [editingTxn, setEditingTxn] = useState(null);       // { mode:'new'|'edit', accountId, transaction? }
  const [editingTransfer, setEditingTransfer] = useState(null); // { mode:'new'|'edit', fromAccountId?, transfer? }
  const [editingAccount, setEditingAccount] = useState(null); // { mode:'new'|'edit', account? }

  // Undo: snapshots of the whole ledger + report acknowledgments.
  const [history, setHistory] = useState([]);
  const pushHistory = () => setHistory(prev => [...prev.slice(-19), {
    ledger: ledger.snapshot(),
    acks: acks.exportSnapshot(),
    categories: cats.snapshot(),
    accountTypes: accountTypes.snapshot(),
  }]);
  const undo = () => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const entry = prev[prev.length - 1];
      ledger.restore(entry.ledger);
      acks.restore(entry.acks);
      cats.restore(entry.categories);
      accountTypes.restore(entry.accountTypes);
      return prev.slice(0, -1);
    });
  };

  // Ctrl/Cmd+Z triggers Undo, except while typing in a field (preserve native text undo).
  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => {
    const onKeyDown = (e) => {
      const k = e.key ? e.key.toLowerCase() : '';
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || k !== 'z') return;
      const el = e.target;
      const tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el && el.isContentEditable)) return;
      e.preventDefault();
      undoRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Capture / scan / pairing state (carried over unchanged).
  const desktopPeer = useDesktopPeer();
  const settings = useSettings();
  const appearance = useAppearance();
  const bgPhotos = useBackgroundPhotos(appearance.background);
  // Drive the global UI zoom (#root { zoom: var(--ui-scale) }) from the persisted setting.
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale));
  }, [settings.uiScale]);
  const [showCamera, setShowCamera] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [showPairing, setShowPairing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsBanner, setSettingsBanner] = useState(null);

  const fileInputRef = useRef(null);

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

  const selectedAccount = ledger.accounts.find(a => a.id === selectedAccountId) || ledger.accounts[0] || null;

  // Account CRUD
  const saveAccount = (data) => {
    pushHistory();
    if (data.id) ledger.updateAccount(data.id, data);
    else { const id = ledger.addAccount(data); setSelectedAccountId(id); }
    setEditingAccount(null);
  };
  const deleteAccount = (id) => {
    pushHistory();
    ledger.deleteAccount(id);
    if (selectedAccountId === id) setSelectedAccountId(ledger.accounts.find(a => a.id !== id)?.id ?? null);
    setEditingAccount(null);
  };

  // Account-type CRUD (reassign-then-delete coordinated here since App holds ledger.updateAccount)
  const saveAccountType = (data) => {
    pushHistory();
    if (data.id) accountTypes.updateType(data.id, data);
    else accountTypes.addType(data);
  };
  const deleteAccountType = (id, reassignToId) => {
    pushHistory();
    if (reassignToId) {
      for (const a of ledger.accounts) {
        if (a.type === id) ledger.updateAccount(a.id, { type: reassignToId });
      }
    }
    accountTypes.deleteType(id);
  };

  // Transaction CRUD
  const saveTransaction = (data) => {
    pushHistory();
    const { splitTargets, ...rest } = data;
    const opts = splitTargets ? { splitTargets } : {};
    if (rest.id) ledger.updateTransaction(rest.id, rest, opts);
    else ledger.addTransaction(rest, opts);
    setEditingTxn(null);
  };
  const deleteTransaction = (id) => { pushHistory(); ledger.deleteTransaction(id); setEditingTxn(null); };

  // Transfer CRUD — one pushHistory() per op so a single undo reverts the whole pair.
  const saveTransfer = (data) => {
    pushHistory();
    if (data.transferId) ledger.updateTransfer(data.transferId, data);
    else ledger.addTransfer(data);
    const patch = payFromUpdate(data.toId, data.fromId, ledger.accounts, accountTypes.typesById);
    if (patch) ledger.updateAccount(data.toId, patch);
    setEditingTransfer(null);
  };
  const deleteTransfer = (transferId) => { pushHistory(); ledger.deleteTransfer(transferId); setEditingTransfer(null); };
  const openTransfer = (accountId) => {
    const account = ledger.accounts.find(a => a.id === accountId);
    const draft = transferDraftForAccount(account, ledger.transactions, ledger.accounts, accountTypes.typesById);
    setEditingTransfer({ mode: 'new', ...draft });
  };

  const exportData = async () => {
    let images = [];
    try {
      const recs = await listImages();
      images = await Promise.all(recs.map(async (r) => ({
        id: r.id, name: r.name, group: r.group, type: r.type,
        w: r.w, h: r.h, palette: r.palette, createdAt: r.createdAt,
        bytes: new Uint8Array(await r.blob.arrayBuffer()),
        thumbBytes: r.thumb ? new Uint8Array(await r.thumb.arrayBuffer()) : null,
      })));
    } catch { /* no images / IndexedDB unavailable */ }

    let appearanceSettings = null;
    try {
      const raw = window.localStorage.getItem('tallio-appearance');
      if (raw) appearanceSettings = JSON.parse(raw);
    } catch { /* ignore */ }

    const bytes = buildArchive({
      accounts: ledger.accounts, transactions: ledger.transactions,
      categories: cats.categories, accountTypes: accountTypes.types,
      reportAcks: acks.exportSnapshot(),
      images, appearance: appearanceSettings,
      schemaVersion: 4, appVersion: pkg.version, now: new Date(),
    });
    const blob = new Blob([bytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tallio-${new Date().toISOString().split('T')[0]}.zip`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCapture = async (imageData, source) => {
    setShowCamera(false);
    if (!settings.hasKey) {
      openSettings(source === 'phone'
        ? 'Phone captured a bill — add an Anthropic API key to process it.'
        : 'Add an Anthropic API key to scan bills.');
      return false;
    }
    setIsProcessing(true);
    setProcessingStatus('Reading bill…');
    try {
      const { vendor, items } = await extractBillFromImage(imageData, { apiKey: settings.apiKey, model: settings.model });
      pushHistory();
      // Target account: the selected one, else create an untyped account named after the vendor.
      let targetId = selectedAccountId;
      if (!targetId) targetId = ledger.addAccount({ name: vendor || 'Scanned account', type: 'untyped', icon: '🏦' });
      for (const it of items) {
        const flow = (categoriesById.get(cats.autoCategorize(it.description))?.flow) || 'expense';
        const sign = flow === 'income' ? 1 : -1;
        ledger.addTransaction({
          accountId: targetId,
          date: it.date || new Date().toISOString().slice(0, 10),
          amount: sign * (Number.isFinite(it.amount) ? it.amount : 0),
          categoryId: cats.autoCategorize(it.description),
          description: it.description,
        });
      }
      setSelectedAccountId(targetId);
    } catch (err) {
      setMigrationBanner({ message: `Scan failed: ${err.message || 'extraction error'}.`, recovered: false });
    } finally {
      setIsProcessing(false); setProcessingStatus('');
    }
    return true;
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

  return (
    <div className="app-root">
      <div className="app-bg-gradient" />
      <BackgroundLayer
        background={appearance.background}
        photos={bgPhotos.photos}
        activeIndex={bgPhotos.activeIndex}
      />

      {screen === 'manage-categories' && (
        <ManageCategoriesScreen
          categories={cats.categories}
          bills={[]} /* category screen still accepts a bills prop for keyword apply; pass [] in Phase 1 */
          onClose={() => setScreen('main')}
          onAddCategory={(p) => { pushHistory(); return cats.addCategory(p); }}
          onUpdateCategory={(id, patch) => { pushHistory(); cats.updateCategory(id, patch); }}
          onDeleteCategory={(id) => { pushHistory(); return cats.deleteCategory(id, []); }}
          onAddKeyword={(catId, kw) => { pushHistory(); return cats.addKeyword(catId, kw, []); }}
          onRemoveKeyword={(catId, kw) => { pushHistory(); cats.removeKeyword(catId, kw); }}
          onAddTemplate={(catId, t) => { pushHistory(); cats.addTemplate(catId, t); }}
          onRemoveTemplate={(catId, t) => { pushHistory(); cats.removeTemplate(catId, t); }}
          onMoveAll={() => {}}
          onAddSub={(catId) => { pushHistory(); return cats.addSub(catId, {}); }}
          onUpdateSub={(catId, subId, patch) => { pushHistory(); cats.updateSub(catId, subId, patch); }}
          onDeleteSub={(catId, subId) => { pushHistory(); cats.deleteSub(catId, subId); }}
          onAddSubKeyword={(catId, subId, kw) => { pushHistory(); cats.addSubKeyword(catId, subId, kw); }}
          onRemoveSubKeyword={(catId, subId, kw) => { pushHistory(); cats.removeSubKeyword(catId, subId, kw); }}
          onPromoteKeyword={(catId, kw) => { pushHistory(); return cats.promoteKeywordToSub(catId, kw); }}
          onUndo={undo}
          undoCount={history.length}
        />
      )}

      {screen === 'account-types' && (
        <AccountTypesScreen
          types={accountTypes.types}
          accounts={ledger.accounts}
          onClose={() => setScreen('main')}
          onSaveType={saveAccountType}
          onDeleteType={deleteAccountType}
          onUndo={undo}
          undoCount={history.length}
        />
      )}

      {screen === 'reports' && (
        <ReportsScreen
          accounts={ledger.accounts}
          transactions={ledger.transactions}
          categories={cats.categories}
          types={accountTypes.types}
          typesById={accountTypes.typesById}
          subscriptions={acks.subscriptions}
          dismissedDuplicates={acks.dismissedDuplicates}
          onSetStatus={(key, status, month) => { pushHistory(); acks.setStatus(key, status, month); }}
          onClearStatus={(key) => { pushHistory(); acks.clearStatus(key); }}
          onDismissDuplicate={(sig) => { pushHistory(); acks.dismissDuplicate(sig); }}
          onClose={() => setScreen('main')}
        />
      )}

      {showCamera && <CameraCapture onCapture={handleCapture} onClose={() => setShowCamera(false)} />}
      {isProcessing && (
        <div className="processing-overlay"><div className="processing-spinner" /><p className="processing-label">{processingStatus || 'Processing...'}</p></div>
      )}
      {showPairing && <PairingPanel peer={desktopPeer} onClose={() => setShowPairing(false)} />}
      {screen === 'appearance' && (
        <AppearanceScreen
          appearance={appearance}
          categories={cats.categories}
          accounts={ledger.accounts}
          accountTypes={accountTypes.types}
          onUndo={undo}
          undoCount={history.length}
          onClose={() => setScreen('main')}
        />
      )}
      {showSettings && <SettingsPanel settings={settings} onClose={closeSettings} banner={settingsBanner} />}

      {editingAccount && (
        <AccountEditor
          account={editingAccount.account || null}
          types={accountTypes.types}
          onSave={saveAccount} onDelete={deleteAccount} onClose={() => setEditingAccount(null)}
          onUndo={undo} undoCount={history.length}
        />
      )}
      {editingTxn && selectedAccount && (
        <TransactionEditor
          account={selectedAccount}
          transaction={editingTxn.transaction || null}
          categories={cats.categories}
          accounts={ledger.accounts}
          typesById={accountTypes.typesById}
          onSave={saveTransaction} onDelete={deleteTransaction} onClose={() => setEditingTxn(null)}
          onUndo={undo} undoCount={history.length}
        />
      )}
      {editingTransfer && (
        <TransferEditor
          accounts={ledger.accounts}
          categories={cats.categories}
          types={accountTypes.types}
          typesById={accountTypes.typesById}
          fromAccountId={editingTransfer.fromAccountId || null}
          toAccountId={editingTransfer.toAccountId || null}
          initialAmount={editingTransfer.initialAmount ?? null}
          transfer={editingTransfer.transfer || null}
          onSave={saveTransfer} onDelete={deleteTransfer} onClose={() => setEditingTransfer(null)}
          onUndo={undo} undoCount={history.length}
        />
      )}

      {migrationBanner && (
        <div className="toast toast-error">{migrationBanner.message}
          <button type="button" className="toast-dismiss" aria-label="Dismiss" onClick={() => setMigrationBanner(null)}>×</button>
        </div>
      )}
      {ledger.storageError && (
        <div className="toast toast-error">{ledger.storageError.message}
          <button type="button" className="toast-dismiss" aria-label="Dismiss" onClick={ledger.clearStorageError}>×</button>
        </div>
      )}
      {acks.storageError && (
        <div className="toast toast-error">{acks.storageError.message}
          <button type="button" className="toast-dismiss" aria-label="Dismiss" onClick={acks.clearStorageError}>×</button>
        </div>
      )}

      <div className="container">
        <header className="header">
          <div className="brand">
            <Icon value={appearance.appIcons.headerAvatar} fallback="✦" className="header-avatar" title="Your avatar" />
            <h1 className="brand-title">Tall<span className="brand-title-accent">io</span></h1>
            <p className="brand-sub">Accounts</p>
          </div>
          <div className="header-actions">
            <button onClick={() => openSettings()} className="btn-icon" aria-label="Settings">⚙</button>
            <button type="button" onClick={() => setScreen('appearance')} className="btn-icon" aria-label="Appearance">🎨</button>
            <button type="button" onClick={() => setScreen('manage-categories')} className="btn">☰ Categories</button>
            <button type="button" onClick={() => setScreen('account-types')} className="btn">▤ Account Types</button>
            <button type="button" onClick={() => setScreen('reports')} className="btn">📊 Reports</button>
            <button onClick={() => setShowCamera(true)} className="btn btn-primary">◉ Scan</button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,application/pdf" style={{ display: 'none' }} />
            <button onClick={() => fileInputRef.current?.click()} className="btn">↑ Upload</button>
            <button onClick={openPairing} className={`btn${desktopPeer.status === 'paired' ? ' btn-paired' : ''}`}>{desktopPeer.status === 'paired' ? '✓ Phone Linked' : '⌘ Pair Phone'}</button>
            <UndoButton count={history.length} onUndo={undo} />
            <button onClick={exportData} className="btn">↗ Export</button>
          </div>
        </header>

        <div className="accounts-layout">
          <aside className="accounts-sidebar">
            <AccountList
              accounts={ledger.accounts}
              transactions={ledger.transactions}
              types={accountTypes.types}
              selectedId={selectedAccount?.id ?? null}
              onSelect={setSelectedAccountId}
              onAddAccount={() => setEditingAccount({ mode: 'new' })}
            />
          </aside>
          <main className="accounts-main">
            {!selectedAccount ? (
              <div className="empty-state">
                <div className="empty-glyph">◈</div>
                <h3 className="empty-title">No accounts yet</h3>
                <p className="empty-desc">Add an account, scan a statement, or import.</p>
                <button onClick={() => setEditingAccount({ mode: 'new' })} className="btn btn-primary">+ Add your first account</button>
              </div>
            ) : (
              <>
                <div className="account-toolbar">
                  <button type="button" className="btn" onClick={() => setEditingAccount({ mode: 'edit', account: selectedAccount })}>✎ Edit account</button>
                </div>
                <Register
                  account={selectedAccount}
                  transactions={ledger.transactions}
                  accounts={ledger.accounts}
                  categories={cats.categories}
                  categoriesById={categoriesById}
                  typesById={accountTypes.typesById}
                  onEditTransaction={(t) => {
                    const pair = resolveTransfer(t, ledger.transactions);
                    if (pair) setEditingTransfer({ mode: 'edit', transfer: pair });
                    else setEditingTxn({ mode: 'edit', accountId: selectedAccount.id, transaction: t });
                  }}
                  onAddTransaction={(accountId) => setEditingTxn({ mode: 'new', accountId })}
                  onTransfer={openTransfer}
                  onSelectAccount={setSelectedAccountId}
                />
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  if (typeof window !== 'undefined' && window.location.pathname === '/pair') {
    return <PhoneCapture />;
  }
  return <Tallio />;
}

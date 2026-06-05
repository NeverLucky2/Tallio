import React, { useState } from 'react';
import ThemeTab from './ThemeTab.jsx';
import BackgroundTab from './BackgroundTab.jsx';
import ImageIconsTab from './ImageIconsTab.jsx';
import UndoButton from './UndoButton.jsx';
import { useIconLibrary } from './iconLibraryContext.js';

const TABS = [
  { id: 'theme', label: 'Theme' },
  { id: 'bg', label: 'Background' },
  { id: 'icons', label: 'Image Icons' },
];

export default function AppearanceScreen({ appearance, categories = [], accounts = [], accountTypes = [], onUndo, undoCount = 0, onBatch, onAddFromPhone, onClose }) {
  const [tab, setTab] = useState('theme');
  const library = useIconLibrary();
  return (
    <div className="container appearance-screen">
      <div className="header">
        <h1 className="title">✦ Appearance</h1>
        <div className="header-actions">
          <UndoButton count={undoCount} onUndo={onUndo} />
          <button type="button" className="btn" onClick={onClose}>Done</button>
        </div>
      </div>

      <div className="appearance-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`appearance-tab${tab === t.id ? ' on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="appearance-body">
        {tab === 'theme' && <ThemeTab appearance={appearance} />}
        {tab === 'bg' && (
          <BackgroundTab
            appearance={appearance}
            images={library.images}
            onUpload={(file) => library.addFromFile(file, {})}
            onRename={(id, name) => library.updateMeta(id, { name })}
            onDelete={(id) => library.remove(id)}
          />
        )}
        {tab === 'icons' && (
          <ImageIconsTab appearance={appearance} categories={categories} accounts={accounts} accountTypes={accountTypes} onBatch={onBatch} onAddFromPhone={onAddFromPhone} />
        )}
      </div>
    </div>
  );
}

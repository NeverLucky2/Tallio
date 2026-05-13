import React, { useState, useEffect } from 'react';

const TABS = [
  { id: 'yoy',       label: 'Year-over-year' },
  { id: 'month',     label: 'Month trend' },
  { id: 'recurring', label: 'Recurring breakdown' },
];

export default function ReportsScreen({ bills, categories, categoriesById, selectedMonth, onClose }) {
  const [activeTab, setActiveTab] = useState('yoy');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="reports-screen">
      <div className="reports-header">
        <h1 className="reports-title">Reports</h1>
        <button onClick={onClose} className="btn-icon" aria-label="Close reports">×</button>
      </div>

      <div className="reports-tabs" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`reports-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="reports-body">
        {activeTab === 'yoy' && <div className="reports-tab-content" data-testid="tab-yoy">YoY content placeholder</div>}
        {activeTab === 'month' && <div className="reports-tab-content" data-testid="tab-month">Month trend content placeholder</div>}
        {activeTab === 'recurring' && <div className="reports-tab-content" data-testid="tab-recurring">Recurring breakdown content placeholder</div>}
      </div>
    </div>
  );
}

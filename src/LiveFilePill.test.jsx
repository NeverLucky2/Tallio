// src/LiveFilePill.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LiveFilePill from './LiveFilePill.jsx';

describe('LiveFilePill', () => {
  it('shows the linked file name', () => {
    render(<LiveFilePill status="linked" fileName="MyBudget.tallio" lastSavedAt={Date.now()} />);
    expect(screen.getByText(/MyBudget\.tallio/)).toBeTruthy();
  });
  it('shows an unlinked hint', () => {
    render(<LiveFilePill status="unlinked" fileName={null} lastSavedAt={null} />);
    expect(screen.getByText(/browser storage/i)).toBeTruthy();
  });
});

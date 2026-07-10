// src/SettingsPanel.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPanel from './SettingsPanel.jsx';

vi.mock('./storagePersist.js', () => ({
  requestPersistentStorage: vi.fn().mockResolvedValue({ supported: true, persisted: true }),
  getStorageEstimate: vi.fn().mockResolvedValue({ supported: true, usage: 5 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
}));

function makeSettings(uiScale = 1.1) {
  return { apiKey: 'sk-ant-test', model: 'claude-haiku-4-5-20251001', uiScale, save: vi.fn() };
}

describe('SettingsPanel storage health', () => {
  afterEach(() => cleanup());

  it('shows a storage-health line with usage', async () => {
    render(<SettingsPanel settings={makeSettings()} onClose={() => {}} />);
    expect(await screen.findByText(/lives only on this device/i)).toBeTruthy();
    expect(screen.getByText(/5\.0 MB of 100\.0 MB/)).toBeTruthy();
  });
});

describe('SettingsPanel display size', () => {
  afterEach(() => cleanup());

  it('shows the current scale as a percentage', () => {
    render(<SettingsPanel settings={makeSettings(1.15)} onClose={() => {}} />);
    expect(screen.getByText('115%')).toBeTruthy();
  });

  it('increase calls save with the next 5% step', async () => {
    const settings = makeSettings(1.1);
    render(<SettingsPanel settings={settings} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /increase display size/i }));
    expect(settings.save).toHaveBeenCalledWith({ uiScale: 1.15 });
  });

  it('decrease calls save with the previous 5% step', async () => {
    const settings = makeSettings(1.1);
    render(<SettingsPanel settings={settings} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /decrease display size/i }));
    expect(settings.save).toHaveBeenCalledWith({ uiScale: 1.05 });
  });

  it('disables decrease at the minimum and increase at the maximum', () => {
    const { rerender } = render(<SettingsPanel settings={makeSettings(0.9)} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /decrease display size/i }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /increase display size/i }).disabled).toBe(false);
    rerender(<SettingsPanel settings={makeSettings(1.5)} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /increase display size/i }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /decrease display size/i }).disabled).toBe(false);
  });
});

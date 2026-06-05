import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PhotoTray from './PhotoTray.jsx';

afterEach(() => cleanup());

const photos = (overrides = []) => ([
  { id: 'a', name: 'a.jpg', previewUrl: 'blob:a', state: 'pending', progress: 0 },
  { id: 'b', name: 'b.jpg', previewUrl: 'blob:b', state: 'pending', progress: 0 },
  ...overrides,
]);

describe('PhotoTray', () => {
  it('renders a thumbnail + name per photo', () => {
    const { container } = render(<PhotoTray photos={photos()} connected onPick={() => {}} onSend={() => {}} onRetry={() => {}} onClear={() => {}} />);
    expect(container.querySelectorAll('.phone-tray-thumb').length).toBe(2);
    expect(screen.getByText('a.jpg')).toBeTruthy();
  });

  it('calls onPick with selected files', () => {
    const onPick = vi.fn();
    const { container } = render(<PhotoTray photos={[]} connected onPick={onPick} onSend={() => {}} onRetry={() => {}} onClear={() => {}} />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0][0].name).toBe('p.jpg');
  });

  it('Send button shows the count and calls onSend', () => {
    const onSend = vi.fn();
    render(<PhotoTray photos={photos()} connected onPick={() => {}} onSend={onSend} onRetry={() => {}} onClear={() => {}} />);
    const btn = screen.getByRole('button', { name: /send 2 photos/i });
    fireEvent.click(btn);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('disables Send when disconnected or already sending', () => {
    const { rerender } = render(<PhotoTray photos={photos()} connected={false} onPick={() => {}} onSend={() => {}} onRetry={() => {}} onClear={() => {}} />);
    expect(screen.getByRole('button', { name: /send 2 photos/i }).hasAttribute('disabled')).toBe(true);
    rerender(<PhotoTray photos={photos()} connected sending onPick={() => {}} onSend={() => {}} onRetry={() => {}} onClear={() => {}} />);
    expect(screen.getByRole('button', { name: /send/i }).hasAttribute('disabled')).toBe(true);
  });

  it('shows Retry failed (N) only when there are failures', () => {
    const onRetry = vi.fn();
    const withFail = [
      { id: 'a', name: 'a', previewUrl: 'blob:a', state: 'done', progress: 1 },
      { id: 'b', name: 'b', previewUrl: 'blob:b', state: 'failed', progress: 0 },
    ];
    const { queryByRole, rerender } = render(<PhotoTray photos={photos()} connected onPick={() => {}} onSend={() => {}} onRetry={onRetry} onClear={() => {}} />);
    expect(queryByRole('button', { name: /retry failed/i })).toBeNull();
    rerender(<PhotoTray photos={withFail} connected onPick={() => {}} onSend={() => {}} onRetry={onRetry} onClear={() => {}} />);
    const retry = screen.getByRole('button', { name: /retry failed \(1\)/i });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

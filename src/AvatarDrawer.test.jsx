import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import AvatarDrawer from './AvatarDrawer.jsx';

const mkSections = (calls = []) => [
  { title: 'Personalize', items: [
    { icon: 'palette', label: 'Appearance', hint: 'Theme, icons, background', chevron: true, onSelect: () => calls.push('appearance') },
    { icon: 'settings', label: 'Settings', hint: 'Scanning, display size, celebrations', chevron: true, onSelect: () => calls.push('settings') },
  ] },
  { title: 'Backups', items: [
    { icon: 'download', label: 'Download a backup', hint: 'One-time copy as a .tallio file', onSelect: () => calls.push('export') },
    { icon: 'restore', label: 'Restore from backup…', hint: 'Replaces everything on this device', danger: true, onSelect: () => calls.push('restore') },
  ] },
];
afterEach(() => cleanup());

describe('AvatarDrawer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<AvatarDrawer open={false} onClose={() => {}} sections={mkSections()} />);
    expect(container.querySelector('.avatar-drawer-panel')).toBeNull();
  });

  it('renders sections, rows + dialog role when open', () => {
    const { container, getByText } = render(
      <AvatarDrawer open={true} onClose={() => {}} sections={mkSections()} reducedMotion={true} />,
    );
    const panel = container.querySelector('.avatar-drawer-panel');
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('Account menu');
    expect(getByText('Appearance')).toBeTruthy();
    expect(getByText('Settings')).toBeTruthy();
    expect(getByText('Download a backup')).toBeTruthy();
    expect(panel.querySelector('.avatar-drawer-title').textContent).toBe('Tallio');
    expect(getByText('Private to this device')).toBeTruthy();
    expect(getByText('Personalize')).toBeTruthy();
    expect(getByText('Backups')).toBeTruthy();
    expect(getByText('Theme, icons, background')).toBeTruthy();
    expect(panel.querySelectorAll('.avatar-drawer-item svg.ui-icon').length).toBeGreaterThanOrEqual(4);
  });

  it('selecting an item calls its handler then onClose', () => {
    const calls = [];
    let closed = 0;
    const { getByText } = render(<AvatarDrawer open={true} onClose={() => { closed += 1; }} sections={mkSections(calls)} reducedMotion={true} />);
    fireEvent.click(getByText('Settings'));
    expect(calls).toEqual(['settings']);
    expect(closed).toBe(1);
  });

  it('scrim click closes', () => {
    let closed = 0;
    const { container } = render(<AvatarDrawer open={true} onClose={() => { closed += 1; }} sections={mkSections()} reducedMotion={true} />);
    fireEvent.click(container.querySelector('.avatar-drawer-scrim'));
    expect(closed).toBe(1);
  });

  it('Escape closes', () => {
    let closed = 0;
    render(<AvatarDrawer open={true} onClose={() => { closed += 1; }} sections={mkSections()} reducedMotion={true} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed).toBe(1);
  });

  it('renders a provided avatar node in the head', () => {
    const { getByTestId } = render(
      <AvatarDrawer open={true} onClose={() => {}} sections={mkSections()} avatar={<span data-testid="av">A</span>} reducedMotion={true} />,
    );
    expect(getByTestId('av')).toBeTruthy();
  });

  it('adds no-anim under reduced motion', () => {
    const { container } = render(<AvatarDrawer open={true} onClose={() => {}} sections={mkSections()} reducedMotion={true} />);
    expect(container.querySelector('.avatar-drawer-panel').className).toContain('no-anim');
  });

  it('marks danger rows', () => {
    const { getByText } = render(<AvatarDrawer open onClose={() => {}} sections={mkSections()} reducedMotion />);
    expect(getByText('Restore from backup…').closest('button').className).toContain('danger');
    expect(getByText('Download a backup').closest('button').className).not.toContain('danger');
  });

  it('renders the file card under a "Budget file" label after the first section', () => {
    const { getByText, getByTestId, container } = render(
      <AvatarDrawer open onClose={() => {}} sections={mkSections()} fileCard={<div data-testid="fc" />} reducedMotion />,
    );
    expect(getByText('Budget file')).toBeTruthy();
    const titles = [...container.querySelectorAll('.avatar-drawer-section-title')].map((n) => n.textContent);
    expect(titles).toEqual(['Personalize', 'Budget file', 'Backups']);
    expect(getByTestId('fc')).toBeTruthy();
  });

  it('omits the "Budget file" label when there is no file card', () => {
    const { queryByText } = render(<AvatarDrawer open onClose={() => {}} sections={mkSections()} reducedMotion />);
    expect(queryByText('Budget file')).toBeNull();
  });

  it('shows the footer note when given, and no note element when empty', () => {
    const { getByText, container, rerender } = render(
      <AvatarDrawer open onClose={() => {}} sections={mkSections()} footerNote="0.4 MB stored" reducedMotion />,
    );
    expect(getByText('0.4 MB stored')).toBeTruthy();
    rerender(<AvatarDrawer open onClose={() => {}} sections={mkSections()} reducedMotion />);
    expect(container.querySelector('.avatar-drawer-foot-note')).toBeNull();
  });

  it('moves focus to the close button on open and restores it on close', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { getByLabelText, rerender } = render(<AvatarDrawer open onClose={() => {}} sections={mkSections()} reducedMotion />);
    expect(document.activeElement).toBe(getByLabelText('Close menu'));
    rerender(<AvatarDrawer open={false} onClose={() => {}} sections={mkSections()} reducedMotion />);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('traps Tab within the panel', () => {
    const { getByLabelText, getByText } = render(<AvatarDrawer open onClose={() => {}} sections={mkSections()} reducedMotion />);
    const first = getByLabelText('Close menu');
    const last = getByText('Restore from backup…').closest('button');
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('animated close: onClose fires once, after the slide-out ends', () => {
    let closed = 0;
    const { container, getByLabelText } = render(<AvatarDrawer open onClose={() => { closed += 1; }} sections={mkSections()} reducedMotion={false} />);
    fireEvent.click(getByLabelText('Close menu'));
    const panel = container.querySelector('.avatar-drawer-panel');
    expect(panel.className).toContain('closing');
    expect(closed).toBe(0);
    fireEvent.animationEnd(panel);
    fireEvent.animationEnd(panel);
    expect(closed).toBe(1);
  });

  it('animated close falls back to a 220ms timer', () => {
    vi.useFakeTimers();
    try {
      let closed = 0;
      const { container } = render(<AvatarDrawer open onClose={() => { closed += 1; }} sections={mkSections()} reducedMotion={false} />);
      fireEvent.click(container.querySelector('.avatar-drawer-scrim'));
      vi.advanceTimersByTime(219);
      expect(closed).toBe(0);
      vi.advanceTimersByTime(1);
      expect(closed).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('double-clicking a row runs the action once and closes once', () => {
    const calls = []; let closed = 0;
    const { getByText, container } = render(<AvatarDrawer open onClose={() => { closed += 1; }} sections={mkSections(calls)} reducedMotion={false} />);
    fireEvent.click(getByText('Settings'));
    fireEvent.click(getByText('Settings'));
    fireEvent.animationEnd(container.querySelector('.avatar-drawer-panel'));
    expect(calls).toEqual(['settings']);
    expect(closed).toBe(1);
  });

  it('reopening clears the closing state', () => {
    const { container, getByLabelText, rerender } = render(<AvatarDrawer open onClose={() => {}} sections={mkSections()} reducedMotion={false} />);
    fireEvent.click(getByLabelText('Close menu'));
    rerender(<AvatarDrawer open={false} onClose={() => {}} sections={mkSections()} reducedMotion={false} />);
    rerender(<AvatarDrawer open onClose={() => {}} sections={mkSections()} reducedMotion={false} />);
    expect(container.querySelector('.avatar-drawer-panel').className).not.toContain('closing');
  });

  it('does not pull focus back to the trigger when a row opened something', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { getByText, rerender } = render(<AvatarDrawer open onClose={() => {}} sections={mkSections()} reducedMotion />);
    fireEvent.click(getByText('Settings'));
    rerender(<AvatarDrawer open={false} onClose={() => {}} sections={mkSections()} reducedMotion />);
    expect(document.activeElement).not.toBe(trigger);
    trigger.remove();
  });

  it('file card actions go through the guarded close: once each, slide-out first', () => {
    const calls = []; let closed = 0;
    const card = (act) => <button type="button" onClick={act(() => calls.push('unlink'))}>Unlink</button>;
    const { getByText, container } = render(
      <AvatarDrawer open onClose={() => { closed += 1; }} sections={mkSections(calls)} fileCard={card} reducedMotion={false} />,
    );
    fireEvent.click(getByText('Unlink'));
    fireEvent.click(getByText('Unlink'));
    fireEvent.click(getByText('Settings'));
    expect(calls).toEqual(['unlink']);
    expect(closed).toBe(0);
    fireEvent.animationEnd(container.querySelector('.avatar-drawer-panel'));
    expect(closed).toBe(1);
  });

  it('a file card action is ignored once a close is under way', () => {
    const calls = [];
    const card = (act) => <button type="button" onClick={act(() => calls.push('unlink'))}>Unlink</button>;
    const { getByText, getByLabelText } = render(
      <AvatarDrawer open onClose={() => {}} sections={mkSections()} fileCard={card} reducedMotion={false} />,
    );
    fireEvent.click(getByLabelText('Close menu'));
    fireEvent.click(getByText('Unlink'));
    expect(calls).toEqual([]);
  });
});

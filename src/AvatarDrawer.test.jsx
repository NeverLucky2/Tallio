import { describe, it, expect, afterEach } from 'vitest';
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
});

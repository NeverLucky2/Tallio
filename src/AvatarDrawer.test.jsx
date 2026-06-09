import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import AvatarDrawer from './AvatarDrawer.jsx';

const mkItems = (calls) => [
  { icon: '🎨', label: 'Appearance', onSelect: () => calls.push('appearance') },
  { icon: '⚙', label: 'Settings', onSelect: () => calls.push('settings') },
  { icon: '↗', label: 'Export', onSelect: () => calls.push('export') },
];
afterEach(() => cleanup());

describe('AvatarDrawer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<AvatarDrawer open={false} onClose={() => {}} items={mkItems([])} />);
    expect(container.querySelector('.avatar-drawer-panel')).toBeNull();
  });

  it('renders items + dialog role when open', () => {
    const { container, getByText } = render(
      <AvatarDrawer open={true} onClose={() => {}} items={mkItems([])} version="v1.2.3" reducedMotion={false} />,
    );
    const panel = container.querySelector('.avatar-drawer-panel');
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('Account menu');
    expect(getByText('Appearance')).toBeTruthy();
    expect(getByText('Settings')).toBeTruthy();
    expect(getByText('Export')).toBeTruthy();
    expect(getByText('Tallio v1.2.3')).toBeTruthy();
  });

  it('selecting an item calls its handler then onClose', () => {
    const calls = [];
    let closed = 0;
    const { getByText } = render(<AvatarDrawer open={true} onClose={() => { closed += 1; }} items={mkItems(calls)} reducedMotion={false} />);
    fireEvent.click(getByText('Settings'));
    expect(calls).toEqual(['settings']);
    expect(closed).toBe(1);
  });

  it('scrim click closes', () => {
    let closed = 0;
    const { container } = render(<AvatarDrawer open={true} onClose={() => { closed += 1; }} items={mkItems([])} reducedMotion={false} />);
    fireEvent.click(container.querySelector('.avatar-drawer-scrim'));
    expect(closed).toBe(1);
  });

  it('Escape closes', () => {
    let closed = 0;
    render(<AvatarDrawer open={true} onClose={() => { closed += 1; }} items={mkItems([])} reducedMotion={false} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed).toBe(1);
  });

  it('renders a provided avatar node in the head', () => {
    const { getByTestId } = render(
      <AvatarDrawer open={true} onClose={() => {}} items={mkItems([])} avatar={<span data-testid="av">A</span>} reducedMotion={false} />,
    );
    expect(getByTestId('av')).toBeTruthy();
  });

  it('adds no-anim under reduced motion', () => {
    const { container } = render(<AvatarDrawer open={true} onClose={() => {}} items={mkItems([])} reducedMotion={true} />);
    expect(container.querySelector('.avatar-drawer-panel').className).toContain('no-anim');
  });
});

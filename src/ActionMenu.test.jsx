import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import ActionMenu from './ActionMenu.jsx';

afterEach(() => cleanup());

const items = (onRename, onDelete) => [
  { label: 'Rename', onSelect: onRename },
  { label: 'Delete', onSelect: onDelete, danger: true },
];

describe('ActionMenu', () => {
  it('opens on trigger and lists items', () => {
    const { getByLabelText, queryByText, getByText } = render(<ActionMenu label="Options for Mom" items={items(() => {}, () => {})} />);
    expect(queryByText('Rename')).toBeNull();
    fireEvent.click(getByLabelText('Options for Mom'));
    expect(getByText('Rename')).toBeTruthy();
    expect(getByText('Delete')).toBeTruthy();
  });

  it('calls the item handler and closes', () => {
    const onRename = vi.fn();
    const { getByLabelText, getByText, queryByText } = render(<ActionMenu label="Options" items={items(onRename, () => {})} />);
    fireEvent.click(getByLabelText('Options'));
    fireEvent.click(getByText('Rename'));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(queryByText('Rename')).toBeNull();
  });

  it('closes on Escape', () => {
    const { getByLabelText, getByText, queryByText } = render(<ActionMenu label="Options" items={items(() => {}, () => {})} />);
    fireEvent.click(getByLabelText('Options'));
    fireEvent.keyDown(getByText('Rename'), { key: 'Escape' });
    expect(queryByText('Rename')).toBeNull();
  });
});

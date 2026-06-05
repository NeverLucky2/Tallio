import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import FramingEditor from './FramingEditor.jsx';

beforeEach(() => { vi.stubGlobal('URL', { createObjectURL: () => 'blob:1', revokeObjectURL: () => {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('FramingEditor', () => {
  it('renders the focal slider and emits a zoom patch', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <FramingEditor blob={new Blob(['x'])} framing={{ posX: 50, posY: 50, zoom: 1 }} onChange={onChange} aspect="square" />
    );
    expect(getByLabelText('Focal point — drag or use arrow keys')).toBeTruthy();
    fireEvent.change(getByLabelText('Zoom'), { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith({ zoom: 2 });
  });

  it('emits a focal patch on arrow keys', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <FramingEditor blob={new Blob(['x'])} framing={{ posX: 50, posY: 50, zoom: 1 }} onChange={onChange} />
    );
    fireEvent.keyDown(getByLabelText('Focal point — drag or use arrow keys'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith({ posX: 52 });
  });
});

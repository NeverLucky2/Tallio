import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import ImageCropModal from './ImageCropModal.jsx';

beforeEach(() => { vi.stubGlobal('URL', { createObjectURL: () => 'blob:1', revokeObjectURL: () => {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ImageCropModal', () => {
  it('renders the square framing editor and confirms with the framing', () => {
    const onDone = vi.fn(); const onCancel = vi.fn();
    const { getByLabelText, getByText } = render(
      <ImageCropModal blob={new Blob(['x'])} onDone={onDone} onCancel={onCancel} />
    );
    expect(getByLabelText('Focal point — drag or use arrow keys')).toBeTruthy();
    fireEvent.change(getByLabelText('Zoom'), { target: { value: '2' } });
    fireEvent.click(getByText('Done'));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ zoom: 2 }));
  });

  it('cancels on the Cancel button and on Escape', () => {
    const onCancel = vi.fn();
    const { getByText, getByLabelText } = render(
      <ImageCropModal blob={new Blob(['x'])} onDone={() => {}} onCancel={onCancel} />
    );
    fireEvent.click(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(getByLabelText('Crop image'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

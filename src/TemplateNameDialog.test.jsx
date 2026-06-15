import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplateNameDialog from './TemplateNameDialog.jsx';

afterEach(() => cleanup());

describe('TemplateNameDialog', () => {
  it('prefills the default name and saves the trimmed value', async () => {
    const onSave = vi.fn();
    render(<TemplateNameDialog defaultName="Paycheck" onSave={onSave} onCancel={() => {}} />);
    const input = screen.getByRole('textbox', { name: /template name/i });
    expect(input.value).toBe('Paycheck');
    await userEvent.clear(input);
    await userEvent.type(input, '  Rent  ');
    await userEvent.click(screen.getByRole('button', { name: /save template/i }));
    expect(onSave).toHaveBeenCalledWith('Rent');
  });
  it('disables Save when the name is empty', async () => {
    render(<TemplateNameDialog defaultName="" onSave={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('button', { name: /save template/i }).disabled).toBe(true);
  });
});

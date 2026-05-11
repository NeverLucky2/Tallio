import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('testing-library setup', () => {
  it('renders a React component into jsdom', () => {
    render(<div>hello jsdom</div>);
    expect(screen.getByText('hello jsdom')).toBeTruthy();
  });
});

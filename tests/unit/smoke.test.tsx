import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { App } from '@/app/App';

afterEach(cleanup);

test('App renders the Vlo name', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Vlo' })).toBeTruthy();
});

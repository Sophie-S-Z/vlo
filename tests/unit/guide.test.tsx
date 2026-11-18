import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Guide } from '@/features/onboarding/Guide';

/* The getting-started guide: its steps and Close work in a browser that refuses storage too. */

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

test('Next and Close work when the browser refuses storage', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  const { container } = render(<Guide />);
  expect(screen.getByText(/Step 1 of/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText(/Step 2 of/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close the guide' }));
  expect(container.textContent).toBe('');
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Ring } from '@/features/sequences/Ring';

/* The ring preview's keys and its still list (spec 8.3, plan Task C6). */

afterEach(cleanup);

test('the arrow keys, Home and End choose the poem in front, and the slider value follows', () => {
  render(<Ring name="Chapbook" titles={['Low Tide', 'Salt', 'Gulls']} motion />);
  const ring = screen.getByRole('slider', { name: 'Chapbook, 3 poems' });
  const front = () => screen.getByTestId('ring-front').textContent;
  fireEvent.keyDown(ring, { key: 'ArrowRight' });
  expect(front()).toBe('2 of 3: Salt');
  expect(ring.getAttribute('aria-valuenow')).toBe('2');
  fireEvent.keyDown(ring, { key: 'End' });
  expect(front()).toBe('3 of 3: Gulls');
  fireEvent.keyDown(ring, { key: 'ArrowDown' });
  expect(front()).toBe('1 of 3: Low Tide');
  fireEvent.keyDown(ring, { key: 'ArrowUp' });
  expect(front()).toBe('3 of 3: Gulls');
  fireEvent.keyDown(ring, { key: 'Home' });
  expect(front()).toBe('1 of 3: Low Tide');
});

test('a changed order puts its first poem in front', () => {
  const { rerender } = render(<Ring name="Chapbook" titles={['Low Tide', 'Salt', 'Gulls']} motion />);
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
  rerender(<Ring name="Contest" titles={['Gulls', 'Salt']} motion />);
  expect(screen.getByTestId('ring-front').textContent).toBe('1 of 2: Gulls');
});

test('with motion off, the ring is a still numbered list', () => {
  render(<Ring name="Chapbook" titles={['Low Tide', 'Salt']} motion={false} />);
  expect(screen.queryByRole('slider')).toBeNull();
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Low Tide', 'Salt']);
});

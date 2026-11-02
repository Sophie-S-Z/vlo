import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PreferencesProvider } from '@/app/PreferencesProvider';
import { PREFERENCES_KEY } from '@/app/preferences';
import { HoldButton } from '@/features/onboarding/HoldButton';

function stubMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  stubMotion(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderButton() {
  const onConfirm = vi.fn();
  render(
    <PreferencesProvider>
      <HoldButton
        label="Hold to open your first page"
        plainLabel="Open your first page"
        onConfirm={onConfirm}
      />
    </PreferencesProvider>,
  );
  return onConfirm;
}

test('a short press does not confirm', () => {
  const onConfirm = renderButton();
  const button = screen.getByRole('button', { name: 'Hold to open your first page' });
  fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.pointerUp(button, { pointerId: 1 });
  fireEvent.click(button, { detail: 1 });
  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(onConfirm).not.toHaveBeenCalled();
});

test('a 1200 ms hold confirms once', () => {
  const onConfirm = renderButton();
  const button = screen.getByRole('button', { name: 'Hold to open your first page' });
  fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
  act(() => {
    vi.advanceTimersByTime(1199);
  });
  expect(onConfirm).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(onConfirm).toHaveBeenCalledTimes(1);
  fireEvent.pointerUp(button, { pointerId: 1 });
  fireEvent.click(button, { detail: 1 });
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('leaving the button cancels the hold', () => {
  const onConfirm = renderButton();
  const button = screen.getByRole('button', { name: 'Hold to open your first page' });
  fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
  fireEvent.pointerLeave(button, { pointerId: 1 });
  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(onConfirm).not.toHaveBeenCalled();
});

test.each([' ', 'Enter'])('holding the %j key for 1200 ms confirms once', (key) => {
  const onConfirm = renderButton();
  const button = screen.getByRole('button', { name: 'Hold to open your first page' });
  fireEvent.keyDown(button, { key });
  fireEvent.keyDown(button, { key, repeat: true });
  act(() => {
    vi.advanceTimersByTime(1200);
  });
  fireEvent.keyUp(button, { key });
  fireEvent.click(button, { detail: 0 });
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('a key released early does not confirm', () => {
  const onConfirm = renderButton();
  const button = screen.getByRole('button', { name: 'Hold to open your first page' });
  fireEvent.keyDown(button, { key: ' ' });
  act(() => {
    vi.advanceTimersByTime(300);
  });
  fireEvent.keyUp(button, { key: ' ' });
  fireEvent.click(button, { detail: 0 });
  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(onConfirm).not.toHaveBeenCalled();
});

test('a click with no press first, as a screen reader sends, confirms at once', () => {
  const onConfirm = renderButton();
  fireEvent.click(screen.getByRole('button', { name: 'Hold to open your first page' }), { detail: 0 });
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('with reduced motion it is a plain button that confirms on click', () => {
  stubMotion(true);
  const onConfirm = renderButton();
  fireEvent.click(screen.getByRole('button', { name: 'Open your first page' }), { detail: 1 });
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('with Calm mode it is a plain button that confirms on click', () => {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ theme: 'system', calm: true }));
  const onConfirm = renderButton();
  fireEvent.click(screen.getByRole('button', { name: 'Open your first page' }), { detail: 1 });
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('after an early release, a later bare click still confirms', () => {
  const onConfirm = renderButton();
  const button = screen.getByRole('button', { name: 'Hold to open your first page' });
  fireEvent.keyDown(button, { key: ' ' });
  fireEvent.keyUp(button, { key: ' ' });
  act(() => {
    vi.advanceTimersByTime(10);
  });
  fireEvent.click(button, { detail: 0 });
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('when the action reports failure, the button works again', async () => {
  const onConfirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  render(
    <PreferencesProvider>
      <HoldButton label="Hold to open your first page" onConfirm={onConfirm} />
    </PreferencesProvider>,
  );
  const button = screen.getByRole('button', { name: 'Hold to open your first page' });
  fireEvent.click(button, { detail: 0 });
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.click(button, { detail: 0 });
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.click(button, { detail: 0 });
  expect(onConfirm).toHaveBeenCalledTimes(2);
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { UpdatePrompt } from '@/app/UpdatePrompt';
import { UpdateContext, type UpdateState } from '@/app/UpdateProvider';

afterEach(cleanup);

const state = (patch: Partial<UpdateState>): UpdateState => ({
  needRefresh: false,
  updatedElsewhere: false,
  applyUpdate: () => undefined,
  ...patch,
});

test('the live region is in the page before the notice, and the notice appears inside it', () => {
  const { rerender } = render(
    <UpdateContext.Provider value={state({})}>
      <UpdatePrompt />
    </UpdateContext.Provider>,
  );
  const region = screen.getByRole('status');
  expect(region.textContent).toBe('');
  rerender(
    <UpdateContext.Provider value={state({ needRefresh: true })}>
      <UpdatePrompt />
    </UpdateContext.Provider>,
  );
  expect(screen.getByRole('status')).toBe(region);
  expect(region.textContent).toContain('A new version of Vlo is ready.');
});

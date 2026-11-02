import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { RouteError } from '@/app/RouteError';
import { UpdateContext, type UpdateState } from '@/app/UpdateProvider';

afterEach(cleanup);

function renderError(update: UpdateState) {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const Boom = () => {
    throw new Error('boom');
  };
  const router = createMemoryRouter([{ path: '/', element: <Boom />, errorElement: <RouteError /> }]);
  render(
    <UpdateContext.Provider value={update}>
      <RouterProvider router={router} />
    </UpdateContext.Provider>,
  );
}

test('the error screen offers the waiting update, because a plain reload keeps the broken build', async () => {
  const applyUpdate = vi.fn();
  renderError({ needRefresh: true, updatedElsewhere: false, applyUpdate });
  fireEvent.click(await screen.findByRole('button', { name: 'Reload to update' }));
  expect(applyUpdate).toHaveBeenCalledOnce();
});

test('the error screen offers a plain reload when no update waits', async () => {
  renderError({ needRefresh: false, updatedElsewhere: false, applyUpdate: vi.fn() });
  expect(await screen.findByRole('button', { name: 'Reload Vlo' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Reload to update' })).toBeNull();
});

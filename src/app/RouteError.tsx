import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '@/ui/button';
import { ErrorScreen, reloadPage } from './ErrorScreen';
import { useDocumentTitle } from './useDocumentTitle';
import { useUpdate } from './UpdateProvider';

export function RouteError() {
  useDocumentTitle('Something went wrong');
  const error = useRouteError();
  const { needRefresh, applyUpdate } = useUpdate();
  const detail = isRouteErrorResponse(error)
    ? `${String(error.status)} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : null;

  return (
    <ErrorScreen
      detail={detail}
      actions={
        // A plain reload keeps the cached build, which may be the one that fails. Offer the new version first.
        needRefresh ? (
          <Button onClick={applyUpdate}>Reload to update</Button>
        ) : (
          <Button onClick={reloadPage}>Reload Vlo</Button>
        )
      }
    />
  );
}

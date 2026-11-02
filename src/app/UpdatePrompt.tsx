import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/ui/button';

/**
 * Registers the service worker. A new version never reloads the page by itself,
 * because a reload while the writer types would break their flow. The writer picks when.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div role="status" className="flex items-center gap-3 text-sm">
      <span>A new version of Vlo is ready.</span>
      <Button
        variant="outline"
        onClick={() => {
          void updateServiceWorker(true);
        }}
      >
        Reload to update
      </Button>
    </div>
  );
}

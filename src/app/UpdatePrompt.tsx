import { Button } from '@/ui/button';
import { useUpdate } from './UpdateProvider';

/**
 * A quiet notice in the footer. The writer picks when to reload. The live region is always in the page,
 * so screen readers hear the notice when it appears.
 */
export function UpdatePrompt() {
  const { needRefresh, updatedElsewhere, applyUpdate } = useUpdate();

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 text-sm">
      {updatedElsewhere ? (
        <>
          <span>Vlo was updated in another tab. Reload when you are ready.</span>
          <Button variant="outline" onClick={applyUpdate}>
            Reload
          </Button>
        </>
      ) : needRefresh ? (
        <>
          <span>A new version of Vlo is ready.</span>
          <Button variant="outline" onClick={applyUpdate}>
            Reload to update
          </Button>
        </>
      ) : null}
    </div>
  );
}

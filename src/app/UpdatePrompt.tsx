import { Button } from '@/ui/button';
import { useUpdate } from './UpdateProvider';

/** A quiet notice in the footer. The writer picks when to reload. */
export function UpdatePrompt() {
  const { needRefresh, updatedElsewhere, applyUpdate } = useUpdate();

  if (!needRefresh && !updatedElsewhere) return null;

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 text-sm">
      {updatedElsewhere ? (
        <>
          <span>Vlo was updated in another tab. Reload when you are ready.</span>
          <Button variant="outline" onClick={applyUpdate}>
            Reload
          </Button>
        </>
      ) : (
        <>
          <span>A new version of Vlo is ready.</span>
          <Button variant="outline" onClick={applyUpdate}>
            Reload to update
          </Button>
        </>
      )}
    </div>
  );
}

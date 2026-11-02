import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export interface UpdateState {
  /** A new version is installed and waits for the writer. */
  needRefresh: boolean;
  /** The writer updated Vlo in another tab, so this tab runs under the new service worker. */
  updatedElsewhere: boolean;
  /** Activates the waiting version and reloads this tab only. */
  applyUpdate: () => void;
}

const idle: UpdateState = { needRefresh: false, updatedElsewhere: false, applyUpdate: () => undefined };

export const UpdateContext = createContext<UpdateState>(idle);

/**
 * Registers the service worker once, above the router, so the error screen can also offer an update.
 * A new version never reloads a tab by itself: only the tab where the writer clicks reloads.
 */
export function UpdateProvider({ children }: { children: ReactNode }) {
  const requestedHere = useRef(false);
  const [updatedElsewhere, setUpdatedElsewhere] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedReload() {
      if (requestedHere.current) window.location.reload();
      else setUpdatedElsewhere(true);
    },
  });

  const value = useMemo<UpdateState>(
    () => ({
      needRefresh,
      updatedElsewhere,
      applyUpdate: () => {
        requestedHere.current = true;
        if (updatedElsewhere) window.location.reload();
        else void updateServiceWorker(true);
      },
    }),
    [needRefresh, updatedElsewhere, updateServiceWorker],
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useUpdate(): UpdateState {
  return useContext(UpdateContext);
}

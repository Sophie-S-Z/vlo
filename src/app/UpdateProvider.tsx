import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export interface UpdateState {
  /** A new version is installed and waits for the writer. */
  needRefresh: boolean;
  /** The writer updated Vlo in another tab, so this tab runs under the new service worker. */
  updatedElsewhere: boolean;
  /** Activates the waiting version and reloads this tab only. */
  applyUpdate: () => void;
}

export const UPDATE_CHECK_MS = 60 * 60 * 1000;

/** Asks for a new version once an hour while online. A tab left open for days still finds updates. */
export function checkHourly(registration: { update: () => Promise<unknown> }): () => void {
  const timer = setInterval(() => {
    if (navigator.onLine) void registration.update().catch(() => undefined);
  }, UPDATE_CHECK_MS);
  return () => {
    clearInterval(timer);
  };
}

const idle: UpdateState = { needRefresh: false, updatedElsewhere: false, applyUpdate: () => undefined };

export const UpdateContext = createContext<UpdateState>(idle);

/**
 * Registers the service worker once, above the router, so the error screen can also offer an update.
 * A new version never reloads a tab by itself: only the tab where the writer clicks reloads.
 */
export function UpdateProvider({ children }: { children: ReactNode }) {
  const requestedHere = useRef(false);
  const stopChecks = useRef<(() => void) | null>(null);
  const [updatedElsewhere, setUpdatedElsewhere] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      stopChecks.current?.();
      stopChecks.current = checkHourly(registration);
    },
    onNeedReload() {
      if (requestedHere.current) window.location.reload();
      else setUpdatedElsewhere(true);
    },
  });

  useEffect(
    () => () => {
      stopChecks.current?.();
      stopChecks.current = null;
    },
    [],
  );

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

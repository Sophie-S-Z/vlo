import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export interface UpdateState {
  /** A new version is installed and waits. */
  needRefresh: boolean;
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

const idle: UpdateState = { needRefresh: false, applyUpdate: () => undefined };

export const UpdateContext = createContext<UpdateState>(idle);

/**
 * Registers the service worker once, above the router, so the error screen can also offer an update.
 * Each visit asks for a new version. A version that is ready before the writer types or clicks loads at
 * once, so a writer who opens Vlo after a release gets it with no notice. A version found later waits
 * for the next visit, so a reload never cuts into work. Another tab never reloads this one after the
 * writer starts to work in it.
 */
export function UpdateProvider({ children }: { children: ReactNode }) {
  const requestedHere = useRef(false);
  const stopChecks = useRef<(() => void) | null>(null);
  // True until the writer first types or clicks in this tab.
  const untouched = useRef(true);
  // Another tab activated the new version, so a plain reload loads it.
  const activeElsewhere = useRef(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      if (navigator.onLine) void registration.update().catch(() => undefined);
      stopChecks.current?.();
      stopChecks.current = checkHourly(registration);
    },
    onNeedReload() {
      if (requestedHere.current || untouched.current) window.location.reload();
      else activeElsewhere.current = true;
    },
  });

  useEffect(() => {
    const touch = () => {
      untouched.current = false;
    };
    window.addEventListener('pointerdown', touch, { capture: true, once: true });
    window.addEventListener('keydown', touch, { capture: true, once: true });
    return () => {
      window.removeEventListener('pointerdown', touch, { capture: true });
      window.removeEventListener('keydown', touch, { capture: true });
      stopChecks.current?.();
      stopChecks.current = null;
    };
  }, []);

  useEffect(() => {
    if (!needRefresh || !untouched.current) return;
    requestedHere.current = true;
    void updateServiceWorker(true);
  }, [needRefresh, updateServiceWorker]);

  const value = useMemo<UpdateState>(
    () => ({
      needRefresh,
      applyUpdate: () => {
        requestedHere.current = true;
        if (activeElsewhere.current) window.location.reload();
        else void updateServiceWorker(true);
      },
    }),
    [needRefresh, updateServiceWorker],
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useUpdate(): UpdateState {
  return useContext(UpdateContext);
}

// Controllable window.matchMedia for tests.
type Listener = (event: MediaQueryListEvent) => void;

export function mockMatchMedia(initial: Record<string, boolean> = {}) {
  const state = { ...initial };
  const listeners = new Map<string, Set<Listener>>();

  window.matchMedia = (query: string) => {
    const set = listeners.get(query) ?? new Set<Listener>();
    listeners.set(query, set);
    return {
      get matches() {
        return state[query] ?? false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, fn: Listener) => set.add(fn),
      removeEventListener: (_type: string, fn: Listener) => set.delete(fn),
      addListener: (fn: Listener) => set.add(fn),
      removeListener: (fn: Listener) => set.delete(fn),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  };

  return {
    set(query: string, matches: boolean) {
      state[query] = matches;
      for (const fn of listeners.get(query) ?? []) {
        fn({ matches, media: query } as MediaQueryListEvent);
      }
    },
  };
}

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

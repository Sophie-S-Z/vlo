// Test double for the vite-plugin-pwa virtual module. jsdom has no service workers.
export function useRegisterSW() {
  const noop = () => undefined;
  return {
    needRefresh: [false, noop] as const,
    offlineReady: [false, noop] as const,
    updateServiceWorker: () => Promise.resolve(),
  };
}

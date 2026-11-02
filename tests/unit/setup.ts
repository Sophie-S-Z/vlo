import 'fake-indexeddb/auto';

// jsdom has no layout, so it has no ResizeObserver. Radix measures some parts with it.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe = () => undefined;
    unobserve = () => undefined;
    disconnect = () => undefined;
  };
}

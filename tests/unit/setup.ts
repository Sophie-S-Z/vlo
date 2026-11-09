import 'fake-indexeddb/auto';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';

// jsdom has no layout, so it has no ResizeObserver. Radix measures some parts with it.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe = () => undefined;
    unobserve = () => undefined;
    disconnect = () => undefined;
  };
}

// A browser's IndexedDB keeps a Blob as a Blob. fake-indexeddb copies values with Node's structured
// clone, which keeps Node's Blob and File but turns jsdom's into plain objects, so the tests use Node's.
globalThis.Blob = NodeBlob as unknown as typeof Blob;
globalThis.File = NodeFile as unknown as typeof File;

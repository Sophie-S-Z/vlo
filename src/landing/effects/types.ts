/** Each effect attaches to the landing root and returns a function that undoes all of its work. */
export type Teardown = () => void;
export type Effect = (root: HTMLElement) => Teardown | void;

/** Adds an event listener and returns the matching remove call. */
export function listen<K extends keyof HTMLElementEventMap>(
  target: HTMLElement | Window | Document,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): Teardown {
  const fn = handler as EventListener;
  target.addEventListener(type, fn, options);
  return () => target.removeEventListener(type, fn, options);
}

export function finePointer(): boolean {
  return typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches;
}

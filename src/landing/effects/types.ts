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

/**
 * True in gentle mode: the system asks for reduced motion and Calm is off (ADR 0011). Effects
 * that skew, tilt, turn or trail the page stay off. The landing restarts effects on a change.
 */
export function gentleMotion(): boolean {
  return document.documentElement.dataset.motion === "gentle";
}

export function finePointer(): boolean {
  return typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches;
}

/**
 * Keeps an element's current child nodes (React owns them) and returns a function that puts
 * the same nodes back. Effects that rewrite text call it in their teardown.
 */
export function keepChildren(element: Element): Teardown {
  const nodes = Array.from(element.childNodes);
  return () => element.replaceChildren(...nodes);
}

/** Sets the text of an element's first text node, so React keeps its own node. */
export function setText(element: Element, text: string): void {
  const node = element.firstChild;
  if (node?.nodeType === Node.TEXT_NODE) node.nodeValue = text;
  else element.textContent = text;
}

import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, type PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type DecorationAttrs, type EditorView } from '@tiptap/pm/view';
import { blockText } from './blockScan';

/*
 * A check that a worker runs on each paragraph near the screen, after a pause in typing (Phase 19, Tasks D1
 * and D5). A result belongs to the paragraph node that the worker read, so an edit during the check never
 * moves a mark to the wrong words: a changed paragraph is a new node, and it gets a new check at the next
 * pause. The marks are decorations, so they never reach the document, an export or a share.
 */

/** A scroll checks the new blocks after this pause. */
const SCROLL_PAUSE_MS = 300;
/** The screens above and below the window that a check reads. */
const SCREENS = 2;

/** A mark from the worker, with its place in the block's text. */
export interface BlockMark {
  from: number;
  to: number;
}

export interface BlockCheckState {
  on: boolean;
  decorations: DecorationSet;
}

export interface BlockCheckOptions<T extends BlockMark> {
  key: PluginKey<BlockCheckState>;
  isOn: () => boolean;
  /** The marks show after this pause in typing. */
  pauseMs: number;
  /** Checks the text of each block, from `blockText`, in the worker. */
  run: (blocks: string[]) => Promise<T[][]>;
  /**
   * Makes the function that draws each mark, at each redraw: its attributes and its spec, or null to leave
   * it out. `words` is the marked text.
   */
  drawer: () => (mark: T, words: string) => { attrs: DecorationAttrs; spec?: object } | null;
  /** The stores outside the editor whose changes draw the marks again. */
  sources?: readonly ((listener: () => void) => () => void)[];
  /** Called before each request to the worker, and after it with its outcome. */
  onRun?: () => void;
  onDone?: (ok: boolean) => void;
}

/** The text blocks on the screen and the screens around it, in document order. */
export function blocksNearView(view: EditorView): { node: ProseMirrorNode; pos: number }[] {
  const tops: { node: ProseMirrorNode; pos: number }[] = [];
  view.state.doc.forEach((node, pos) => tops.push({ node, pos }));
  const height = window.innerHeight;
  const above = -SCREENS * height;
  const below = (SCREENS + 1) * height;
  const rectOf = (i: number): DOMRect | null => {
    const top = tops[i];
    const dom = top ? view.nodeDOM(top.pos) : null;
    return dom instanceof Element ? dom.getBoundingClientRect() : null;
  };
  // The first block whose bottom is under the top edge, by a binary search on the blocks in page order.
  let low = 0;
  let high = tops.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const rect = rectOf(mid);
    if (rect && rect.bottom < above) low = mid + 1;
    else high = mid;
  }
  const found: { node: ProseMirrorNode; pos: number }[] = [];
  for (let i = low; i < tops.length; i++) {
    const rect = rectOf(i);
    if (rect && rect.top > below) break;
    const top = tops[i];
    if (!top) break;
    if (top.node.isTextblock) found.push(top);
    else
      top.node.descendants((node, pos) => {
        if (!node.isTextblock) return true;
        found.push({ node, pos: top.pos + 1 + pos });
        return false;
      });
  }
  return found;
}

/** The ranges of the new document that the transaction changed. */
function changedRanges(tr: Transaction): [number, number][] {
  const ranges: [number, number][] = [];
  tr.mapping.maps.forEach((map, i) => {
    const after = tr.mapping.slice(i + 1);
    map.forEach((_oldFrom, _oldTo, from, to) => {
      ranges.push([after.map(from, -1), after.map(to, 1)]);
    });
  });
  return ranges;
}

export function blockCheckPlugin<T extends BlockMark>(
  options: BlockCheckOptions<T>,
): Plugin<BlockCheckState> {
  const { key, isOn, pauseMs, run } = options;
  // Each paragraph node keeps its marks from the worker until an edit makes a new node.
  const results = new WeakMap<ProseMirrorNode, T[]>();
  const asked = new WeakSet<ProseMirrorNode>();

  const build = (doc: ProseMirrorNode): DecorationSet => {
    const draw = options.drawer();
    const decorations: Decoration[] = [];
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      for (const mark of results.get(node) ?? []) {
        const drawn = draw(mark, node.textBetween(mark.from, mark.to, ' ', ' '));
        if (drawn)
          decorations.push(
            Decoration.inline(pos + 1 + mark.from, pos + 1 + mark.to, drawn.attrs, drawn.spec),
          );
      }
      return false;
    });
    return DecorationSet.create(doc, decorations);
  };

  return new Plugin<BlockCheckState>({
    key,
    state: {
      init: () => ({ on: isOn(), decorations: DecorationSet.empty }),
      apply: (tr, value, _old, state) => {
        if (tr.getMeta(key) !== undefined) {
          const on = isOn();
          return { on, decorations: on ? build(state.doc) : DecorationSet.empty };
        }
        if (!tr.docChanged || !value.on) return value;
        // A mark on words that the writer changes goes away until the next check.
        let decorations = value.decorations.map(tr.mapping, tr.doc);
        for (const [from, to] of changedRanges(tr))
          decorations = decorations.remove(decorations.find(Math.max(0, from - 1), to + 1));
        return { on: true, decorations };
      },
    },
    props: {
      decorations: (state) => key.getState(state)?.decorations ?? DecorationSet.empty,
    },
    view: (view) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const redraw = () => {
        if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, true).setMeta('addToHistory', false));
      };
      const check = () => {
        if (view.isDestroyed || !isOn()) return;
        const blocks = blocksNearView(view).filter(({ node }) => !results.has(node) && !asked.has(node));
        if (blocks.length === 0) return;
        for (const { node } of blocks) asked.add(node);
        options.onRun?.();
        run(blocks.map(({ node }) => blockText(node))).then(
          (marks) => {
            options.onDone?.(true);
            blocks.forEach(({ node }, i) => results.set(node, marks[i] ?? []));
            redraw();
          },
          () => {
            // The blocks get another check at the next pause, such as after the device goes online.
            for (const { node } of blocks) asked.delete(node);
            options.onDone?.(false);
          },
        );
      };
      const later = (ms: number) => {
        clearTimeout(timer);
        timer = setTimeout(check, ms);
      };
      const onScroll = () => {
        if (isOn()) later(SCROLL_PAUSE_MS);
      };
      let wasOn = isOn();
      // A change outside the editor, such as the switch or a word list, draws the marks again.
      const onOutside = () => {
        const on = isOn();
        const turnedOn = on && !wasOn;
        wasOn = on;
        redraw();
        if (turnedOn) later(0);
      };
      const stops = (options.sources ?? []).map((subscribe) => subscribe(onOutside));
      window.addEventListener('scroll', onScroll, { capture: true, passive: true });
      if (wasOn) later(pauseMs);
      return {
        update: (next, previous) => {
          if (next.state.doc !== previous.doc && isOn()) later(pauseMs);
        },
        destroy: () => {
          clearTimeout(timer);
          window.removeEventListener('scroll', onScroll, { capture: true });
          for (const stop of stops) stop();
        },
      };
    },
  });
}

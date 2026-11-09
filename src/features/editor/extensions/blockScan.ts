import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, type EditorState, type PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type DecorationAttrs } from '@tiptap/pm/view';
import { SAVE_PAUSE_MS } from '../saveTracker';

/*
 * Marks that a scan of each paragraph or poem line draws: the style check (F47) and the Codex names (F42).
 * Decorations draw them, so the text never changes. A scan runs after the save pause and analyzes only
 * the paragraphs that changed: an unchanged paragraph is the same node, so its marks come from the cache.
 * Until the next scan, the marks move with the text.
 */

export interface BlockMark {
  /** Offsets in the text of the block. */
  from: number;
  to: number;
  attrs: DecorationAttrs;
  spec: object;
}

export interface ScanState {
  /** False while the inputs are null: the marks are off. */
  on: boolean;
  decorations: DecorationSet;
}

/** The text of a paragraph or line with one character for each position, so an offset is a position. */
function blockText(block: ProseMirrorNode): string {
  let text = '';
  block.forEach((child) => {
    if (child.isText) text += child.text ?? '';
    else text += child.type.name === 'hardBreak' ? '\n' : '￼'.repeat(child.nodeSize);
  });
  return text;
}

/** The decorations of the scan at a position, shortest first. */
export function scanMarksAt(key: PluginKey<ScanState>, state: EditorState): Decoration[] {
  const value = key.getState(state);
  if (!value?.on) return [];
  const at = state.selection.from;
  return value.decorations.find(at, at).sort((a, b) => a.to - a.from - (b.to - b.from));
}

export function blockScanPlugin<T>(options: {
  key: PluginKey<ScanState>;
  /** What the marks depend on outside the text, or null when they are off. A new value scans at once. */
  inputs: () => T | null;
  subscribe: (listener: () => void) => () => void;
  marksOf: (text: string, inputs: T) => BlockMark[];
}): Plugin<ScanState> {
  const { key, inputs, subscribe, marksOf } = options;
  let cache = new WeakMap<ProseMirrorNode, BlockMark[]>();
  let scanned: T | null = null;

  const scan = (doc: ProseMirrorNode, now: T): DecorationSet => {
    if (now !== scanned) {
      cache = new WeakMap();
      scanned = now;
    }
    const decorations: Decoration[] = [];
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      let marks = cache.get(node);
      if (!marks) {
        marks = marksOf(blockText(node), now);
        cache.set(node, marks);
      }
      for (const mark of marks)
        decorations.push(Decoration.inline(pos + 1 + mark.from, pos + 1 + mark.to, mark.attrs, mark.spec));
      return false;
    });
    return DecorationSet.create(doc, decorations);
  };

  return new Plugin<ScanState>({
    key,
    state: {
      init: () => ({ on: inputs() !== null, decorations: DecorationSet.empty }),
      apply: (tr, value, _old, state) => {
        if (tr.getMeta(key) !== undefined) {
          const now = inputs();
          return { on: now !== null, decorations: now === null ? DecorationSet.empty : scan(state.doc, now) };
        }
        if (!tr.docChanged || !value.on) return value;
        return { on: true, decorations: value.decorations.map(tr.mapping, tr.doc) };
      },
    },
    props: {
      decorations: (state) => key.getState(state)?.decorations ?? DecorationSet.empty,
    },
    view: (view) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const rescan = () => {
        if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, true).setMeta('addToHistory', false));
      };
      const later = () => {
        clearTimeout(timer);
        timer = setTimeout(rescan, SAVE_PAUSE_MS);
      };
      let last = inputs();
      if (last !== null) later();
      // The inputs live outside the editor. A change there scans or clears the marks at once.
      const stop = subscribe(() => {
        const now = inputs();
        if (now === last) return;
        last = now;
        rescan();
      });
      return {
        update: (next, previous) => {
          if (next.state.doc !== previous.doc && key.getState(next.state)?.on) later();
        },
        destroy: () => {
          clearTimeout(timer);
          stop();
        },
      };
    },
  });
}

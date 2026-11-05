import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { findNames, markedAliasFor, type PrivatePerson } from '@/lib/privacy';
import { personIdOf, PRIVATE_NAME } from './markName';
import { getNames, subscribeNames } from './nameStore';

/*
 * "Show aliases" (spec 8.2, plan Task C5). Decorations show each alias in place of each marked name and
 * each unmarked real name. The text does not change, so the switch never touches the document.
 */

export const aliasPreviewKey = new PluginKey<PreviewState>('vloAliasPreview');

interface PreviewState {
  show: boolean;
  decorations: DecorationSet;
}

interface Found {
  from: number;
  to: number;
  alias: string;
  marked: boolean;
}

/** A widget with the alias, in front of the real name that the inline decoration hides. */
function aliasWidget(alias: string, marked: boolean): HTMLElement {
  const span = document.createElement('span');
  span.className = marked ? 'vlo-alias' : 'vlo-alias vlo-alias-unmarked';
  span.textContent = alias;
  return span;
}

/** The names in one text block: marked runs of text, then unmarked matches between them. */
function namesIn(block: ProseMirrorNode, start: number, people: readonly PrivatePerson[]): Found[] {
  const found: Found[] = [];
  // The unmarked text since the last name or object, and where it starts.
  const plain = { text: '', from: start };
  // The marked name that the walk is in, if any.
  const open: { name: { from: number; to: number; text: string; person: string } | null } = { name: null };
  const flushPlain = () => {
    for (const m of findNames(plain.text, people)) {
      found.push({ from: plain.from + m.from, to: plain.from + m.to, alias: m.alias, marked: false });
    }
    plain.text = '';
  };
  const flushMarked = () => {
    const name = open.name;
    if (!name) return;
    const alias = markedAliasFor(name.text, people, name.person);
    if (alias !== null) found.push({ from: name.from, to: name.to, alias, marked: true });
    open.name = null;
  };
  block.forEach((child, offset) => {
    const pos = start + offset;
    const end = pos + child.nodeSize;
    const mark = child.isText ? child.marks.find((m) => m.type.name === PRIVATE_NAME) : undefined;
    const person = mark ? personIdOf(mark.attrs) : null;
    if (child.isText && person !== null && people.some((p) => p.id === person)) {
      flushPlain();
      const name = open.name;
      if (name?.person === person && name.to === pos) {
        name.to = end;
        name.text += child.text ?? '';
      } else {
        flushMarked();
        open.name = { from: pos, to: end, text: child.text ?? '', person };
      }
      plain.from = end;
      return;
    }
    flushMarked();
    if (child.isText) {
      if (plain.text === '') plain.from = pos;
      plain.text += child.text ?? '';
      return;
    }
    // An inline object, such as a footnote or a line break, ends the text a name can cross.
    flushPlain();
    plain.from = end;
  });
  flushMarked();
  flushPlain();
  return found;
}

function decorate(doc: ProseMirrorNode, show: boolean): DecorationSet {
  const { people } = getNames();
  if (!show || people.length === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    for (const name of namesIn(node, pos + 1, people)) {
      decorations.push(
        Decoration.widget(name.from, () => aliasWidget(name.alias, name.marked), {
          side: -1,
          key: `${name.marked ? 'm' : 'u'}:${name.alias}`,
          ignoreSelection: true,
        }),
        Decoration.inline(name.from, name.to, { class: 'vlo-alias-real' }),
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/** True while this editor shows aliases. */
export function showsAliases(state: EditorState): boolean {
  return aliasPreviewKey.getState(state)?.show ?? false;
}

export const AliasPreview = Extension.create({
  name: 'aliasPreview',

  addProseMirrorPlugins() {
    return [
      new Plugin<PreviewState>({
        key: aliasPreviewKey,
        state: {
          init: (_config, state) => {
            const { show } = getNames();
            return { show, decorations: decorate(state.doc, show) };
          },
          apply: (tr, value, _old, state) => {
            if (tr.getMeta(aliasPreviewKey) !== undefined) {
              const { show } = getNames();
              return { show, decorations: decorate(state.doc, show) };
            }
            if (!tr.docChanged || !value.show) return value;
            return { show: true, decorations: decorate(state.doc, true) };
          },
        },
        props: {
          decorations: (state) => aliasPreviewKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
        // The switch and the person list live outside the editor. A change there redraws the preview.
        view: (view) => {
          const stop = subscribeNames(() => {
            if (!view.isDestroyed)
              view.dispatch(view.state.tr.setMeta(aliasPreviewKey, true).setMeta('addToHistory', false));
          });
          return { destroy: stop };
        },
      }),
    ];
  },
});

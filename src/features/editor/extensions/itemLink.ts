import { mergeAttributes, Node, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Transform } from '@tiptap/pm/transform';
import {
  followLink,
  getLinks,
  headingsOf,
  linkEditor,
  linkShows,
  noteAnchor,
  registerLinkEditor,
  subscribeLinks,
  type LinkTarget,
} from '@/features/links/linkStore';
import { db } from '@/lib/db';
import { cleanAnchor, cleanItemId, ITEM_LINK, linkLabel, linkText, newAnchor } from '../format/itemLink';
import { menuPlugin, type MenuState } from './slashMenu';

/*
 * Links between items (Phase 19, Task F1). "[[" or Insert > "Link to an item" lists the items and their
 * headings. A link is an inline atom that shows the item's current title. A click opens the item, and
 * Mod-click opens it beside, in split view. With the link selected, Enter opens it, and the line under the
 * toolbar offers "Open", "Open beside" and "Remove link". A link to a deleted item shows a quiet broken
 * style.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    itemLink: {
      /** Types "[[" at the caret and opens the list of items and headings. */
      openLinkList: () => ReturnType;
    };
  }
}

/** A choice of the "[[" list: an item, or a heading of an item. */
export interface LinkChoice {
  item: string;
  title: string;
  heading?: { text: string; index: number; anchor?: string };
}

export const linkMenuKey = new PluginKey<MenuState<LinkChoice>>('vloItemLinkMenu');

/** The most choices that the list shows. */
const MAX_CHOICES = 10;

/** The items whose titles hold the query, then the headings that hold it. */
export function linkChoices(query: string): LinkChoice[] {
  const q = query.trim().toLowerCase();
  const { items } = getLinks();
  const titled = [...items].filter(([, title]) => title.trim() !== '');
  const byItem = titled
    .filter(([, title]) => title.toLowerCase().includes(q))
    .map(([item, title]): LinkChoice => ({ item, title }));
  const byHeading = titled.flatMap(([item, title]) =>
    headingsOf(item).flatMap((h, index): LinkChoice[] =>
      h.text.toLowerCase().includes(q) ? [{ item, title, heading: { ...h, index } }] : [],
    ),
  );
  return [...byItem, ...byHeading].slice(0, MAX_CHOICES);
}

/** The target of a link node. */
export function targetOf(node: ProseMirrorNode): LinkTarget | null {
  const item = cleanItemId(node.attrs.item);
  if (item === null) return null;
  const heading = cleanAnchor(node.attrs.heading);
  return heading === null ? { item } : { item, heading };
}

/** The link that the selection holds or that sits just before the caret, with its position. */
export function linkAt(state: EditorState): { node: ProseMirrorNode; pos: number } | null {
  const { selection } = state;
  if (selection instanceof NodeSelection)
    return selection.node.type.name === ITEM_LINK ? { node: selection.node, pos: selection.from } : null;
  if (!selection.empty) return null;
  const before = selection.$from.nodeBefore;
  return before?.type.name === ITEM_LINK ? { node: before, pos: selection.from - before.nodeSize } : null;
}

/** The nth heading with text, if its text is still the same: the position and the anchor. */
function headingAt(
  doc: ProseMirrorNode,
  text: string,
  index: number,
): { pos: number; anchor: string | null } | null {
  let n = 0;
  let found: { pos: number; anchor: string | null } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name !== 'heading' || node.textContent.trim() === '') return true;
    if (n === index && node.textContent.trim() === text)
      found = { pos, anchor: cleanAnchor(node.attrs.anchor) };
    n += 1;
    return false;
  });
  return found;
}

/**
 * Gives the chosen heading the anchor, so the link finds it. The item's open editor makes the change, or
 * the stored text when the item is not open. A heading that has an anchor already keeps it.
 */
async function anchorHeading(choice: LinkChoice, anchor: string): Promise<void> {
  const { heading } = choice;
  const { projectId } = getLinks();
  if (!heading || projectId === null) return;
  const mark = <T extends Transform>(doc: ProseMirrorNode, tr: T): T => {
    const found = headingAt(doc, heading.text, heading.index);
    if (found?.anchor === null) tr.setNodeAttribute(found.pos, 'anchor', anchor);
    return tr;
  };
  const open = linkEditor(choice.item);
  if (open) {
    open.view.dispatch(mark(open.state.doc, open.state.tr.setMeta('addToHistory', false)));
    return;
  }
  // The stored text's module reads the editor schema, which holds this node, so it loads on use.
  const [{ changeStoredDoc }, project] = await Promise.all([
    import('../storedDoc'),
    db.projects.get(projectId),
  ]);
  const language = project?.settings.language;
  await changeStoredDoc(
    { item: { id: choice.item, projectId }, form: 'prose', ...(language ? { language } : {}) },
    (doc) => mark(doc, new Transform(doc)),
  );
}

/** Puts a link to the choice at the caret. */
export function insertLink(editor: Editor, choice: LinkChoice): void {
  const anchor = choice.heading ? (choice.heading.anchor ?? newAnchor()) : null;
  const label = linkLabel(choice.title, choice.heading?.text);
  editor
    .chain()
    .focus()
    .insertContent([
      { type: ITEM_LINK, attrs: { item: choice.item, heading: anchor, label } },
      { type: 'text', text: ' ' },
    ])
    .run();
  if (choice.heading && choice.heading.anchor === undefined && anchor !== null) {
    noteAnchor(choice.item, choice.heading.index, anchor);
    void anchorHeading(choice, anchor).catch(() => undefined);
  }
}

/** Takes the link out of the text and keeps its words as plain text. */
export function unlink(editor: Editor, pos: number): void {
  const node = editor.state.doc.nodeAt(pos);
  if (node?.type.name !== ITEM_LINK) return;
  const text = linkShows(targetOf(node) ?? { item: '' }, linkText(node.attrs)).text;
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      tr.replaceWith(pos, pos + node.nodeSize, state.schema.text(text));
      return true;
    })
    .run();
}

function draw(dom: HTMLElement, node: ProseMirrorNode): void {
  const target = targetOf(node);
  const shown = linkShows(target ?? { item: '' }, linkText(node.attrs));
  dom.textContent = shown.text;
  dom.classList.toggle('vlo-item-link-broken', shown.broken);
  dom.title = shown.broken
    ? 'The project no longer has this item.'
    : `Open “${shown.text}”. Press Ctrl or ⌘ as you click to open it beside.`;
}

export const ItemLink = Node.create<{ itemId: string | null; listId: string }, { stop?: () => void }>({
  name: ITEM_LINK,
  // Before the list keys and Enter, so the open list takes Enter and Tab first.
  priority: 10000,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { itemId: null, listId: 'vlo-item-links' };
  },

  addAttributes() {
    return {
      item: {
        default: '',
        parseHTML: (element) => cleanItemId(element.dataset.itemLink) ?? '',
        renderHTML: (attributes) => ({ 'data-item-link': String(attributes.item) }),
      },
      heading: {
        default: null,
        parseHTML: (element) => cleanAnchor(element.dataset.heading),
        renderHTML: (attributes) => {
          const anchor = cleanAnchor(attributes.heading);
          return anchor === null ? {} : { 'data-heading': anchor };
        },
      },
      label: {
        default: '',
        parseHTML: (element) => element.textContent,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-item-link]' }];
  },

  // A copy holds the item id, so a paste in another item of the project keeps the link.
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'vlo-item-link' }), linkText(node.attrs)];
  },

  renderText({ node }) {
    return linkText(node.attrs);
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'vlo-item-link';
      dom.contentEditable = 'false';
      let current = node;
      draw(dom, current);
      const stop = subscribeLinks(() => {
        draw(dom, current);
      });
      return {
        dom,
        update: (next) => {
          if (next.type !== current.type) return false;
          current = next;
          draw(dom, current);
          return true;
        },
        destroy: stop,
        ignoreMutation: () => true,
      };
    };
  },

  addCommands() {
    return {
      openLinkList:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const from = tr.selection.from;
            tr.insertText('[[', from, tr.selection.to).setMeta(linkMenuKey, { open: from });
          }
          return true;
        },
    };
  },

  addStorage() {
    return {};
  },

  // At once, before the first draw, so a link that opens the item finds its editor.
  onBeforeCreate() {
    const { itemId } = this.options;
    if (itemId !== null) this.storage.stop = registerLinkEditor(itemId, this.editor);
  },

  onDestroy() {
    this.storage.stop?.();
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const follow = (node: ProseMirrorNode, beside: boolean): boolean => {
      const target = targetOf(node);
      if (!target || !getLinks().items.has(target.item)) return false;
      followLink(target, beside);
      return true;
    };
    return [
      new Plugin({
        view: (view) => {
          // Each link keeps the text that it shows, so the text copy, search and the exports read the
          // current title. The change is no step of Undo.
          const sync = () => {
            const links = getLinks();
            if (!links.ready || links.items.size === 0 || !editor.isEditable || view.isDestroyed) return;
            const { tr } = view.state;
            view.state.doc.descendants((node, pos) => {
              if (node.type.name !== ITEM_LINK) return true;
              const shown = linkShows(targetOf(node) ?? { item: '' }, linkText(node.attrs));
              if (!shown.broken && shown.text !== node.attrs.label)
                tr.setNodeAttribute(pos, 'label', shown.text);
              return false;
            });
            if (tr.docChanged) view.dispatch(tr.setMeta('addToHistory', false));
          };
          const stop = subscribeLinks(sync);
          // After the first draw, when the editor holds its text.
          const first = setTimeout(sync, 0);
          return {
            destroy: () => {
              clearTimeout(first);
              stop();
            },
          };
        },
        props: {
          handleClickOn(view, _pos, node, nodePos, event, direct) {
            if (!direct || node.type.name !== ITEM_LINK || event.button !== 0) return false;
            // A broken link takes the selection, so the line under the toolbar offers "Remove link".
            if (!follow(node, event.metaKey || event.ctrlKey))
              view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
            return true;
          },
          handleKeyDown(view, event) {
            if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey)
              return false;
            const { selection } = view.state;
            if (!(selection instanceof NodeSelection) || selection.node.type.name !== ITEM_LINK) return false;
            return follow(selection.node, false);
          },
        },
      }),
      menuPlugin<LinkChoice>({
        key: linkMenuKey,
        trigger: '[[',
        editor,
        listId: this.options.listId,
        enabled: () => getLinks().projectId !== null,
        items: linkChoices,
        onChoose: (choice) => {
          insertLink(editor, choice);
        },
      }),
    ];
  },
});

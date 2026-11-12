import { Extension, mergeAttributes, Node, type Editor, type NodeViewRenderer } from '@tiptap/core';
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { dropPoint } from '@tiptap/pm/transform';
import type { EditorView } from '@tiptap/pm/view';
import { yUndoPluginKey } from '@tiptap/y-tiptap';
import { db, type ImageFile } from '@/lib/db';
import { newId } from '@/lib/ids';
import {
  addImage,
  IMAGE,
  IMAGE_FAILED,
  imageAddress,
  imageFailed,
  markImageFailed,
  onImageFailed,
  watchImage,
} from '@/features/images/images';
import { openPanel } from '../commands/editorBus';

/*
 * An image in the text (Phase 16, Tasks G1 and G2). The node is a block that holds the id of a row of the
 * `images` table, the alt text, a caption, a width and an alignment. The node view loads the row and
 * shows it from a blob: address. A drag moves the node, Alt-Up and Alt-Down move it from the keyboard,
 * and a file dropped or pasted goes in at the pointer or the caret.
 */

export const IMAGE_WIDTHS = [33, 50, 75, 100] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];
export const IMAGE_ALIGNS = ['left', 'center', 'right'] as const;
export type ImageAlign = (typeof IMAGE_ALIGNS)[number];

export interface ImageAttrs {
  id: string;
  alt: string;
  /** A decorative image has no alt text, and a screen reader skips it. */
  decorative: boolean;
  caption: string;
  /** Percent of the text width. */
  width: ImageWidth;
  align: ImageAlign;
}

const MAX_TEXT = 2000;

export function cleanImageText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) : '';
}

export function cleanImageWidth(value: unknown): ImageWidth {
  const n = Number(value);
  return (IMAGE_WIDTHS as readonly number[]).includes(n) ? (n as ImageWidth) : 100;
}

export function cleanImageAlign(value: unknown): ImageAlign {
  return (IMAGE_ALIGNS as readonly unknown[]).includes(value) ? (value as ImageAlign) : 'center';
}

/** The attributes of an image node, checked, as an export or a share reads them. */
export function imageAttrs(attrs: Record<string, unknown> | undefined): ImageAttrs {
  return {
    id: typeof attrs?.id === 'string' ? attrs.id : '',
    alt: cleanImageText(attrs?.alt),
    decorative: attrs?.decorative === true,
    caption: cleanImageText(attrs?.caption),
    width: cleanImageWidth(attrs?.width),
    align: cleanImageAlign(attrs?.align),
  };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      /** Puts an image at the selection and selects it. */
      insertImage: (attrs: Partial<ImageAttrs> & { id: string }) => ReturnType;
      /** Changes the alt text, the caption, the width or the alignment of the image at `pos`. */
      setImageAttrs: (pos: number, attrs: Partial<Omit<ImageAttrs, 'id'>>) => ReturnType;
      /** Moves the selected image one block up (-1) or down (1). */
      moveImage: (direction: -1 | 1) => ReturnType;
    };
  }
}

/** The position of the image that the selection holds, or null. */
export function selectedImage(state: EditorState): number | null {
  const { selection } = state;
  return selection instanceof NodeSelection && selection.node.type.name === IMAGE ? selection.from : null;
}

/** The position of the image node with this id, or null. */
export function imagePos(doc: ProseMirrorNode, id: string): number | null {
  let found: number | null = null;
  doc.descendants((node, at) => {
    if (found !== null) return false;
    if (node.type.name === IMAGE && node.attrs.id === id) found = at;
    return found === null && !node.isLeaf;
  });
  return found;
}

/** The text that names an image to a screen reader. */
function imageLabel(attrs: ImageAttrs): string {
  if (attrs.decorative) return 'Decorative image';
  return attrs.alt === '' ? 'Image with no description' : `Image: ${attrs.alt}`;
}

const imageView: NodeViewRenderer = ({ node }) => {
  const dom = document.createElement('figure');
  dom.className = 'vlo-image';
  dom.setAttribute('data-vlo-image', '');
  const frame = document.createElement('div');
  frame.className = 'vlo-image-frame';
  const caption = document.createElement('figcaption');
  caption.className = 'vlo-image-caption';
  dom.append(frame, caption);

  let attrs = imageAttrs(node.attrs);
  let row: ImageFile | null = null;
  let loaded = false;

  const draw = () => {
    dom.dataset.align = attrs.align;
    dom.dataset.width = String(attrs.width);
    dom.style.setProperty('--vlo-image-width', `${String(attrs.width)}%`);
    caption.textContent = attrs.caption;
    caption.hidden = attrs.caption === '';
    if (row) {
      let img = frame.querySelector('img');
      if (!img) {
        img = document.createElement('img');
        img.decoding = 'async';
        img.loading = 'lazy';
        img.draggable = false;
        frame.replaceChildren(img);
      }
      img.src = imageAddress(row);
      img.width = row.width;
      img.height = row.height;
      img.alt = attrs.decorative ? '' : attrs.alt;
      dom.style.setProperty('--vlo-image-ratio', `${String(row.width)} / ${String(row.height)}`);
      dom.removeAttribute('data-missing');
      return;
    }
    // No row: a box with the alt text, never an empty gap (Global Constraints).
    const box = document.createElement('div');
    box.className = 'vlo-image-missing';
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', imageLabel(attrs));
    const failed = imageFailed(attrs.id);
    const note = failed ? IMAGE_FAILED : loaded ? 'This image is not on this device.' : 'Adding the image.';
    const lines = [note, attrs.decorative ? '' : attrs.alt].filter((line) => line !== '');
    box.replaceChildren(
      ...lines.map((line) => Object.assign(document.createElement('span'), { textContent: line })),
    );
    frame.replaceChildren(box);
    dom.dataset.missing = failed ? 'failed' : loaded ? 'gone' : 'pending';
  };

  let stop = watchImage(attrs.id, (next) => {
    row = next;
    loaded = true;
    draw();
  });
  const stopFailed = onImageFailed(draw);
  draw();

  return {
    dom,
    update: (updated: ProseMirrorNode) => {
      if (updated.type !== node.type) return false;
      const next = imageAttrs(updated.attrs);
      if (next.id !== attrs.id) {
        stop();
        row = null;
        loaded = false;
        attrs = next;
        stop = watchImage(attrs.id, (value) => {
          row = value;
          loaded = true;
          draw();
        });
      }
      attrs = next;
      draw();
      return true;
    },
    // The view draws its own content, and ProseMirror must not read that as an edit.
    ignoreMutation: () => true,
    destroy: () => {
      stop();
      stopFailed();
    },
  };
};

const textAttribute = (name: string) => ({
  default: '',
  parseHTML: (element: HTMLElement) => cleanImageText(element.getAttribute(`data-${name}`)),
  renderHTML: (attributes: Record<string, unknown>) => ({
    [`data-${name}`]: cleanImageText(attributes[name]),
  }),
});

/** Moves the image at `pos` past its neighbor block. */
function moveBlock(state: EditorState, pos: number, direction: -1 | 1) {
  const $pos = state.doc.resolve(pos);
  const node = $pos.nodeAfter;
  if (!node) return null;
  const parent = $pos.parent;
  const index = $pos.index();
  const other = index + direction;
  if (other < 0 || other >= parent.childCount) return null;
  const neighbor = parent.child(other);
  const tr = state.tr.delete(pos, pos + node.nodeSize);
  const target = direction < 0 ? pos - neighbor.nodeSize : pos + neighbor.nodeSize;
  tr.insert(target, node);
  tr.setSelection(NodeSelection.create(tr.doc, target)).scrollIntoView();
  return tr;
}

export const ImageNode = Node.create({
  name: IMAGE,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-id') ?? '',
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-id': typeof attributes.id === 'string' ? attributes.id : '',
        }),
      },
      alt: textAttribute('alt'),
      caption: textAttribute('caption'),
      decorative: {
        default: false,
        parseHTML: (element: HTMLElement) => element.hasAttribute('data-decorative'),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.decorative === true ? { 'data-decorative': '' } : {},
      },
      width: {
        default: 100,
        parseHTML: (element: HTMLElement) => cleanImageWidth(element.getAttribute('data-width')),
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-width': String(cleanImageWidth(attributes.width)),
        }),
      },
      align: {
        default: 'center',
        parseHTML: (element: HTMLElement) => cleanImageAlign(element.getAttribute('data-align')),
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-align': cleanImageAlign(attributes.align),
        }),
      },
    };
  },

  // Only Vlo's own image node: a pasted <img> from a web page names a web address, and Vlo makes no
  // request for it (Global Constraints).
  parseHTML() {
    return [{ tag: 'figure[data-vlo-image]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = imageAttrs(node.attrs);
    return [
      'figure',
      mergeAttributes(HTMLAttributes, { 'data-vlo-image': '' }),
      ['figcaption', attrs.caption || (attrs.decorative ? '' : attrs.alt)],
    ];
  },

  addNodeView() {
    return imageView;
  },

  addCommands() {
    return {
      insertImage:
        (attrs) =>
        ({ tr, state, dispatch }) => {
          const node = state.schema.nodes[IMAGE]?.create(attrs);
          if (!node) return false;
          if (dispatch) {
            const { $from, empty } = state.selection;
            // An empty paragraph gives its place to the image.
            if (empty && $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0) {
              const start = $from.before();
              tr.replaceWith(start, $from.after(), node);
              tr.setSelection(NodeSelection.create(tr.doc, start));
            } else {
              tr.replaceSelectionWith(node);
              const pos = imagePos(tr.doc, attrs.id);
              if (pos !== null) tr.setSelection(NodeSelection.create(tr.doc, pos));
            }
            tr.scrollIntoView();
          }
          return true;
        },
      setImageAttrs:
        (pos, attrs) =>
        ({ tr, state, dispatch }) => {
          const node = state.doc.nodeAt(pos);
          if (node?.type.name !== IMAGE) return false;
          if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
          return true;
        },
      moveImage:
        (direction) =>
        ({ state, dispatch }) => {
          const pos = selectedImage(state);
          if (pos === null) return false;
          const tr = moveBlock(state, pos, direction);
          if (!tr) return false;
          dispatch?.(tr);
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Alt-ArrowUp': ({ editor }) => editor.commands.moveImage(-1),
      'Alt-ArrowDown': ({ editor }) => editor.commands.moveImage(1),
      Enter: ({ editor }) => {
        if (selectedImage(editor.state) === null) return false;
        openPanel({ editor, panel: 'image', anchor: 'caret' });
        return true;
      },
    };
  },
});

/** The image files in a list of files, in order. */
function imageFiles(files: FileList | null | undefined): File[] {
  return [...(files ?? [])].filter((file) => file.type.startsWith('image/'));
}

/** Starts the write of an image file under `id`. A failed write marks the node, which keeps its place. */
export function storeImageFile(projectId: string, file: Blob, id: string): void {
  addImage(projectId, file, id).catch(() => {
    markImageFailed(id);
  });
}

/**
 * Puts each file in as an image at `pos`, or at the selection, and starts its write. The node goes in at
 * once with a new id, and shows "Adding the image." until its row is stored. Then the image panel opens
 * for the first one, so the writer gives its alt text (decision G4).
 */
export function insertImageFiles(
  editor: Editor,
  projectId: string,
  files: readonly File[],
  pos: number | null = null,
): boolean {
  if (files.length === 0) return false;
  const type = editor.schema.nodes[IMAGE];
  if (!type) return false;
  const ids = files.map(() => newId());
  newUndoStep(editor.state);
  if (pos === null) {
    let chain = editor.chain().focus();
    for (const id of ids) chain = chain.insertImage({ id });
    if (!chain.run()) return false;
  } else {
    const tr = editor.state.tr.insert(pos, Fragment.from(ids.map((id) => type.create({ id }))));
    tr.setSelection(NodeSelection.create(tr.doc, pos)).scrollIntoView();
    editor.view.dispatch(tr);
    editor.view.focus();
  }
  // With more than one file, the panel names the first one.
  const first = ids.length > 1 ? imagePos(editor.state.doc, ids[0] ?? '') : null;
  if (first !== null)
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, first)));
  newUndoStep(editor.state);
  files.forEach((file, i) => {
    storeImageFile(projectId, file, ids[i] ?? '');
  });
  openPanel({ editor, panel: 'image', anchor: 'caret' });
  return true;
}

/**
 * Ends the current undo step. The text history joins changes made close together, so without this one
 * Undo after a new image or a drag would also take back the typing just before it.
 */
function newUndoStep(state: EditorState): void {
  yUndoPluginKey.getState(state)?.undoManager.stopCapturing();
}

/** A copy of each image row that a paste or a drop from another place names, under a new id. */
function copyRows(pairs: readonly (readonly [string, string])[], projectId: string): void {
  for (const [old, id] of pairs)
    void db.images
      .get(old)
      .then((row) => (row ? db.images.add({ ...row, id, projectId }) : undefined))
      .catch(() => {
        markImageFailed(id);
      });
}

/** Gives each image in a pasted slice a new id, so each project keeps its own rows. */
function withNewIds(slice: Slice, projectId: string): Slice {
  const pairs: [string, string][] = [];
  const map = (fragment: Fragment): Fragment => {
    const children: ProseMirrorNode[] = [];
    fragment.forEach((child) => {
      if (child.type.name === IMAGE && typeof child.attrs.id === 'string' && child.attrs.id !== '') {
        const id = newId();
        pairs.push([child.attrs.id, id]);
        children.push(child.type.create({ ...child.attrs, id }, child.content, child.marks));
      } else children.push(child.copy(map(child.content)));
    });
    return Fragment.from(children);
  };
  const content = map(slice.content);
  if (pairs.length === 0) return slice;
  copyRows(pairs, projectId);
  return new Slice(content, slice.openStart, slice.openEnd);
}

interface ImageInputOptions {
  /** The project that stores the images. Without one, the editor takes no image files. */
  projectId: string | null;
}

/** Drop and paste of image files, for the editors whose schema has the image node. */
export const ImageInput = Extension.create<ImageInputOptions>({
  name: 'imageInput',

  addOptions() {
    return { projectId: null };
  },

  addProseMirrorPlugins() {
    const { projectId } = this.options;
    const editor = this.editor;
    if (projectId === null) return [];
    return [
      new Plugin({
        key: new PluginKey('imageInput'),
        props: {
          handleDrop: (view: EditorView, event: DragEvent, _slice: Slice, moved: boolean) => {
            if (moved) {
              // ProseMirror moves the dragged content in one transaction just after this call, and that
              // move is an undo step of its own.
              newUndoStep(view.state);
              queueMicrotask(() => {
                newUndoStep(view.state);
              });
              return false;
            }
            const files = imageFiles(event.dataTransfer?.files);
            if (files.length === 0) return false;
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
            const type = view.state.schema.nodes[IMAGE];
            if (!at || !type) return false;
            const probe = new Slice(Fragment.from(type.create({ id: 'probe' })), 0, 0);
            const pos = dropPoint(view.state.doc, at.pos, probe) ?? at.pos;
            event.preventDefault();
            return insertImageFiles(editor, projectId, files, pos);
          },
          handlePaste: (_view: EditorView, event: ClipboardEvent) => {
            const data = event.clipboardData;
            const files = imageFiles(data?.files);
            // A copy from a page or a document with words keeps its words: only a paste of an image alone
            // is a new image.
            if (files.length === 0 || (data?.getData('text/plain') ?? '').trim() !== '') return false;
            event.preventDefault();
            return insertImageFiles(editor, projectId, files);
          },
          transformPasted: (slice: Slice, view: EditorView) =>
            // A drag inside this editor moves the node and keeps its row.
            view.dragging ? slice : withNewIds(slice, projectId),
        },
      }),
    ];
  },
});

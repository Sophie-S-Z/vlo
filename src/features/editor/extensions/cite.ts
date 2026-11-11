import { mergeAttributes, Node } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { getSources, subscribeSources } from '@/features/cite/sourceStore';
import { inText, MISSING_SOURCE } from '@/features/cite/styles';
import { CITE, citeText } from '../format/cite';

/*
 * Citations (roadmap 2 F64, plan Task M6). A citation is an inline atom that holds the key of its source
 * and an optional page. It shows the in-text form of the project's style, so a change of style or of the
 * source changes each citation at once. A citation of a deleted source shows "[missing source]".
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    cite: {
      /** Inserts a citation of the source with `key` at the selection. */
      insertCitation: (key: string, page?: string) => ReturnType;
    };
  }
}

function draw(dom: HTMLElement, node: ProseMirrorNode): void {
  const { sources, style } = getSources();
  const key = String(node.attrs.key);
  const text = inText(
    sources.find((s) => s.key === key),
    String(node.attrs.page),
    style,
  );
  dom.textContent = text;
  dom.classList.toggle('vlo-cite-missing', text === MISSING_SOURCE);
}

export const Cite = Node.create({
  name: CITE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      key: {
        default: '',
        parseHTML: (element) => element.dataset.cite ?? '',
        renderHTML: (attributes) => ({ 'data-cite': String(attributes.key) }),
      },
      page: {
        default: '',
        parseHTML: (element) => element.dataset.page ?? '',
        renderHTML: (attributes) => (attributes.page ? { 'data-page': String(attributes.page) } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-cite]' }];
  },

  // A copy holds the key, so a paste in another item or project keeps the citation.
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'vlo-cite' }), citeText(node.attrs)];
  },

  renderText({ node }) {
    return citeText(node.attrs);
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'vlo-cite';
      dom.contentEditable = 'false';
      let current = node;
      draw(dom, current);
      const stop = subscribeSources(() => {
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
      insertCitation:
        (key, page = '') =>
        ({ commands }) =>
          commands.insertContent({ type: CITE, attrs: { key, page: page.trim() } }),
    };
  },
});

import { Extension, type AnyExtension } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style';
import { cleanFontValue, fontStack, type FontValue } from '../format/fonts';
import { swatchVar } from '../format/palette';
import { TextFillMark } from './textFill';
import { PRIVATE_NAME } from '@/features/people/markName';
import { AI_ORIGIN } from '../format/aiOrigin';
import { COMMENT } from './comment';
import { SUGGESTION } from '../format/suggestion';

/* Formats beyond StarterKit. Inline formats apply to prose and poems; block formats to prose only. */

/** Word-style line spacing multiples. The page shows each one 1.15 times taller, like Word. */
export const LINE_SPACINGS = [1, 1.15, 1.5, 2] as const;
export type LineSpacing = (typeof LINE_SPACINGS)[number];

/** Font sizes relative to the manuscript size, so page zoom and themes scale them too. */
export const FONT_SIZES = [
  { label: 'Small', value: '0.85em' },
  { label: 'Normal', value: null },
  { label: 'Large', value: '1.25em' },
  { label: 'Larger', value: '1.5em' },
  { label: 'Huge', value: '2em' },
] as const;

/** The block types that take alignment, spacing and indent. */
const TEXT_BLOCKS = ['paragraph', 'heading'];

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockStyle: {
      /** Sets the line spacing of each selected block. Null returns to the default. */
      setLineSpacing: (spacing: LineSpacing | null) => ReturnType;
      /** Turns a first-line indent on or off for each selected paragraph. */
      toggleFirstLineIndent: () => ReturnType;
      /** Turns a drop cap on or off for the paragraph at the cursor. */
      toggleDropCap: () => ReturnType;
    };
    fontChoice: {
      /** Sets the font of the selection: a Vlo font id, or "local:" and an installed font's name. */
      setFont: (value: FontValue) => ReturnType;
      /** Returns the selection to the project's font. */
      unsetFont: () => ReturnType;
    };
    clearFormatting: {
      /** Removes every mark from the selection, and resets alignment, spacing, indent and drop caps. */
      clearFormatting: () => ReturnType;
    };
  }
}

function isLineSpacing(value: number): value is LineSpacing {
  return (LINE_SPACINGS as readonly number[]).includes(value);
}

/** Line spacing, first-line indent and drop caps, as attributes on paragraphs and headings. */
export const BlockStyle = Extension.create({
  name: 'blockStyle',

  addGlobalAttributes() {
    return [
      {
        types: TEXT_BLOCKS,
        attributes: {
          lineSpacing: {
            default: null,
            parseHTML: (element) => {
              const value = Number(element.dataset.lineSpacing);
              return isLineSpacing(value) ? value : null;
            },
            renderHTML: (attributes) => {
              const value = Number(attributes.lineSpacing);
              if (!isLineSpacing(value)) return {};
              return {
                'data-line-spacing': String(value),
                style: `line-height: ${String(Math.round(value * 115) / 100)}`,
              };
            },
          },
        },
      },
      {
        types: ['paragraph'],
        attributes: {
          firstLineIndent: {
            default: false,
            parseHTML: (element) => element.dataset.indent === 'first',
            renderHTML: (attributes) => (attributes.firstLineIndent ? { 'data-indent': 'first' } : {}),
          },
          dropCap: {
            default: false,
            parseHTML: (element) => element.dataset.dropCap === 'true',
            renderHTML: (attributes) => (attributes.dropCap ? { 'data-drop-cap': 'true' } : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineSpacing:
        (spacing) =>
        ({ commands }) =>
          TEXT_BLOCKS.map((type) => commands.updateAttributes(type, { lineSpacing: spacing })).some(Boolean),
      toggleFirstLineIndent:
        () =>
        ({ editor, commands }) =>
          commands.updateAttributes('paragraph', {
            firstLineIndent: !editor.getAttributes('paragraph').firstLineIndent,
          }),
      toggleDropCap:
        () =>
        ({ editor, commands }) =>
          commands.updateAttributes('paragraph', { dropCap: !editor.getAttributes('paragraph').dropCap }),
    };
  },
});

const KEPT_MARKS = new Set([PRIVATE_NAME, AI_ORIGIN, COMMENT, SUGGESTION]);

/** Mod-\ clears marks; in prose it also resets the block styles of the selected blocks. */
export const ClearFormatting = Extension.create<{ blocks: boolean }>({
  name: 'clearFormatting',

  addOptions() {
    return { blocks: true };
  },

  addCommands() {
    return {
      clearFormatting:
        () =>
        ({ chain }) => {
          // A private name is not a format, so its mark stays.
          let next = chain().command(({ tr, state }) => {
            for (const range of tr.selection.ranges) {
              for (const type of Object.values(state.schema.marks)) {
                // A private name, the AI mark, a comment and a tracked change are facts about the text,
                // not formats. Clearing a tracked change would accept or undo it with no review.
                if (!KEPT_MARKS.has(type.name)) tr.removeMark(range.$from.pos, range.$to.pos, type);
              }
            }
            return true;
          });
          if (this.options.blocks) {
            next = next
              .unsetTextAlign()
              .setLineSpacing(null)
              .updateAttributes('paragraph', { firstLineIndent: false, dropCap: false });
          }
          return next.run();
        },
    };
  },

  addKeyboardShortcuts() {
    return { 'Mod-\\': () => this.editor.commands.clearFormatting() };
  },
});

/**
 * The font of a run of text, on the textStyle mark. It stores a Vlo font id or an installed font's name,
 * never a CSS list, so a later font list or export can map it.
 */
export const FontChoice = Extension.create({
  name: 'fontChoice',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          font: {
            default: null,
            parseHTML: (element) => cleanFontValue(element.dataset.font),
            renderHTML: (attributes) => {
              const value = cleanFontValue(attributes.font);
              if (value === null) return {};
              return { 'data-font': value, style: `font-family: ${fontStack(value)}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFont:
        (value) =>
        ({ chain }) => {
          const clean = cleanFontValue(value);
          return clean === null ? false : chain().setMark('textStyle', { font: clean }).run();
        },
      unsetFont:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { font: null }).removeEmptyTextStyle().run(),
    };
  },
});

const ColoredHighlight = Highlight.extend({
  // Mod-Shift-H marks the selection yellow, the first swatch, so the shortcut gives a visible result.
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-h': () => this.editor.commands.toggleHighlight({ color: swatchVar('mark', 'yellow') }),
    };
  },
}).configure({ multicolor: true });

/** Inline formats for every editor: superscript, subscript, highlight, font, font color, font size and fills. */
export function inlineFormatting(): AnyExtension[] {
  return [
    Superscript.extend({ excludes: 'subscript' }),
    Subscript.extend({ excludes: 'superscript' }),
    ColoredHighlight,
    TextStyle,
    Color,
    FontSize,
    FontChoice,
    TextFillMark,
  ];
}

/** Block formats for prose: alignment, line spacing, first-line indent, drop caps, and clear formatting. */
export function blockFormatting(): AnyExtension[] {
  return [
    TextAlign.configure({
      types: TEXT_BLOCKS,
      alignments: ['left', 'center', 'right', 'justify'],
      defaultAlignment: null,
    }),
    BlockStyle,
  ];
}

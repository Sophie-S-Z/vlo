import type { Editor } from '@tiptap/core';
import {
  TextAlignCenter,
  TextAlignJustify,
  TextAlignStart,
  TextAlignEnd,
  ALargeSmall,
  Asterisk,
  Baseline,
  Bold,
  Heading2,
  Heading3,
  Highlighter,
  Hash,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Keyboard,
  LetterText,
  Link,
  Omega,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  Sparkles,
  Strikethrough,
  Subscript,
  Superscript,
  TextQuote,
  Underline,
  Undo2,
  UnfoldVertical,
  type LucideIcon,
} from 'lucide-react';
import { MAX_HANGING_EM } from '../extensions/poem';
import { openPanel } from './editorBus';
import { swatchVar } from '../format/palette';

/*
 * Every editor tool, listed once. The toolbar, the selection menu, the / menu, the command menu (Mod-K)
 * and the shortcut sheet all read this list, so a tool has one name, one icon and one shortcut.
 */

export type EditorForm = 'prose' | 'poem';

/** Tools that open a small panel instead of acting at once. */
export type PanelId =
  'link' | 'color' | 'highlight' | 'gradient' | 'size' | 'spacing' | 'characters' | 'footnote' | 'shortcuts';

export type CommandGroup =
  'history' | 'style' | 'color' | 'block' | 'align' | 'paragraph' | 'indent' | 'insert' | 'clear' | 'help';

export const GROUP_LABELS: Readonly<Record<CommandGroup, string>> = {
  history: 'Undo and redo',
  style: 'Text style',
  color: 'Color and size',
  block: 'Blocks',
  align: 'Alignment',
  paragraph: 'Paragraph',
  indent: 'Indent',
  insert: 'Insert',
  clear: 'Clear',
  help: 'Help',
};

interface BaseCommand {
  id: string;
  label: string;
  icon: LucideIcon;
  group: CommandGroup;
  /** The forms that offer this tool. Poems get inline tools only, so line layout stays exact. */
  forms: readonly EditorForm[];
  /** The shortcut in TipTap's form, such as "Mod-Shift-h". The editor extension owns the key itself. */
  keys?: string;
  /** More words that find the tool in the / menu and the command menu. */
  keywords?: readonly string[];
  /** Listed in the / menu. */
  slash?: boolean;
  /** Listed in the selection menu. */
  selection?: boolean;
  /** True when the tool's format is on at the cursor. */
  isActive?: (editor: Editor) => boolean;
  /** False when the tool cannot act now, such as Undo with nothing to undo. */
  isEnabled?: (editor: Editor) => boolean;
  /** A character to show in menus in place of the icon, for tools that insert that character. */
  glyph?: string;
}

export interface RunCommand extends BaseCommand {
  kind: 'run';
  /** Acts on the editor. The caller focuses the editor first. */
  run: (editor: Editor) => boolean;
}

export interface PanelCommand extends BaseCommand {
  kind: 'panel';
  panel: PanelId;
}

export type EditorCommand = RunCommand | PanelCommand;

const BOTH: readonly EditorForm[] = ['prose', 'poem'];
const PROSE: readonly EditorForm[] = ['prose'];
const POEM: readonly EditorForm[] = ['poem'];

/** Inserts text at the selection with the marks there, so a symbol typed in bold text is bold too. */
export function insertText(editor: Editor, text: string): boolean {
  return editor
    .chain()
    .command(({ tr }) => {
      tr.insertText(text);
      return true;
    })
    .run();
}

/** Quick inserts for the / menu and the command menu. The full set is in the special characters panel. */
const QUICK_CHARACTERS: readonly (readonly [string, string, string, readonly string[]])[] = [
  ['em-dash', '—', 'Em dash', ['long dash', 'mdash']],
  ['en-dash', '–', 'En dash', ['short dash', 'range', 'ndash']],
  ['ellipsis', '…', 'Ellipsis', ['dots', 'three dots']],
  ['section', '§', 'Section sign', ['paragraph', 'law']],
  ['pilcrow', '¶', 'Pilcrow', ['paragraph mark']],
  ['bullet', '•', 'Bullet', ['dot', 'middle']],
  ['degree', '°', 'Degree sign', ['temperature', 'angle']],
  ['copyright', '©', 'Copyright sign', ['rights']],
  ['nbsp', '\u00a0', 'Non-breaking space', ['space', 'nbsp', 'keep together']],
];

function hanging(editor: Editor): number {
  return Number(editor.getAttributes('poemLine').hanging) || 0;
}

export const COMMANDS: readonly EditorCommand[] = [
  {
    kind: 'run',
    id: 'undo',
    label: 'Undo',
    icon: Undo2,
    group: 'history',
    forms: BOTH,
    keys: 'Mod-z',
    run: (e) => e.commands.undo(),
    isEnabled: (e) => e.can().undo(),
  },
  {
    kind: 'run',
    id: 'redo',
    label: 'Redo',
    icon: Redo2,
    group: 'history',
    forms: BOTH,
    keys: 'Mod-Shift-z',
    run: (e) => e.commands.redo(),
    isEnabled: (e) => e.can().redo(),
  },
  {
    kind: 'run',
    id: 'bold',
    label: 'Bold',
    icon: Bold,
    group: 'style',
    forms: BOTH,
    keys: 'Mod-b',
    keywords: ['strong', 'heavy'],
    slash: true,
    selection: true,
    run: (e) => e.commands.toggleBold(),
    isActive: (e) => e.isActive('bold'),
  },
  {
    kind: 'run',
    id: 'italic',
    label: 'Italic',
    icon: Italic,
    group: 'style',
    forms: BOTH,
    keys: 'Mod-i',
    keywords: ['emphasis', 'slant'],
    slash: true,
    selection: true,
    run: (e) => e.commands.toggleItalic(),
    isActive: (e) => e.isActive('italic'),
  },
  {
    kind: 'run',
    id: 'underline',
    label: 'Underline',
    icon: Underline,
    group: 'style',
    forms: BOTH,
    keys: 'Mod-u',
    slash: true,
    selection: true,
    run: (e) => e.commands.toggleUnderline(),
    isActive: (e) => e.isActive('underline'),
  },
  {
    kind: 'run',
    id: 'strike',
    label: 'Strikethrough',
    icon: Strikethrough,
    group: 'style',
    forms: BOTH,
    keys: 'Mod-Shift-s',
    keywords: ['cross out', 'delete line'],
    slash: true,
    selection: true,
    run: (e) => e.commands.toggleStrike(),
    isActive: (e) => e.isActive('strike'),
  },
  {
    kind: 'run',
    id: 'superscript',
    label: 'Superscript',
    icon: Superscript,
    group: 'style',
    forms: BOTH,
    keys: 'Mod-.',
    keywords: ['raised', 'exponent', 'power'],
    slash: true,
    selection: true,
    run: (e) => e.commands.toggleSuperscript(),
    isActive: (e) => e.isActive('superscript'),
  },
  {
    kind: 'run',
    id: 'subscript',
    label: 'Subscript',
    icon: Subscript,
    group: 'style',
    forms: BOTH,
    keys: 'Mod-,',
    keywords: ['lowered', 'chemistry'],
    slash: true,
    selection: true,
    run: (e) => e.commands.toggleSubscript(),
    isActive: (e) => e.isActive('subscript'),
  },
  {
    kind: 'panel',
    id: 'color',
    label: 'Font color',
    icon: Baseline,
    group: 'color',
    forms: BOTH,
    keywords: ['text color', 'colour', 'ink'],
    panel: 'color',
    slash: true,
    selection: true,
    isActive: (e) => Boolean(e.getAttributes('textStyle').color),
  },
  {
    kind: 'panel',
    id: 'highlight',
    label: 'Highlight',
    icon: Highlighter,
    group: 'color',
    forms: BOTH,
    keywords: ['marker', 'background color'],
    panel: 'highlight',
    slash: true,
    selection: true,
    isActive: (e) => e.isActive('highlight'),
  },
  {
    kind: 'panel',
    id: 'gradient',
    label: 'Gradient and shimmer',
    icon: Sparkles,
    group: 'color',
    forms: BOTH,
    keywords: [
      'metallic',
      'gold',
      'chrome',
      'prismatic',
      'holographic',
      'rainbow',
      'glow',
      'mystical',
      'shimmer',
      'fill',
    ],
    panel: 'gradient',
    slash: true,
    selection: true,
    isActive: (e) => e.isActive('textFill'),
  },
  {
    kind: 'run',
    id: 'highlight-yellow',
    label: 'Yellow highlight',
    icon: Highlighter,
    group: 'color',
    forms: BOTH,
    keys: 'Mod-Shift-h',
    keywords: ['marker'],
    run: (e) => e.commands.toggleHighlight({ color: swatchVar('mark', 'yellow') }),
    isActive: (e) => e.isActive('highlight', { color: swatchVar('mark', 'yellow') }),
  },
  {
    kind: 'panel',
    id: 'size',
    label: 'Font size',
    icon: ALargeSmall,
    group: 'color',
    forms: BOTH,
    keywords: ['bigger', 'smaller', 'large', 'small'],
    panel: 'size',
    slash: true,
    selection: true,
    isActive: (e) => Boolean(e.getAttributes('textStyle').fontSize),
  },
  {
    kind: 'panel',
    id: 'link',
    label: 'Link',
    icon: Link,
    group: 'insert',
    forms: PROSE,
    keywords: ['url', 'web address'],
    panel: 'link',
    slash: true,
    selection: true,
    isActive: (e) => e.isActive('link'),
  },
  {
    kind: 'run',
    id: 'paragraph',
    label: 'Body text',
    icon: Pilcrow,
    group: 'block',
    forms: PROSE,
    keys: 'Mod-Alt-0',
    keywords: ['paragraph', 'normal', 'plain'],
    slash: true,
    run: (e) => e.commands.setParagraph(),
    isActive: (e) => e.isActive('paragraph'),
  },
  {
    kind: 'run',
    id: 'heading-2',
    label: 'Heading 2',
    icon: Heading2,
    group: 'block',
    forms: PROSE,
    keys: 'Mod-Alt-2',
    keywords: ['title', 'h2', 'section'],
    slash: true,
    run: (e) => e.commands.toggleHeading({ level: 2 }),
    isActive: (e) => e.isActive('heading', { level: 2 }),
  },
  {
    kind: 'run',
    id: 'heading-3',
    label: 'Heading 3',
    icon: Heading3,
    group: 'block',
    forms: PROSE,
    keys: 'Mod-Alt-3',
    keywords: ['subtitle', 'h3', 'subsection'],
    slash: true,
    run: (e) => e.commands.toggleHeading({ level: 3 }),
    isActive: (e) => e.isActive('heading', { level: 3 }),
  },
  {
    kind: 'run',
    id: 'quote',
    label: 'Quote',
    icon: Quote,
    group: 'block',
    forms: PROSE,
    keys: 'Mod-Shift-b',
    keywords: ['blockquote', 'epigraph', 'citation'],
    slash: true,
    run: (e) => e.commands.toggleBlockquote(),
    isActive: (e) => e.isActive('blockquote'),
  },
  {
    kind: 'run',
    id: 'bullets',
    label: 'Bulleted list',
    icon: List,
    group: 'block',
    forms: PROSE,
    keys: 'Mod-Shift-8',
    keywords: ['unordered', 'points'],
    slash: true,
    run: (e) => e.commands.toggleBulletList(),
    isActive: (e) => e.isActive('bulletList'),
  },
  {
    kind: 'run',
    id: 'numbers',
    label: 'Numbered list',
    icon: ListOrdered,
    group: 'block',
    forms: PROSE,
    keys: 'Mod-Shift-7',
    keywords: ['ordered', 'steps'],
    slash: true,
    run: (e) => e.commands.toggleOrderedList(),
    isActive: (e) => e.isActive('orderedList'),
  },
  {
    kind: 'run',
    id: 'scene-break',
    label: 'Scene break',
    icon: Hash,
    group: 'insert',
    forms: PROSE,
    keywords: ['separator', 'divider', 'asterism'],
    slash: true,
    run: (e) => e.commands.insertSceneBreak(),
  },
  {
    kind: 'run',
    id: 'align-left',
    label: 'Align left',
    icon: TextAlignStart,
    group: 'align',
    forms: PROSE,
    keys: 'Mod-Shift-l',
    slash: true,
    run: (e) => e.commands.setTextAlign('left'),
    isActive: (e) => e.isActive({ textAlign: 'left' }),
  },
  {
    kind: 'run',
    id: 'align-center',
    label: 'Center',
    icon: TextAlignCenter,
    group: 'align',
    forms: PROSE,
    keys: 'Mod-Shift-e',
    keywords: ['align center', 'middle'],
    slash: true,
    run: (e) => e.commands.setTextAlign('center'),
    isActive: (e) => e.isActive({ textAlign: 'center' }),
  },
  {
    kind: 'run',
    id: 'align-right',
    label: 'Align right',
    icon: TextAlignEnd,
    group: 'align',
    forms: PROSE,
    keys: 'Mod-Shift-r',
    slash: true,
    run: (e) => e.commands.setTextAlign('right'),
    isActive: (e) => e.isActive({ textAlign: 'right' }),
  },
  {
    kind: 'run',
    id: 'align-justify',
    label: 'Justify',
    icon: TextAlignJustify,
    group: 'align',
    forms: PROSE,
    keys: 'Mod-Shift-j',
    keywords: ['align justify', 'block text'],
    slash: true,
    run: (e) => e.commands.setTextAlign('justify'),
    isActive: (e) => e.isActive({ textAlign: 'justify' }),
  },
  {
    kind: 'panel',
    id: 'spacing',
    label: 'Line spacing',
    icon: UnfoldVertical,
    group: 'paragraph',
    forms: PROSE,
    keywords: ['double spacing', 'line height', 'leading'],
    panel: 'spacing',
    slash: true,
    isActive: (e) =>
      Boolean(e.getAttributes('paragraph').lineSpacing ?? e.getAttributes('heading').lineSpacing),
  },
  {
    kind: 'run',
    id: 'first-line-indent',
    label: 'First-line indent',
    icon: TextQuote,
    group: 'paragraph',
    forms: PROSE,
    keywords: ['indent paragraph', 'tab'],
    slash: true,
    run: (e) => e.commands.toggleFirstLineIndent(),
    isActive: (e) => e.getAttributes('paragraph').firstLineIndent === true,
  },
  {
    kind: 'run',
    id: 'drop-cap',
    label: 'Drop cap',
    icon: LetterText,
    group: 'paragraph',
    forms: PROSE,
    keywords: ['initial', 'large first letter', 'chapter opening'],
    slash: true,
    run: (e) => e.commands.toggleDropCap(),
    isActive: (e) => e.getAttributes('paragraph').dropCap === true,
  },
  {
    kind: 'run',
    id: 'hang-less',
    label: 'Less hanging indent',
    icon: IndentDecrease,
    group: 'indent',
    forms: POEM,
    keywords: ['outdent'],
    slash: true,
    run: (e) => e.commands.setHanging(hanging(e) - 1),
    isEnabled: (e) => hanging(e) > 0,
  },
  {
    kind: 'run',
    id: 'hang-more',
    label: 'More hanging indent',
    icon: IndentIncrease,
    group: 'indent',
    forms: POEM,
    keywords: ['indent', 'wrap'],
    slash: true,
    run: (e) => e.commands.setHanging(hanging(e) + 1),
    isEnabled: (e) => hanging(e) < MAX_HANGING_EM,
  },
  {
    kind: 'panel',
    id: 'characters',
    label: 'Special characters',
    icon: Omega,
    group: 'insert',
    forms: BOTH,
    keywords: ['symbol', 'emoji', 'accent', 'greek', 'math', 'arrow', 'currency', 'fraction', 'dash'],
    panel: 'characters',
    slash: true,
  },
  {
    kind: 'run',
    id: 'footnote',
    label: 'Footnote',
    icon: Asterisk,
    group: 'insert',
    forms: BOTH,
    keys: 'Mod-Alt-f',
    keywords: ['note', 'endnote', 'citation', 'reference', 'source'],
    slash: true,
    // Inserts the reference, then opens its note, so the writer types the note at once.
    run: (e) => {
      if (!e.commands.insertFootnote()) return false;
      openPanel({ editor: e, panel: 'footnote', anchor: 'caret' });
      return true;
    },
    isEnabled: (e) => e.can().insertFootnote(),
  },
  ...QUICK_CHARACTERS.map(([id, char, label, keywords]): RunCommand => ({
    kind: 'run',
    id: `char-${id}`,
    label,
    icon: Omega,
    glyph: char === '\u00a0' ? '⍽' : char,
    group: 'insert',
    forms: BOTH,
    keywords: ['character', 'symbol', ...keywords],
    slash: true,
    run: (e) => insertText(e, char),
  })),
  {
    kind: 'run',
    id: 'clear',
    label: 'Clear formatting',
    icon: RemoveFormatting,
    group: 'clear',
    forms: BOTH,
    keys: 'Mod-\\',
    keywords: ['plain', 'remove styles', 'reset'],
    slash: true,
    selection: true,
    run: (e) => e.commands.clearFormatting(),
  },
  {
    kind: 'panel',
    id: 'shortcuts',
    label: 'Keyboard shortcuts',
    icon: Keyboard,
    group: 'help',
    forms: BOTH,
    keys: 'Mod-/',
    keywords: ['keys', 'help', 'cheat sheet'],
    panel: 'shortcuts',
  },
];

const byId = new Map(COMMANDS.map((c) => [c.id, c]));

/** The command with this id. Throws for an unknown id, so a typo fails in tests and not for a writer. */
export function command(id: string): EditorCommand {
  const found = byId.get(id);
  if (!found) throw new Error(`No editor command "${id}".`);
  return found;
}

/** The commands that this form offers, in registry order. */
export function commandsFor(form: EditorForm): EditorCommand[] {
  return COMMANDS.filter((c) => c.forms.includes(form));
}

/** True when `query` finds the command by its label or a keyword. Every query word must match. */
export function matchesCommand(cmd: EditorCommand, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [cmd.label, ...(cmd.keywords ?? [])].join(' ').toLowerCase();
  return words.every((w) => haystack.includes(w));
}

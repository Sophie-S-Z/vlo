import { command, type EditorCommand, type EditorForm } from '../commands/registry';
import { SCRIPT_ROLES } from '../scriptRoles';

/*
 * What the toolbar holds in each form (Phase 19, Tasks A1 and E1): the buttons, the block style menu and
 * the Insert, Format and Review menus. Vlo's own buttons stay until the writer pins their own tools. A
 * pinned tool stays in its menu too, so no tool goes away.
 */

export interface Segment {
  /** Tools shown as buttons. */
  tools: readonly string[];
  /** Under 640 px these buttons hide and show in the More menu instead. */
  wide?: boolean;
}

/** A named group of tools in a menu. */
export interface Section {
  label: string;
  tools: readonly string[];
  /** The section starts with the project's paragraph styles (Phase 19, Task E2). */
  styles?: true;
  /** The section shows only while one of its tools can act, as the table tools do in a table. */
  whenEnabled?: true;
}

export type MenuId = 'insert' | 'format' | 'review';

export interface Layout {
  /** The block style menu. */
  blockMenu: readonly string[];
  segments: readonly Segment[];
  menus: Readonly<Record<MenuId, readonly Section[]>>;
}

const FIND: Section = { label: 'Find', tools: ['find', 'replace'] };
const WORDS: Section = { label: 'Words', tools: ['thesaurus'] };
const LISTEN: Section = { label: 'Listen and speak', tools: ['read-aloud', 'speak'] };
const CHECKS: Section = {
  label: 'Checks',
  tools: ['grammar-check', 'style-check', 'continuity-check', 'track-changes'],
};
const COMMENTS: Section = {
  label: 'Comments and changes',
  tools: ['all-comments', 'accept-all-changes', 'reject-all-changes'],
};
const SHOW: Section = { label: 'Show', tools: ['show-ai-text', 'show-codex-names', 'parts-of-speech'] };
const HELP: Section = { label: 'Help', tools: ['print', 'shortcuts'] };
const REVIEW: readonly Section[] = [FIND, WORDS, LISTEN, CHECKS, COMMENTS, SHOW, HELP];
/** Prose keeps Spacing with its paragraph tools. A poem and a script have no paragraph tools. */
const SPACE: Section = { label: 'Spacing', tools: ['spacing'] };
/** Change case, in every form. Shift-F3 steps through the same cases. */
const CASE: Section = { label: 'Case', tools: ['case-upper', 'case-lower', 'case-title', 'case-sentence'] };

export const LAYOUTS: Readonly<Record<EditorForm, Layout>> = {
  prose: {
    blockMenu: [
      'paragraph',
      'heading-2',
      'heading-3',
      'heading-4',
      'quote',
      'bullets',
      'numbers',
      'checklist',
    ],
    segments: [
      { tools: ['undo', 'redo'] },
      { tools: ['bold', 'italic'] },
      { tools: ['link', 'comment'], wide: true },
    ],
    menus: {
      insert: [
        { label: 'Notes and links', tools: ['footnote', 'item-link'] },
        { label: 'Tables and media', tools: ['table', 'image', 'math', 'math-block'] },
        { label: 'Breaks and characters', tools: ['scene-break', 'page-break', 'characters'] },
      ],
      format: [
        {
          label: 'Table',
          whenEnabled: true,
          tools: [
            'table-row-above',
            'table-row-below',
            'table-column-left',
            'table-column-right',
            'table-delete-row',
            'table-delete-column',
            'table-header-row',
            'table-merge',
            'table-split',
            'table-delete',
          ],
        },
        {
          label: 'Text',
          tools: [
            'underline',
            'strike',
            'font',
            'size',
            'type-play',
            'color',
            'highlight',
            'gradient',
            'superscript',
            'subscript',
            'paint-format',
          ],
        },
        CASE,
        {
          label: 'Paragraph',
          tools: [
            'align-left',
            'align-center',
            'align-right',
            'align-justify',
            'spacing',
            'first-line-indent',
            'drop-cap',
          ],
        },
        { label: 'Paragraph styles', tools: ['style-update', 'style-edit', 'style-new'], styles: true },
        { label: 'Clear', tools: ['clear'] },
      ],
      review: REVIEW,
    },
  },
  poem: {
    blockMenu: [],
    segments: [
      { tools: ['undo', 'redo'] },
      { tools: ['bold', 'italic'], wide: true },
      { tools: ['comment'], wide: true },
    ],
    menus: {
      insert: [
        { label: 'Notes', tools: ['footnote'] },
        { label: 'Media', tools: ['math'] },
        { label: 'Characters', tools: ['characters'] },
      ],
      format: [
        {
          label: 'Text',
          tools: [
            'underline',
            'strike',
            'font',
            'size',
            'type-play',
            'color',
            'highlight',
            'gradient',
            'superscript',
            'subscript',
            'paint-format',
          ],
        },
        CASE,
        SPACE,
        { label: 'Clear', tools: ['clear'] },
      ],
      review: REVIEW,
    },
  },
  script: {
    blockMenu: SCRIPT_ROLES.map((role) => `role-${role}`),
    segments: [
      { tools: ['undo', 'redo'] },
      { tools: ['bold', 'italic'] },
      { tools: ['comment'], wide: true },
    ],
    menus: {
      insert: [{ label: 'Characters', tools: ['characters'] }],
      format: [{ label: 'Text', tools: ['underline'] }, CASE, SPACE, { label: 'Clear', tools: ['clear'] }],
      review: REVIEW,
    },
  },
};

export const MENU_LABELS: Readonly<Record<MenuId, string>> = {
  insert: 'Insert',
  format: 'Format',
  review: 'Review',
};
export const MENU_IDS: readonly MenuId[] = ['insert', 'format', 'review'];

/** The menus with each tool of this template only, such as the private-name tools of a memoir. */
export function withOwnTools(menus: Layout['menus'], own: readonly EditorCommand[]): Layout['menus'] {
  const insert = own.filter((c) => c.group === 'insert').map((c) => c.id);
  const review = own.filter((c) => c.group !== 'insert').map((c) => c.id);
  const add = (sections: readonly Section[], tools: string[]) =>
    tools.length > 0 ? [...sections, { label: 'For this project', tools }] : sections;
  return { insert: add(menus.insert, insert), format: menus.format, review: add(menus.review, review) };
}

/** Vlo's own buttons, in order. Each form shows the ones that it has. */
export const DEFAULT_PINNED: readonly string[] = ['undo', 'redo', 'bold', 'italic', 'link', 'comment'];

/** How many pinned tools a phone shows. The More menu lists the others as quick tools. */
const PHONE_TOOLS = 4;

/** Each tool that a writer can pin in this form: the buttons, the block styles and the menu tools. */
export function pinnableTools(form: EditorForm, menus: Layout['menus'] = LAYOUTS[form].menus): string[] {
  const layout = LAYOUTS[form];
  const ids = new Set([
    ...DEFAULT_PINNED,
    ...layout.segments.flatMap((s) => s.tools),
    ...layout.blockMenu,
    ...MENU_IDS.flatMap((id) => menus[id].flatMap((s) => s.tools)),
  ]);
  return [...ids].filter((id) => command(id).forms.includes(form));
}

/**
 * The writer's pinned tools as buttons, in their order. A separator parts two tools of different groups.
 * After the first `PHONE_TOOLS`, a phone lists the tools in the More menu.
 */
export function pinnedSegments(pinned: readonly string[], offered: ReadonlySet<string>): Segment[] {
  const out: { tools: string[]; wide: boolean }[] = [];
  let count = 0;
  for (const id of pinned) {
    if (!offered.has(id)) continue;
    const wide = count >= PHONE_TOOLS;
    count += 1;
    const last = out.at(-1);
    const lastTool = last?.tools.at(-1);
    if (last && lastTool && last.wide === wide && command(lastTool).group === command(id).group)
      last.tools.push(id);
    else out.push({ tools: [id], wide });
  }
  return out;
}

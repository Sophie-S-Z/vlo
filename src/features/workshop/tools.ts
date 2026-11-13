import type { Template } from '@/lib/db';

/*
 * The tools of the Workshop (Phase 17 decision D1), one screen of deeper tools for each mode. This list is
 * small, so the tabs and the command menu read it without loading the tools.
 */

export type WorkshopToolId =
  'erasure' | 'shovel' | 'echoes' | 'endings' | 'spine' | 'headlines' | 'citations';

export interface WorkshopTool {
  id: WorkshopToolId;
  label: string;
  /** What the tool does, in one line. */
  hint: string;
  /** The modes that have the tool. */
  templates: readonly Template[];
  /** More words for the command menu. */
  keywords: string[];
}

export const WORKSHOP_TOOLS: readonly WorkshopTool[] = [
  {
    id: 'erasure',
    label: 'Erasure',
    hint: 'Keep some words of a text, and the rest goes. The kept words stay where they stood.',
    templates: ['poetry'],
    keywords: ['blackout', 'found poem', 'erasure poem', 'cut', 'source'],
  },
  {
    id: 'shovel',
    label: 'Golden shovel',
    hint: 'Each word of a line that you borrow ends one line of your poem, in order.',
    templates: ['poetry'],
    keywords: ['golden shovel', 'end words', 'borrowed line', 'homage', 'form'],
  },
  {
    id: 'echoes',
    label: 'Echoes',
    hint: 'The words that come back from poem to poem: the images that tie the collection.',
    templates: ['poetry'],
    keywords: ['motifs', 'images', 'repeated words', 'themes', 'collection'],
  },
  {
    id: 'endings',
    label: 'Line endings',
    hint: 'Where each line ends: on a pause or running on, on a strong word or a small one.',
    templates: ['poetry'],
    keywords: ['line breaks', 'enjambment', 'end-stopped', 'lineation'],
  },
  {
    id: 'spine',
    label: 'Spine',
    hint: 'The first sentence of each paragraph, in order. Together they should make the argument.',
    templates: ['essay', 'article', 'research'],
    keywords: ['topic sentences', 'outline', 'argument', 'reverse outline', 'structure'],
  },
  {
    id: 'headlines',
    label: 'Headlines',
    hint: 'Try headline ideas side by side, with their length, and pick one.',
    templates: ['article'],
    keywords: ['title', 'headline', 'seo', 'subject line'],
  },
  {
    id: 'citations',
    label: 'Citation check',
    hint: 'How many times the paper cites each source, and the sources that it never cites.',
    templates: ['research'],
    keywords: ['references', 'sources', 'uncited', 'bibliography', 'works cited'],
  },
];

/** The Workshop tools of a project, in list order. Novels, memoirs, scripts and open writing have none. */
export function workshopTools(templates: readonly Template[]): WorkshopTool[] {
  return WORKSHOP_TOOLS.filter((tool) => tool.templates.some((t) => templates.includes(t)));
}

/** The line under Workshop in the More menu. */
export function workshopHint(templates: readonly Template[]): string {
  const tools = workshopTools(templates).map((t) => t.label.toLowerCase());
  const list =
    tools.length <= 1 ? (tools[0] ?? '') : `${tools.slice(0, -1).join(', ')} and ${tools.at(-1) ?? ''}`;
  return list.replace(/^./, (c) => c.toUpperCase());
}

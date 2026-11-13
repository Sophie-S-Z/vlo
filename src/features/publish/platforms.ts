import type { WebOptions } from '@/features/export/web';

/*
 * The platforms of the Publish dialog (Phase 17 decision P1). Most writing platforms have no free API that a
 * browser can call (docs/plans/phase-17.md, Task P0), so Vlo makes a copy that each editor keeps as it is:
 * rich text with only the tags that the editor keeps, the HTML as text for a site with an HTML field, or
 * Markdown. Each platform lists the steps to paste the copy, and what the platform changes.
 */

export type PlatformId =
  | 'substack'
  | 'medium'
  | 'wordpress'
  | 'ghost'
  | 'beehiiv'
  | 'linkedin'
  | 'tumblr'
  | 'ao3'
  | 'wattpad'
  | 'royalroad'
  | 'devto'
  | 'hashnode'
  | 'writeas'
  | 'reddit'
  | 'markdown';

export type PlatformGroup = 'newsletter' | 'fiction' | 'markdown';

export const GROUP_LABELS: Readonly<Record<PlatformGroup, string>> = {
  newsletter: 'Newsletters and blogs',
  fiction: 'Fiction and fan sites',
  markdown: 'Markdown editors',
};

export interface Platform {
  id: PlatformId;
  name: string;
  group: PlatformGroup;
  /**
   * "rich" goes on the clipboard as rich text with a plain text copy beside it. "html" goes as the HTML
   * itself, for a site with an HTML field. "markdown" goes as Markdown text.
   */
  body: 'rich' | 'html' | 'markdown';
  /** The headings and alignment that the editor keeps. Only "rich" and "html" use it. */
  web?: WebOptions;
  /** Notes as Markdown footnotes ("gfm"), or a numbered list at the end. Only "markdown" uses it. */
  notes?: 'gfm' | 'list';
  /** The name of the platform's second field under the title, such as "Subtitle", if it has one. */
  subtitle?: string;
  /** The Markdown starts with "# Title", because the platform takes the title from the first line. */
  titleInBody?: true;
  /** The most characters that the platform takes, where it says so. */
  limits?: { title?: number; body?: number };
  /** The steps in the platform, in order. */
  steps: string[];
  /** What the platform changes or leaves out. */
  changes: string[];
}

const IMAGES =
  'A paste takes no image. Each image stays as a line such as “[Image: …]”, so you can upload it there.';
const NOTES_AT_END = 'Your footnotes become a numbered list at the end.';

/** Only two heading sizes, as in Medium: a part is the large one, and everything else the small one. */
const twoSizes =
  (large: 'h2' | 'h3', small: 'h3' | 'h4') =>
  (level: number): 'h3' | 'h4' | 'h2' =>
    level <= 1 ? large : small;

/** Substack, the platform that the dialog starts at. */
export const DEFAULT_PLATFORM: Platform = {
  id: 'substack',
  name: 'Substack',
  group: 'newsletter',
  body: 'rich',
  web: { align: false },
  subtitle: 'Subtitle',
  steps: [
    'In Substack, choose Create, then New post.',
    'Choose Copy the title in Vlo, and paste it in the title line.',
    'Choose Copy the subtitle, and paste it in the subtitle line.',
    'Choose Copy the text, click the body of the post, and paste.',
    'Choose Preview to check the post, then Continue to send it or save it as a draft.',
  ],
  changes: [
    'Substack has no centered text, so each line starts at the left.',
    `${NOTES_AT_END} To make Substack footnotes, use its footnote button.`,
    IMAGES,
  ],
};

export const PLATFORMS: readonly Platform[] = [
  DEFAULT_PLATFORM,
  {
    id: 'medium',
    name: 'Medium',
    group: 'newsletter',
    body: 'rich',
    web: { heading: twoSizes('h3', 'h4'), align: false },
    subtitle: 'Subtitle',
    steps: [
      'In Medium, choose Write.',
      'Choose Copy the title in Vlo, and paste it in the Title line.',
      'Press Enter. Choose Copy the subtitle, paste it, then choose the small T in the menu over the line.',
      'Press Enter, choose Copy the text, and paste.',
      'Choose Publish to add topics and publish, or leave the story as a draft.',
    ],
    changes: [
      'Medium has two heading sizes. A part gets the large heading, and every other heading the small one.',
      'Medium keeps no underline, superscript or centered text.',
      NOTES_AT_END,
      IMAGES,
    ],
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    group: 'newsletter',
    body: 'rich',
    subtitle: 'Excerpt',
    steps: [
      'In WordPress, choose Posts, then Add New Post.',
      'Choose Copy the title in Vlo, and paste it in Add title.',
      'Choose Copy the text, click under the title, and paste. Each paragraph and heading becomes a block.',
      'To add the excerpt, open the post settings, choose Excerpt, and paste the excerpt.',
      'Choose Save draft, or Publish.',
      'For a site of your own, you can also download a WordPress import file. In WordPress, choose Tools, Import, WordPress, and pick the file. The post comes in as a draft.',
    ],
    changes: [NOTES_AT_END, IMAGES],
  },
  {
    id: 'ghost',
    name: 'Ghost',
    group: 'newsletter',
    body: 'rich',
    subtitle: 'Excerpt',
    steps: [
      'In Ghost, choose Posts, then New post.',
      'Choose Copy the title in Vlo, and paste it in Post title.',
      'Choose Copy the text, click the body, and paste.',
      'To add the excerpt, open the post settings and paste it in Excerpt.',
      'Choose Preview, then Publish, or leave the post as a draft.',
    ],
    changes: [
      'Ghost has no centered text in a paste, so each line starts at the left.',
      NOTES_AT_END,
      IMAGES,
    ],
  },
  {
    id: 'beehiiv',
    name: 'Beehiiv',
    group: 'newsletter',
    body: 'rich',
    web: { align: false },
    subtitle: 'Subtitle',
    steps: [
      'In Beehiiv, choose Start writing.',
      'Choose Copy the title in Vlo, and paste it in the title.',
      'Choose Copy the subtitle, and paste it in the subtitle.',
      'Choose Copy the text, click the body, and paste.',
      'Choose Continue to set the audience and send it, or keep it as a draft.',
    ],
    changes: [NOTES_AT_END, IMAGES],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn article',
    group: 'newsletter',
    body: 'rich',
    web: { heading: twoSizes('h2', 'h3'), align: false },
    steps: [
      'In LinkedIn, choose Write article.',
      'Choose Copy the title in Vlo, and paste it in Title.',
      'Choose Copy the text, click Write here, and paste.',
      'Choose Next to add a note for your feed, then Publish.',
    ],
    changes: [
      'A LinkedIn article has two heading sizes. A part gets the large heading, and every other heading the small one.',
      NOTES_AT_END,
      IMAGES,
    ],
  },
  {
    id: 'tumblr',
    name: 'Tumblr',
    group: 'newsletter',
    body: 'rich',
    web: { heading: () => 'h2', align: false },
    steps: [
      'In Tumblr, choose Create, then Text.',
      'Choose Copy the title in Vlo, and paste it in Title.',
      'Choose Copy the text, click the body, and paste.',
      'Add tags, then choose Post now, or Save as draft from the menu.',
    ],
    changes: [
      'Tumblr has one heading size for a paste, so every heading looks the same.',
      NOTES_AT_END,
      IMAGES,
    ],
  },
  {
    id: 'ao3',
    name: 'AO3',
    group: 'fiction',
    body: 'html',
    limits: { title: 255, body: 500_000 },
    steps: [
      'In AO3, choose Post, then New Work. For a new chapter of a work, choose Add Chapter.',
      'Choose Copy the title in Vlo, and paste it in Work Title or Chapter Title.',
      'Over the Work Text box, choose HTML. Choose Copy the HTML, and paste it in the box.',
      'Choose Preview, then Post, or Save As Draft.',
    ],
    changes: ['AO3 keeps the HTML as it is, with centered lines and indents.', NOTES_AT_END, IMAGES],
  },
  {
    id: 'wattpad',
    name: 'Wattpad',
    group: 'fiction',
    body: 'rich',
    web: { heading: () => 'strong' },
    steps: [
      'In Wattpad, choose Write, then open your story, or Create a new story.',
      'Choose New Part. Choose Copy the title in Vlo, and paste it in Untitled Part.',
      'Choose Copy the text, click the body of the part, and paste.',
      'Choose Save, then Publish when the part is ready.',
    ],
    changes: ['Wattpad has no headings in a part. Each heading becomes a bold line.', NOTES_AT_END, IMAGES],
  },
  {
    id: 'royalroad',
    name: 'Royal Road',
    group: 'fiction',
    body: 'rich',
    steps: [
      'In Royal Road, open the Author Dashboard, choose your fiction, then Add Chapter.',
      'Choose Copy the title in Vlo, and paste it in Title.',
      'Choose Copy the text, click the Content box, and paste.',
      'Choose Publish Chapter, or Save as Draft.',
    ],
    changes: [NOTES_AT_END, IMAGES],
  },
  {
    id: 'devto',
    name: 'DEV',
    group: 'markdown',
    body: 'markdown',
    notes: 'list',
    steps: [
      'In DEV, choose Create Post.',
      'Choose Copy the title in Vlo, and paste it in the title.',
      'Choose Copy the Markdown, click the body, and paste.',
      'Add up to four tags, then choose Save draft or Publish.',
    ],
    changes: [NOTES_AT_END, IMAGES],
  },
  {
    id: 'hashnode',
    name: 'Hashnode',
    group: 'markdown',
    body: 'markdown',
    notes: 'list',
    subtitle: 'Subtitle',
    steps: [
      'In Hashnode, choose Write.',
      'Choose Copy the title in Vlo, and paste it in the title.',
      'To add the subtitle, choose Add subtitle, then Copy the subtitle, and paste.',
      'Choose Copy the Markdown, click the body, and paste.',
      'Choose Publish, or leave the post as a draft.',
    ],
    changes: [NOTES_AT_END, IMAGES],
  },
  {
    id: 'writeas',
    name: 'Write.as',
    group: 'markdown',
    body: 'markdown',
    notes: 'list',
    titleInBody: true,
    steps: [
      'In Write.as, start a new post.',
      'Choose Copy the Markdown, and paste. The first line, which starts with #, becomes the title.',
      'Choose Publish.',
    ],
    changes: [NOTES_AT_END, IMAGES],
  },
  {
    id: 'reddit',
    name: 'Reddit',
    group: 'markdown',
    body: 'markdown',
    notes: 'list',
    limits: { title: 300, body: 40_000 },
    steps: [
      'In Reddit, choose Create, then pick the community.',
      'Choose Copy the title in Vlo, and paste it in Title.',
      'In the body, choose Switch to Markdown Editor. Choose Copy the Markdown, and paste.',
      'Choose Post.',
    ],
    changes: [NOTES_AT_END, IMAGES],
  },
  {
    id: 'markdown',
    name: 'Another Markdown editor',
    group: 'markdown',
    body: 'markdown',
    notes: 'gfm',
    steps: [
      'Choose Copy the Markdown, and paste it in the editor. Obsidian, GitHub, a Ghost Markdown card and most static site tools take it.',
      'Paste the title where the editor asks for it.',
    ],
    changes: ['Footnotes use the [^1] form that GitHub and Obsidian show.', IMAGES],
  },
];

export function platformById(id: string): Platform | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

import type { CiteStyle, Template } from '@/lib/db';
import type { StarterItem } from './templates';

/*
 * Structures to start from (Phase 17 decision M2). A structure is the binder of a new project in a mode:
 * its sections, each with a guide line that says what the section is for and a suggested word range. The
 * guide and the range show above the text and never go in an export, so the writer's page stays their own.
 * A structure can also set the citation style that its field uses most.
 */

export interface Structure {
  id: string;
  template: Template;
  label: string;
  description: string;
  items: StarterItem[];
  /** The citation style for the project, when the field has one it uses most. */
  citeStyle?: CiteStyle;
}

const references = (title = 'References'): StarterItem => ({ kind: 'page', title, role: 'references' });

const page = (title: string, guide: string, min?: number, max?: number): StarterItem => ({
  kind: 'page',
  title,
  guide,
  ...(min !== undefined || max !== undefined
    ? { words: { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) } }
    : {}),
});

const ALL: readonly Structure[] = [
  /* ------------------------------------------------------------------ Research paper */
  {
    id: 'imrad',
    template: 'research',
    label: 'Research paper (IMRaD)',
    description: 'Abstract, Introduction, Methods, Results, Discussion, Conclusion and References.',
    citeStyle: 'apa',
    items: [
      page(
        'Abstract',
        'One paragraph: the question, the method, the main result and what it means. No citations.',
        150,
        250,
      ),
      page(
        'Introduction',
        'Move from the wide problem to what is known, then to the gap, then to your question or hypothesis.',
        400,
        900,
      ),
      page(
        'Methods',
        'Say what you did, in the past tense, with enough detail that another researcher can do it again.',
        400,
        1200,
      ),
      page(
        'Results',
        'Report what you found, with numbers, tables and figures. Save what it means for the Discussion.',
        400,
        1200,
      ),
      page(
        'Discussion',
        'What the results mean, how they fit what others found, the limits of the study, and next steps.',
        600,
        1500,
      ),
      page('Conclusion', 'The answer to your question in plain words, and why it matters.', 150, 400),
      references(),
    ],
  },
  {
    id: 'literature-review',
    template: 'research',
    label: 'Literature review',
    description: 'A map of what a field knows, grouped by theme, with the gaps it leaves.',
    citeStyle: 'apa',
    items: [
      page('Abstract', 'The scope of the review, how you found the sources, and the main themes.', 150, 250),
      page(
        'Introduction',
        'The topic, why it matters now, and the question that the review answers. Name your search method.',
        300,
        700,
      ),
      {
        kind: 'part',
        title: 'Themes',
        children: [
          page('Theme 1', 'Group studies that agree. Compare them. Do not list them one by one.'),
          page('Theme 2', 'Where do the studies disagree, and why? Look at methods, samples and dates.'),
          page('Theme 3', 'A newer line of work, or a method that changed the field.'),
        ],
      },
      page('Gaps and future research', 'What no study has answered yet, and how to answer it.', 200, 600),
      page('Conclusion', 'What the field knows, in a few sentences, and what it does not.', 150, 400),
      references(),
    ],
  },
  {
    id: 'lab-report',
    template: 'research',
    label: 'Lab report',
    description: 'Aim, materials, procedure, results and analysis of an experiment.',
    citeStyle: 'apa',
    items: [
      page('Abstract', 'The aim, the method, the key result and the conclusion, in one paragraph.', 100, 200),
      page('Introduction', 'The theory behind the experiment, and the aim or hypothesis.', 200, 500),
      page('Materials and methods', 'The equipment, the materials, and each step in order.', 200, 600),
      page('Results', 'The data, with units and tables. Point out trends, and do not explain them yet.'),
      page('Discussion', 'Explain the trends, compare them with the theory, and name the sources of error.'),
      page('Conclusion', 'Did the results support the hypothesis? One short paragraph.', 75, 200),
      references(),
      page('Appendix', 'Raw data, long calculations and extra figures.'),
    ],
  },
  {
    id: 'thesis',
    template: 'research',
    label: 'Thesis or capstone',
    description: 'A long study in chapters, from the abstract to the appendices.',
    citeStyle: 'apa',
    items: [
      page('Abstract', 'The problem, the method, the findings and the contribution, on one page.', 250, 350),
      page('Acknowledgements', 'Thank the people and funds that helped the work.'),
      page('Introduction', 'The problem, the questions, why they matter, and a map of the chapters.'),
      page('Literature review', 'What the field knows, by theme, and the gap that this study fills.'),
      page('Methodology', 'The design, the data, the analysis, and why each choice fits the question.'),
      page('Findings', 'What the study found, question by question.'),
      page('Discussion', 'What the findings mean, the limits, and what follows from them.'),
      page('Conclusion', 'The answers, the contribution, and the next research.'),
      references(),
      page('Appendices', 'Instruments, consent forms, raw data and long tables.'),
    ],
  },
  {
    id: 'abstract',
    template: 'research',
    label: 'Research abstract',
    description: 'One structured abstract for a conference or a journal.',
    citeStyle: 'apa',
    items: [
      page(
        'Abstract',
        'Background: why the question matters. Objective: the question. Methods: what you did. Results: the main numbers. Conclusion: what they mean.',
        150,
        300,
      ),
      page('Keywords', 'Three to six words or short phrases that a search will use.', 3, 12),
    ],
  },
  {
    id: 'annotated-bibliography',
    template: 'research',
    label: 'Annotated bibliography',
    description: 'Each source with a short summary and an evaluation.',
    citeStyle: 'mla',
    items: [
      page('Introduction', 'The topic and how you chose the sources.', 100, 300),
      page(
        'Annotations',
        'For each source: the full reference, then a summary, how good the source is, and how you will use it.',
      ),
      references('Works Cited'),
    ],
  },
  {
    id: 'blank-paper',
    template: 'research',
    label: 'Blank paper',
    description: 'One section and a reference list.',
    items: [page('Section 1', 'Write here. Add sections from the binder.'), references()],
  },

  /* ------------------------------------------------------------------ Essay */
  {
    id: 'five-paragraph',
    template: 'essay',
    label: 'Five-paragraph essay',
    description: 'An introduction with a thesis, three body paragraphs and a conclusion.',
    citeStyle: 'mla',
    items: [
      page(
        'Introduction',
        'A hook, some context, and the thesis: your claim and its three reasons, in one sentence.',
        80,
        150,
      ),
      page(
        'Body paragraph 1',
        'Topic sentence (reason 1), evidence, explanation, a link to the thesis.',
        100,
        200,
      ),
      page(
        'Body paragraph 2',
        'Topic sentence (reason 2), evidence, explanation, a link to the thesis.',
        100,
        200,
      ),
      page(
        'Body paragraph 3',
        'Topic sentence (reason 3), evidence, explanation, a link to the thesis.',
        100,
        200,
      ),
      page(
        'Conclusion',
        'Restate the thesis in new words, and say what the reader should take away.',
        80,
        150,
      ),
    ],
  },
  {
    id: 'argumentative',
    template: 'essay',
    label: 'Argumentative essay',
    description: 'A claim, the evidence for it, the best case against it, and your answer.',
    citeStyle: 'mla',
    items: [
      page('Introduction', 'The issue, why it matters, and your claim in one clear sentence.', 100, 250),
      page('Background', 'What the reader must know to follow the argument. Define your terms.', 100, 300),
      page('Claim 1', 'Your strongest reason, with evidence and a citation.', 150, 400),
      page('Claim 2', 'Your next reason, with evidence and a citation.', 150, 400),
      page(
        'Counterargument and rebuttal',
        'State the best case against you fairly, then show why your claim still holds.',
        150,
        400,
      ),
      page('Conclusion', 'What follows if the reader agrees. A call to act or to think again.', 100, 250),
      references('Works Cited'),
    ],
  },
  {
    id: 'personal-essay',
    template: 'essay',
    label: 'Personal essay',
    description: 'A true story from your life, and what it taught you.',
    items: [
      page('Opening scene', 'Start inside a moment: a place, a sound, a line of speech.'),
      page('Moments', 'Two or three moments that turn the story. Show them; do not sum them up.'),
      page('Reflection', 'What you know now that you did not know then.'),
    ],
  },
  {
    id: 'braided-essay',
    template: 'essay',
    label: 'Braided essay',
    description: 'Three strands that alternate, until they meet at the end.',
    items: [
      page('Strand A, part 1', 'The main story. Stop at a point of tension.'),
      page('Strand B, part 1', 'A second thread: a fact, a history or a myth that echoes strand A.'),
      page('Strand C, part 1', 'A third thread: an object, a word or a list.'),
      page('Strand A, part 2', 'Go back to the main story. Let it carry what the other strands said.'),
      page('Strand B, part 2', 'The second thread again, now closer to the main story.'),
      page('Where the strands meet', 'One image or moment that holds all three strands.'),
    ],
  },
  {
    id: 'compare-contrast',
    template: 'essay',
    label: 'Compare and contrast',
    description: 'Two subjects side by side, and what the comparison shows.',
    citeStyle: 'mla',
    items: [
      page('Introduction', 'The two subjects, why to compare them, and your thesis about them.', 80, 200),
      page('Subject A', 'The points of comparison for the first subject, in a fixed order.', 150, 400),
      page('Subject B', 'The same points for the second subject, in the same order.', 150, 400),
      page(
        'What the comparison shows',
        'The likenesses and the differences that matter most, and why.',
        150,
        400,
      ),
      page('Conclusion', 'What we see now that we did not see in either subject alone.', 80, 200),
      references('Works Cited'),
    ],
  },
  {
    id: 'literary-analysis',
    template: 'essay',
    label: 'Literary analysis',
    description: 'A close reading of a text, with quotes as evidence.',
    citeStyle: 'mla',
    items: [
      page('Introduction', 'The work, the author, and your interpretation as a thesis.', 100, 200),
      page('Close reading 1', 'A short quote, what it says, and how its words make the meaning.', 150, 350),
      page('Close reading 2', 'A second passage that builds on the first.', 150, 350),
      page(
        'Close reading 3',
        'A passage that seems to go against your thesis, and why it does not.',
        150,
        350,
      ),
      page('Conclusion', 'What your reading adds to how we see the whole work.', 100, 200),
      references('Works Cited'),
    ],
  },
  {
    id: 'application-essay',
    template: 'essay',
    label: 'College application essay',
    description: 'One personal essay of at most 650 words, as the Common App asks.',
    items: [
      page(
        'Essay',
        'One story only you can tell. Show a change in you, end on who you are now, and keep it under 650 words.',
        250,
        650,
      ),
    ],
  },

  /* ------------------------------------------------------------------ Article */
  {
    id: 'blog-post',
    template: 'article',
    label: 'Post or newsletter',
    description: 'A headline, a hook and a body, ready for Substack, Medium, Ghost or WordPress.',
    items: [
      page(
        'Post',
        'Hook the reader in the first two lines. Use short paragraphs and subheadings. End with one clear next step.',
        600,
        1500,
      ),
    ],
  },
  {
    id: 'news',
    template: 'article',
    label: 'News story',
    description: 'The inverted pyramid: the most important facts first.',
    items: [
      page('Lede', 'Who, what, when and where, in one sentence of under 35 words.', 20, 45),
      page('Nut graf', 'Why this matters now, in one paragraph.', 40, 120),
      page('Body', 'Details, quotes and context, from the most important to the least.', 250, 800),
      page('Background', 'What came before. A reader can stop before this part.', 0, 250),
    ],
  },
  {
    id: 'feature',
    template: 'article',
    label: 'Feature',
    description: 'A scene, a nut graf, the story in depth, and an ending that echoes the start.',
    items: [
      page('Opening scene', 'Put the reader in a place with a person, doing something.', 100, 300),
      page('Nut graf', 'What the story is really about, and why to read on.', 50, 150),
      page(
        'Body',
        'Alternate scenes, facts and quotes. Each section ends with a reason to keep reading.',
        800,
        2500,
      ),
      page('Ending', 'Go back to the opening scene, changed by what the reader learned.', 80, 250),
    ],
  },
  {
    id: 'how-to',
    template: 'article',
    label: 'How-to guide',
    description: 'A task, what you need, numbered steps and fixes for common problems.',
    items: [
      page('Introduction', 'What the reader can do at the end, and how long it takes.', 50, 150),
      page('What you need', 'A list of tools, materials and skills.', 20, 150),
      page('Steps', 'One action for each numbered step. Start each step with a verb.', 200, 1200),
      page('Troubleshooting', 'Each common problem and its fix.', 50, 400),
      page('Next steps', 'Where the reader can go from here.', 30, 150),
    ],
  },
  {
    id: 'op-ed',
    template: 'article',
    label: 'Op-ed',
    description: 'One opinion, argued hard, in about 750 words.',
    items: [
      page('Hook', 'A news peg: why this matters this week.', 40, 120),
      page('Argument', 'Your opinion in one sentence, then your reasons, with facts.', 300, 450),
      page('Counterargument', 'The best case against you, and your answer.', 80, 150),
      page('Call to action', 'What the reader, or the people in power, should do.', 40, 120),
    ],
  },
  {
    id: 'interview',
    template: 'article',
    label: 'Interview (Q&A)',
    description: 'An introduction, then questions and answers.',
    items: [
      page('Introduction', 'Who the person is, and why their answers matter now.', 80, 250),
      page('Questions and answers', 'Put each question in bold. Cut the answers to their best lines.'),
    ],
  },
  {
    id: 'listicle',
    template: 'article',
    label: 'List article',
    description: 'An introduction and numbered items, each with a reason.',
    items: [
      page('Introduction', 'The promise of the list, and who it is for.', 50, 150),
      page('Item 1', 'A heading for the item, then why it is on the list.', 60, 200),
      page('Item 2', 'A heading for the item, then why it is on the list.', 60, 200),
      page('Item 3', 'A heading for the item, then why it is on the list.', 60, 200),
      page('Item 4', 'A heading for the item, then why it is on the list.', 60, 200),
      page('Item 5', 'A heading for the item, then why it is on the list.', 60, 200),
      page('Conclusion', 'The one thing to remember.', 30, 120),
    ],
  },
];

/**
 * The sections of an essay or an article that keep their title as a heading in an export. Every other
 * section of these modes has a working title, such as "Lede" or "Body paragraph 1", so the sections read
 * as one piece. A research paper keeps every heading.
 */
const HEADINGS: Readonly<Record<string, readonly string[]>> = {
  'how-to': ['What you need', 'Steps', 'Troubleshooting', 'Next steps'],
  listicle: ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5'],
};

/** An essay or an article reads as one piece, so a new section there has a working title too. */
export function sectionsHaveWorkingTitles(templates: readonly Template[]): boolean {
  return templates.some((t) => t === 'essay' || t === 'article');
}

function withWorkingTitles(structure: Structure): Structure {
  if (!sectionsHaveWorkingTitles([structure.template])) return structure;
  const keep = HEADINGS[structure.id] ?? [];
  const mark = (item: StarterItem): StarterItem => ({
    ...item,
    ...(item.kind === 'page' && !item.role && !keep.includes(item.title)
      ? { workingTitle: true as const }
      : {}),
    ...(item.children ? { children: item.children.map(mark) } : {}),
  });
  return { ...structure, items: structure.items.map(mark) };
}

export const STRUCTURES: readonly Structure[] = ALL.map(withWorkingTitles);

/** The structures of a template, in menu order. The first one is the default. */
export function structuresOf(template: Template): Structure[] {
  return STRUCTURES.filter((s) => s.template === template);
}

/** A structure by id, only when it belongs to the template. */
export function structureFor(template: Template, id: string | undefined): Structure | undefined {
  return id === undefined ? undefined : STRUCTURES.find((s) => s.id === id && s.template === template);
}

/**
 * Sections that the binder can add to any project of the new modes (Phase 17 decision M2), such as an
 * Abstract or a reference list. The same guides as the structures.
 */
export const SECTION_LIBRARY: readonly StarterItem[] = [
  page(
    'Abstract',
    'The question, the method, the main result and what it means, in one paragraph.',
    150,
    250,
  ),
  page('Introduction', 'The problem, what is known, the gap, and your question or thesis.'),
  page('Literature review', 'What the field knows, by theme, and the gap that your work fills.'),
  page('Methods', 'What you did, in enough detail that another person can do it again.'),
  page('Results', 'What you found, with numbers. Save what it means for the Discussion.'),
  page('Discussion', 'What the results mean, the limits, and the next steps.'),
  page('Counterargument', 'The best case against your claim, and your answer.'),
  page('Conclusion', 'What the piece showed, and why it matters.'),
  page('Acknowledgements', 'Thank the people and funds that helped the work.'),
  references('References'),
  references('Works Cited'),
  references('Bibliography'),
  page('Appendix', 'Raw data, long tables and extra figures.'),
];

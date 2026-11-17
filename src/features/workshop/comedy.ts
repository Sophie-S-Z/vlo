/*
 * The comedy tools of the Workshop.
 *
 * - Punch words: the last sentence of each joke, with its last word apart. A joke gets its laugh on the
 *   word that reveals it, so that word goes last. A weak last word shows at a glance.
 * - Premise machine: a random "what if" from two short lists, for a blank page.
 */

export interface Punch {
  /** The last sentence of the joke, without its last word. */
  lead: string;
  /** The last word, with its end mark. */
  word: string;
}

export interface PunchSection {
  id: string;
  title: string;
  punches: Punch[];
}

/** The last sentence of a paragraph. */
function lastSentence(paragraph: string, language?: string): string {
  const text = paragraph.replace(/\s+/g, ' ').trim();
  try {
    const parts = [...new Intl.Segmenter(language, { granularity: 'sentence' }).segment(text)];
    return parts.at(-1)?.segment.trim() ?? text;
  } catch {
    return /[^.!?]*[.!?]*$/.exec(text)?.[0].trim() ?? text;
  }
}

/** The punch of each joke, from the stored plain text of each bit, where a blank line ends a joke. */
export function punchWords(
  sections: readonly { id: string; title: string; text: string }[],
  language?: string,
): PunchSection[] {
  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    punches: section.text
      .split(/\n\s*\n/)
      .map((p) => lastSentence(p, language))
      .filter((s) => s !== '')
      .map((sentence) => {
        const cut = sentence.lastIndexOf(' ');
        return cut < 0
          ? { lead: '', word: sentence }
          : { lead: sentence.slice(0, cut), word: sentence.slice(cut + 1) };
      }),
  }));
}

const WHO = [
  'A pirate',
  'Your grandmother',
  'A very tired vampire',
  'A golden retriever',
  'The last dinosaur',
  'A robot vacuum',
  'A medieval knight',
  'Your dentist',
  'A ghost with no sense of direction',
  'A goose',
  'An overconfident pigeon',
  'A wizard on a budget',
  'A haunted toaster',
  'Shakespeare',
  'A cat with a law degree',
  'An alien tourist',
] as const;

const WHAT = [
  'became a life coach',
  'joined a book club',
  'started a podcast',
  'had to return a sofa to IKEA',
  'got stuck in a group chat',
  'went on a reality show',
  'opened a food truck',
  'tried to cancel a gym membership',
  'ran for mayor',
  'had to explain the internet',
  'wrote a strongly worded letter',
  'went to a job interview',
  'planned a surprise party',
  'learned to do stand-up',
  'became an influencer',
  'tried to assemble flat-pack furniture',
] as const;

/** A random premise, such as "What if a goose ran for mayor?". `random` gives a number from 0 to 1. */
export function premise(random: () => number = Math.random): string {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length) % list.length] as T;
  const who = pick(WHO);
  const lower = who === 'Shakespeare' ? who : who.charAt(0).toLowerCase() + who.slice(1);
  return `What if ${lower} ${pick(WHAT)}?`;
}

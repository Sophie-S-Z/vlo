import { plainChars, type Span } from '../text';

/*
 * Signs of machine writing that a pattern can find, from the Humanizer and humanize-writing skills (based
 * on Wikipedia's "Signs of AI writing" guide) and from common phrases in machine fiction. Each sign is one
 * input of the detector model, and the report marks each match so the writer can see it. A sign is a habit,
 * not proof: people use these words too, so the model learns how much each group counts.
 */

export type TellGroup =
  | 'vocabulary'
  | 'corporate'
  | 'transition'
  | 'hedge'
  | 'intensifier'
  | 'opener'
  | 'crutch'
  | 'copula'
  | 'cliche'
  | 'fiction'
  | 'tail'
  | 'negation'
  | 'contrast'
  | 'triplet'
  | 'dash';

export const TELL_GROUPS: readonly TellGroup[] = [
  'vocabulary',
  'corporate',
  'transition',
  'hedge',
  'intensifier',
  'opener',
  'crutch',
  'copula',
  'cliche',
  'fiction',
  'tail',
  'negation',
  'contrast',
  'triplet',
  'dash',
];

/** A name and a fix for each group, for the report. */
export const TELL_INFO: Readonly<Record<TellGroup, { label: string; advice: string }>> = {
  vocabulary: {
    label: 'Words that AI models overuse',
    advice: 'Use the plain word that you would say out loud.',
  },
  corporate: { label: 'Business verbs', advice: 'Use a simple verb, such as "use" for "leverage".' },
  transition: {
    label: 'Stock transitions',
    advice: 'Remove the transition, or say how the two ideas connect.',
  },
  hedge: { label: 'Hedge words', advice: 'State the claim once, at the strength that you can support.' },
  intensifier: { label: 'Filler intensifiers', advice: 'Remove the word, or use a stronger noun or verb.' },
  opener: {
    label: 'Throat-clearing openers',
    advice: 'Start with the point.',
  },
  crutch: {
    label: 'Setup and payoff phrases',
    advice: 'Say the point directly, without the setup.',
  },
  copula: { label: '"Serves as" for "is"', advice: 'Use "is" or "has" when that is the true verb.' },
  cliche: { label: 'Inflated phrases', advice: 'Replace the phrase with the specific fact.' },
  fiction: {
    label: 'Stock phrases of machine fiction',
    advice: 'Show the specific detail that this character sees or does.',
  },
  tail: {
    label: 'Trailing "-ing" phrases that claim importance',
    advice: 'Remove the trailing phrase, or make it a sentence with a real subject.',
  },
  negation: {
    label: '"Not just X, but Y" patterns',
    advice: 'State the point directly.',
  },
  contrast: { label: '"X, not Y" pairs', advice: 'State the point without the opposite.' },
  triplet: { label: 'Lists of three', advice: 'Keep a list of three only when there are three real items.' },
  dash: { label: 'Dashes', advice: 'Use a comma, a period or a new sentence.' },
};

const words = (list: string) => list.trim().split(/\s*\|\s*/);

const LISTS: Readonly<Partial<Record<TellGroup, readonly string[]>>> = {
  vocabulary: words(`
    delve | delves | delving | delved | tapestry | testament | pivotal | crucial | realm | realms | embark |
    embarks | embarking | embarked | unleash | unleashed | elevate | elevates | elevating | harness |
    harnessing | seamless | seamlessly | robust | holistic | nuanced | multifaceted | intricate |
    intricately | intricacies | meticulous | meticulously | vibrant | showcase | showcases | showcasing |
    bolster | bolstering | garner | garnered | interplay | enduring | ever-evolving | ever-changing |
    transformative | paradigm | synergy | cutting-edge | game-changing | groundbreaking | invaluable |
    myriad | plethora | beacon | cornerstone | bustling | nestled | resonate | resonates | resonated |
    resonating | spearhead | commendable | noteworthy | unparalleled | unwavering | indelible | profound |
    profoundly | captivating | breathtaking | endeavor | endeavors | endeavour | landscape | navigate |
    navigating | navigated | journey | ecosystem | insights | crucially | paramount | foster | fostering |
    fostered | embrace | embraced | embracing | amidst | whilst | labyrinth | labyrinthine | enigmatic |
    kaleidoscope | symphony | juxtaposition | ethereal | serendipity | camaraderie | newfound | resilience |
    resilient | intertwined | interwoven | unbeknownst | palpable | indomitable | solace | reverie
  `),
  corporate: words(`
    leverage | leverages | leveraging | leveraged | underscore | underscores | underscoring | underscored |
    facilitate | facilitates | facilitating | facilitated | utilize | utilizes | utilizing | utilized |
    utilization | optimize | optimizes | optimizing | streamline | streamlines | streamlining |
    empower | empowers | empowering | empowered | enhance | enhances | enhancing | enhanced | enhancement |
    ensure | ensures | ensuring | encompass | encompasses | encompassing | exemplify | exemplifies |
    exemplifying | highlight | highlights | highlighting
  `),
  transition: words(`
    moreover | furthermore | additionally | in addition | that said | that being said | notably |
    importantly | ultimately | in conclusion | overall | at its core | in essence | at the end of the day |
    all in all | to sum up | in summary | with that in mind | having said that | consequently |
    nevertheless | nonetheless | conversely | subsequently | thus | hence | in today's world |
    in the grand scheme
  `),
  hedge: words(`
    arguably | somewhat | perhaps | possibly | potentially | it could be said | to some extent |
    in many ways | it seems | generally speaking | tends to | may potentially | might potentially |
    could potentially | in some ways | to a certain degree | it is possible that | it's possible that
  `),
  intensifier: words(`
    genuinely | truly | incredibly | deeply | absolutely | remarkably | exceptionally | undeniably |
    profoundly | utterly | immensely | tremendously
  `),
  opener: words(`
    in today's | in an era of | in a world where | when it comes to | it's worth noting | it is worth noting |
    it's important to note | it is important to note | it's important to remember |
    it is important to remember | let's dive in | dive into | deep dive | let's explore | whether you're |
    whether you are | let's break it down | here's what you need to know | fast-paced world |
    rapidly evolving | now more than ever | in the realm of | in the world of
  `),
  crutch: words(`
    let's be honest | let's face it | make no mistake | the truth is | here's why | here's the thing |
    think about it | let that sink in | ever wondered | the reality is | the bottom line | spoiler alert |
    plot twist | here's the kicker | the answer is simple | what's more | guess what | the best part
  `),
  copula: words(`
    serves as | serve as | serving as | served as | stands as | stand as | stood as | functions as |
    acts as a | boasts | boasting | marks a | marked a | represents a | represents an | constitutes
  `),
  cliche: words(`
    unlock the potential | take it to the next level | rich tapestry | plays a pivotal role |
    play a pivotal role | a testament to | stands the test of time | second to none | look no further |
    game changer | at the forefront | pave the way | paves the way | paving the way | push the boundaries |
    a new era | redefine | reimagine | level up | a key role | a vital role | a crucial role |
    lies at the heart | at the heart of | plays a key role | than ever before | it goes without saying |
    needless to say | each and every | first and foremost | serves as a reminder | the power of |
    a wide range of | a variety of | a deeper understanding | valuable lessons | a sense of community |
    a sense of belonging | sense of purpose | strike a balance | a delicate balance | a double-edged sword |
    the fabric of | a symphony of | a dance of | the beauty of | the importance of | plays a role |
    shed light on | sheds light on | stark reminder | serves as a testament | it is essential |
    it's essential | it is crucial | it's crucial | in conclusion | food for thought
  `),
  fiction: words(`
    barely above a whisper | couldn't help but | could not help but | a sense of | sent a shiver |
    sent shivers | shivers down | shiver down | the weight of | in that moment | little did | a mix of |
    a mixture of | heart pounding | heart racing | breath hitched | breath caught | unbeknownst |
    the air was thick | air thick with | hung heavy | a flicker of | flicker of hope | glimmer of hope |
    a glimmer of | the hum of | steeled herself | steeled himself | tendrils of | the world seemed to |
    time seemed to | as if the universe | for the first time in | a knowing smile | mischievous glint |
    a glint in | eyes sparkling | eyes gleaming | eyes twinkling | with renewed | renewed sense |
    renewed determination | newfound | a newfound | etched in | etched into | a testament | echoed through |
    echoing through | a wave of | washed over | wash over | a pang of | the silence was | deafening silence |
    the only sound | it was as if | as if the very | a chill ran | ran down her spine | ran down his spine |
    a smile tugged | tugged at the corners | the corners of her mouth | the corners of his mouth |
    a lump in | swallowed hard | let out a breath | a breath she didn't know | a breath he didn't know |
    the scent of | the soft glow | bathed in | dappled | ancient | whispered secrets | whispers of |
    stories untold | a world of possibilities | the possibilities were endless | forevermore | ethereal glow |
    in the distance | the city that never sleeps | something shifted | everything changed | never be the same
  `),
};

/** A trailing "-ing" phrase that claims importance, such as ", highlighting its role". */
const TAIL =
  /,\s+(?:highlighting|underscoring|emphasizing|emphasising|cementing|reflecting|showcasing|signaling|signalling|demonstrating|illustrating|solidifying|reinforcing|symbolizing|symbolising|paving the way|setting the stage|ensuring|contributing to|fostering|creating a sense|serving as|marking)\b/gi;
const NEGATION = [
  /\bnot (?:just|only|merely|simply)\b/gi,
  /\bmore than (?:just )?(?:a|an)\b/gi,
  /\bit'?s not (?:about|that|just)\b/gi,
  /\bisn'?t (?:just|only|merely|about)\b/gi,
  /\bwasn'?t (?:just|only|merely|about)\b/gi,
  /\bnot because\b[^.]{0,80}\bbut because\b/gi,
];
const CONTRAST = /,\s+not\s+(?:a |an |the )?\w+/gi;
const TRIPLET = /\b[\w'-]+(?:\s[\w'-]+){0,3},\s+[\w'-]+(?:\s[\w'-]+){0,3},\s+(?:and|or)\s+[\w'-]+/gi;
/** An em dash, an en dash, "--", or a hyphen with a space on each side. */
const DASH = /\u2014|\u2013|--|(?<=\w) - (?=\w)/g;

function phrasePattern(list: readonly string[]): RegExp {
  const sorted = [...list].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "'?"));
  return new RegExp(`(?<![\\p{L}\\p{N}'])(?:${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

const PATTERNS: readonly (readonly [TellGroup, readonly RegExp[]])[] = [
  ...(Object.entries(LISTS) as [TellGroup, string[]][]).map(
    ([group, list]) => [group, [phrasePattern(list)]] as const,
  ),
  ['tail', [TAIL]],
  ['negation', NEGATION],
  ['contrast', [CONTRAST]],
  ['triplet', [TRIPLET]],
  ['dash', [DASH]],
];

export interface Tell extends Span {
  group: TellGroup;
  text: string;
}

/** Every sign in the text, in text order. Overlapping matches of one group count once. */
export function findTells(text: string): Tell[] {
  const plain = plainChars(text);
  const found: Tell[] = [];
  for (const [group, patterns] of PATTERNS) {
    const own: Tell[] = [];
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (let match = pattern.exec(plain); match !== null; match = pattern.exec(plain)) {
        if (match[0] === '') {
          pattern.lastIndex += 1;
          continue;
        }
        const from = match.index;
        const to = from + match[0].length;
        if (own.some((tell) => tell.from < to && from < tell.to)) continue;
        own.push({ group, from, to, text: text.slice(from, to) });
      }
    }
    found.push(...own);
  }
  return found.sort((a, b) => a.from - b.from || a.to - b.to);
}

/** The number of signs in each group. */
export function tellCounts(tells: readonly Tell[]): Record<TellGroup, number> {
  const counts = Object.fromEntries(TELL_GROUPS.map((group) => [group, 0])) as Record<TellGroup, number>;
  for (const tell of tells) counts[tell.group] += 1;
  return counts;
}

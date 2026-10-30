// Landing copy (spec section 20). Keep every claim true to spec section 4: Vlo is not out yet,
// so features are "coming" or "built for". Never add numbers, users or reviews that are not real.

export const TAGLINE = "Write in flow.";

export const HERO = {
  headline: "Write the book only you can write.",
  rotatingPrefix: "A free, private studio for",
  rotatingWords: ["novelists", "memoirists", "poets"],
  note: "No AI unless you ask for it. Your drafts stay on your device.",
  button: "Join the waitlist",
  badge: "write in flow · write in flow · ",
  words: [
    "write",
    "écrire",
    "escribir",
    "schreiben",
    "scrivere",
    "escrever",
    "書く",
    "写作",
    "쓰다",
    "लिखना",
  ],
} as const;

export const MANIFESTO = {
  title: "Built for stories, memories and poems",
  body: "Most writing apps were built for documents. Vlo is built for stories, memories and poems. It keeps every indent where you put it. It keeps the real names in your memoir private. It keeps your drafts on your own device. It costs nothing, and it writes nothing unless you ask.",
  keyWords: ["stories,", "memories", "poems.", "indent", "private.", "device.", "nothing"],
  closing: "Your words stay yours.",
} as const;

export const BOOK = {
  title: "The book opens",
  captions: [
    "Every book starts as loose pages.",
    "Vlo gives each form its own shape.",
    "Novels get a living board.",
    "Memoirs get a timeline of your life.",
    "Poems keep every space where you put it.",
  ],
} as const;

export const FORMS = {
  title: "Three forms, three workspaces",
  novel: "A board that thinks in scenes.",
  memoir: "Real names stay private.",
  poetry: "Every indent, kept.",
} as const;

export const PRIVACY = {
  title: "Pen mode is the default. It sends nothing.",
  hidden: "Your drafts live on your device. No server reads them.",
} as const;

export const AI_MODES = [
  {
    id: "pen",
    name: "Pen",
    summary: "No AI. No AI code loads.",
    detail:
      "Pen is the default for every project. Vlo loads no AI code in Pen mode, and the network log shows zero requests while you write.",
  },
  {
    id: "reader",
    name: "Reader",
    summary: "Questions and notes in a side panel.",
    detail:
      "Reader asks questions and notes pacing, clarity and consistency. Its words stay in the side panel and never enter your manuscript. It runs in your browser by default.",
  },
  {
    id: "cowriter",
    name: "Co-writer",
    summary: "Suggestions only when you ask, always marked.",
    detail:
      "Co-writer suggests text only on request. Every AI span carries a mark you can show or hide, and an export can list how much of the text came from AI. It uses your own key or a model on your own computer.",
  },
] as const;

export const AI_SECTION = {
  title: "AI on your terms",
  intro: "Pick a mode for each project. Change it any time.",
} as const;

export const FEATURES = {
  title: "Built for the whole draft",
  tiles: {
    snapshots: "Snapshots of every version",
    formats: "DOCX, PDF, EPUB and Markdown that keep your layout",
    offline: "Saves offline as you type",
    timer: "A session timer with no penalty",
    themes: "Ink, Paper, Night and Sepia",
    map: "A map of your manuscript",
    share: "Read-and-comment links for beta readers",
    price: "Free",
  },
} as const;

/** Public-domain first lines (spec section 20). Use only these. */
export const FIRST_LINES = [
  { line: "Call me Ishmael.", source: "Herman Melville, Moby-Dick (1851)" },
  {
    line: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.",
    source: "Jane Austen, Pride and Prejudice (1813)",
  },
  {
    line: "It was the best of times, it was the worst of times,",
    source: "Charles Dickens, A Tale of Two Cities (1859)",
  },
  {
    line: "All happy families are alike; every unhappy family is unhappy in its own way.",
    source: "Leo Tolstoy, Anna Karenina (Constance Garnett translation, 1901)",
  },
  {
    line: "There was no possibility of taking a walk that day.",
    source: "Charlotte Brontë, Jane Eyre (1847)",
  },
  { line: "All children, except one, grow up.", source: "J. M. Barrie, Peter and Wendy (1911)" },
  {
    line: "Mrs. Dalloway said she would buy the flowers herself.",
    source: "Virginia Woolf, Mrs Dalloway (1925)",
  },
  {
    line: "In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since.",
    source: "F. Scott Fitzgerald, The Great Gatsby (1925)",
  },
  {
    line: "Whether I shall turn out to be the hero of my own life, or whether that station will be held by anybody else, these pages must show.",
    source: "Charles Dickens, David Copperfield (1850)",
  },
  {
    line: "You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings.",
    source: "Mary Shelley, Frankenstein (1818)",
  },
  { line: "I celebrate myself, and sing myself,", source: "Walt Whitman, Song of Myself (1855)" },
  {
    line: "Two roads diverged in a yellow wood,",
    source: "Robert Frost, The Road Not Taken (1916)",
  },
] as const;

export const FIRST_LINES_SECTION = {
  title: "First lines",
  blank: "Your first line goes here",
  marqueeA: ["sonnet", "chapter", "memory", "villanelle", "scene", "draft"],
  marqueeB: ["ghazal", "prologue", "letter", "elegy", "outline", "epilogue"],
} as const;

export const FAQ = [
  { q: "Is Vlo free?", a: "Yes, Vlo is free to use." },
  { q: "Does Vlo use AI?", a: "Only if you turn it on. Pen mode, the default, has no AI." },
  {
    q: "Where are my drafts stored?",
    a: "On your device. You can export a full backup at any time.",
  },
  { q: "When does Vlo launch?", a: "The waitlist hears first." },
  { q: "Who is Vlo for?", a: "Novelists, memoirists and poets." },
] as const;

export const WAITLIST = {
  title: "Save your page.",
  emailLabel: "Email",
  writeLabel: "I write",
  writeOptions: [
    { value: "novels", label: "Novels" },
    { value: "memoir", label: "Memoir" },
    { value: "poetry", label: "Poetry" },
    { value: "mixed", label: "A bit of everything" },
  ],
  painLabel: "What slows you down when you write?",
  consent: "We will only email you about Vlo. Unsubscribe any time.",
  submit: "Hold to sign",
} as const;

/** An original poem for the poetry demo. Leading spaces are exact and must survive rendering. */
export const DEMO_POEM = [
  "Morning, and the kettle",
  "      keeps its one note going.",
  "            I set the cup down",
  "   where the light already was.",
  "",
  "The page is still blank.",
  "      That is not the same",
  "            as empty.",
] as const;

/** Memoir demo: marked real names and their aliases. */
export const DEMO_MEMOIR = {
  text: [
    "That summer ",
    { real: "Aunt Rosa", alias: "Aunt Maria" },
    " drove us to the coast, and ",
    { real: "Grandpa Ilya", alias: "Grandpa Ivan" },
    " sang the whole way.",
  ],
  stages: ["Childhood", "School", "Leaving home", "First job", "Now"],
} as const;

export const DEMO_SCENES = [
  "Ch. 1 · The letter",
  "Ch. 2 · Night ferry",
  "Ch. 3 · The sister",
  "Ch. 4 · Storm",
  "Ch. 5 · The lie",
  "Ch. 6 · Home",
] as const;

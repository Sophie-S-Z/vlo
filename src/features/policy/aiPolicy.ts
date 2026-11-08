/*
 * The AI policy (spec section 10, plan Task D7). `docs/ai-policy.md` holds the same words, and a unit test
 * keeps the two the same. A change to a statement raises the version and sets the date.
 */

export const AI_POLICY = {
  version: 2,
  date: '2026-11-08',
  statements: [
    {
      title: 'Vlo trains no model on your text.',
      detail:
        'Vlo has no AI model of its own to train. Your text is never collected to train or improve one.',
    },
    {
      title: 'No Vlo server receives your manuscript text.',
      detail:
        'Vlo keeps your writing in this browser. An AI request goes straight from this browser to the engine you pick, and never through a Vlo server.',
    },
    {
      title: 'Pen mode loads no AI code and sends nothing unless you press "Check the web too".',
      detail:
        'Each project starts in Pen mode. Vlo loads its AI code, the deep AI check included, only after you switch a project to Reader or Co-writer mode. In Pen mode, only the web originality check in Insights sends anything: up to 6 short phrases from the open item, after you press its button. The network log shows each request that leaves this device.',
    },
    {
      title: 'With your own provider key, the provider’s terms apply, and Vlo shows them first.',
      detail:
        'Before a key for a free tier works, Vlo shows the data terms of that provider in plain words and asks you to agree. Before each request, Vlo shows the exact text and where it goes.',
    },
  ],
} as const;

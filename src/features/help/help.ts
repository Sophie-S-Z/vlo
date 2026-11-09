/*
 * The Help page (spec section 14, Phase 6 task 4; plan decisions T4 and T5). It is the user guide, so it
 * works offline. The support lines come from each organization's own site on `checkedOn`. A change raises
 * the version and sets the date.
 */

export interface GuideSection {
  title: string;
  steps: string[];
  /** Shown only in a build with a Supabase project (plan decision T3: launch with sharing off). */
  needsSharing?: true;
}

export interface SupportLine {
  name: string;
  detail: string;
  url: string;
}

export const HELP = {
  version: 3,
  date: '2026-11-09',
  guide: [
    {
      title: 'Start a project',
      steps: [
        'In the Library, choose New project.',
        'Pick one or more shapes: Novel, Memoir, Poetry collection or Open writing.',
        'Choose Create project. The first item opens, ready for your words.',
      ],
    },
    {
      title: 'Write and find your text',
      steps: [
        'Vlo saves each change on this device within a second. The save status shows "Saved".',
        'Add, rename and drag items in the binder on the left. The keyboard and the item menu move them too.',
        'Press Ctrl+K (Cmd+K on a Mac) to find an item by its title or its text, or to run an action.',
        'Choose Focus to hide everything but the text. Escape leaves Focus mode.',
        'To make a note to yourself, select the words and choose Comment. Comments show under the text, and exports leave them out.',
      ],
    },
    {
      title: 'Go back to an earlier draft',
      steps: [
        'Vlo saves a snapshot after every 10 minutes of writing.',
        'Choose History, then Save a snapshot now before a bold edit.',
        'Pick a snapshot in History to see its changes from the current text.',
        'Choose Restore this snapshot. Vlo saves the current text as a snapshot first.',
      ],
    },
    {
      title: 'Back up and move to a new computer',
      steps: [
        'In the Library, open the menu of a project card and choose Back up, then Download backup.',
        'Keep the file somewhere safe. The safety badge at the top of each screen shows when a project needs a backup.',
        'On the new computer, open Vlo and choose Import backup in the Library.',
        'For a copy that opens without Vlo, choose Download all my writing in Settings.',
      ],
    },
    {
      title: 'Export',
      steps: [
        'In a project, choose Export.',
        'Pick Word, PDF, EPUB or Markdown, and this item or the whole project.',
        'A novel can use standard manuscript format. Poems keep every space and indent in each format.',
        'For Google Docs, export to Word, then open the file in Google Drive.',
      ],
    },
    {
      title: 'Plan with the views',
      steps: [
        'The tabs above the text show the views of your project.',
        'A novel has the Story Board and the Plot Grid. A double-click on a linked card opens its scene.',
        'A memoir has the Memory Timeline, by time or by theme, and the People screen.',
        'A poetry collection has Sequences, with as many named orders of the poems as you need.',
        'Every project has Submissions and Progress.',
        'Every project has the Outline: a table and index cards of the binder, with synopses, statuses and labels. At the Simple tool level, open it from the command menu.',
      ],
    },
    {
      title: 'Keep real names private',
      steps: [
        'In a memoir, open People and choose Add person. Give each real name an alias.',
        'Select a name in the text and choose Mark as person, or use Mark all names before an export.',
        'A share-safe export, a share link and an AI request use the aliases in place of the real names.',
      ],
    },
    {
      title: 'Choose an AI mode',
      steps: [
        'Each project starts in Pen mode. Pen mode loads no AI code, and it sends nothing unless you press "Check the web too" in Insights.',
        'Choose the AI mode button to switch a project to Reader or Co-writer mode.',
        'Reader mode gives feedback in the side panel only. Co-writer mode can draft words, and marks them.',
        'The deep AI check in Insights needs Reader or Co-writer mode too, because it loads a language model.',
        'Before each request, Vlo shows the exact text and where it goes. The network log lists each request.',
      ],
    },
    {
      title: 'Share for reading',
      needsSharing: true,
      steps: [
        'In a project, choose Share. Pick the items and how long the link works.',
        'Choose Create link, then copy the link to your readers. They need no account.',
        'Comments from readers show in the Share panel. Stop sharing ends the link at once.',
      ],
    },
    {
      title: 'Install Vlo and write offline',
      steps: [
        'In Chrome or Edge, choose the install button in the address bar.',
        'On an iPhone or iPad, tap Share in Safari, then Add to Home Screen.',
        'On a Mac with Safari, choose File, then Add to Dock.',
        'After one visit, Vlo opens and saves with no network.',
      ],
    },
    {
      title: 'Keep your writing safe in Safari',
      steps: [
        'Safari can clear the data of a website after 7 days with no visit.',
        'Add Vlo to the Home Screen or the Dock. The installed app keeps its data.',
        'Back up each project often. Settings shows if the browser protects Vlo data.',
      ],
    },
  ] satisfies GuideSection[],
  care: [
    'Writing about painful events can bring the feelings back. That is common, and you can stop at any time.',
    'Set a session timer before you start, and plan something calm for after you stop.',
    'Nothing leaves this device unless you choose it, so you can write the whole truth first and decide later what to share.',
  ],
  checkedOn: '2026-11-08',
  support: [
    {
      name: 'Find A Helpline',
      detail: 'A free directory of crisis lines in more than 175 countries, by chat, text or phone.',
      url: 'https://findahelpline.com/',
    },
    {
      name: '988 Suicide and Crisis Lifeline (USA)',
      detail: 'Call or text 988, or chat online, at any hour.',
      url: 'https://988lifeline.org/',
    },
    {
      name: 'Samaritans (UK and Ireland)',
      detail: 'Call 116 123 for free, at any hour.',
      url: 'https://www.samaritans.org/',
    },
  ] satisfies SupportLine[],
};

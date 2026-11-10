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
  version: 4,
  date: '2026-11-10',
  guide: [
    {
      title: 'Start a project',
      steps: [
        'In the Library, choose New project.',
        'Pick one or more shapes: Novel, Memoir, Poetry collection or Open writing.',
        'Choose Create project. The first item opens, ready for your words.',
        'For a fast note, choose Quick note in the Library. The note goes into the Inbox folder at the top of the project.',
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
        'In an English project, More tools has Style check. It marks repeated words, filler words, cliches and long sentences. Put the cursor in the marked words to see why. The check never changes your text.',
      ],
    },
    {
      title: 'Write a poem in a form',
      steps: [
        'In a poem, choose More tools, then Craft labels.',
        'Pick a form above the poem: sonnet, villanelle, ghazal, haiku, pantoum or sestina.',
        'Vlo lists each line that breaks the form: the line count, the rhyme, a refrain, an end word or the syllables. Choose a note to go to its line.',
        'Rhyme and syllables are checked in English. The lines, stanzas, refrains and end words are checked in every language.',
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
      title: 'Keep versions of a scene or poem',
      steps: [
        'To try a new direction, choose History, then Versions, and save the text as a named version.',
        'Switch to this puts a version in the editor and keeps the text it replaces as a version.',
        'Compare shows each paragraph that differs. Use this takes one paragraph of the other version into your text.',
        'Versions go in backups and sync. Exports and word counts use the version in the editor.',
      ],
    },
    {
      title: 'Revise with Track changes',
      steps: [
        'Choose Track changes in More tools. New words are underlined and deleted words are struck through.',
        'Pick a pass under the text. Each pass has its own color, so you can see each round of revision.',
        'Accept or reject each change under the text, or all the changes of a pass at once.',
        'Exports, shares and word counts use the text as if you accepted every change.',
        'For an editor, export as Word with Keep my tracked changes and Include my comments on.',
        'When the editor sends the file back, choose Search, then Import an editor’s changes. Their changes wait under the text.',
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
      title: 'Sync your devices',
      needsSharing: true,
      steps: [
        'In Settings, under Devices, name this device and choose Sync my writing.',
        'On your phone, scan the code with the camera. On a computer, open the pairing link.',
        'Name the new device and choose Start sync. Your projects come to it.',
        'Vlo syncs when it opens, every minute while it shows, and when you leave it. Words that two devices write offline both stay.',
        'The sync server keeps only sealed copies, and it cannot read them.',
        'To stop, choose Stop sync on this device or Stop sync on all devices in Settings.',
      ],
    },
    {
      title: 'Export',
      steps: [
        'In a project, choose Export.',
        'Pick Word, PDF, EPUB or Markdown, and this item or the whole project.',
        'A novel can use standard manuscript format. Poems keep every space and indent in each format.',
        'For Google Docs, export to Word, then open the file in Google Drive.',
        'To post on Substack, Medium, a blog or AO3, pick Web copy, then Copy. Each line break and indent stays.',
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
        'In Submissions, Make a packet saves your pieces, cover letter, bio and synopsis in one zip and logs it as sent.',
      ],
    },
    {
      title: 'Keep research with the project',
      steps: [
        'At the end of the binder, Research takes images, PDFs, audio files and clippings. Add, then Files or Clipping.',
        'A clipping is text that you paste, with its link. Vlo keeps the link as text and never opens it.',
        'Research stays on this device. Backups and "Download all my writing" include it, and exports leave it out.',
        'Vlo takes files up to 50 MB, and warns when the research of a project is over 100 MB.',
        'On a wide screen, choose Open beside in the item menu, or the Open beside button of a research file. The item or file shows next to the open item, and both texts save. Swap panes and Close pane are above it.',
      ],
    },
    {
      title: 'Plan with the Outline and the Codex',
      steps: [
        'Every project has the Outline: a table and index cards of the binder, with synopses, statuses and labels.',
        'Every project has the Codex: its characters, places, things and lore, with other names and a note.',
        'The browser does not mark Codex names as spelling mistakes. Show Codex names in More tools underlines them.',
        'Exports, shares and AI requests leave the Codex out.',
        'At the Simple tool level, open the Outline and the Codex from the command menu.',
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
        'You can ask your readers up to 5 questions. They see them after the text.',
        'A reader selects words or taps a paragraph, then adds a comment, a reaction or both.',
        'The Feedback tab lists the replies of every link by item. Make a comment puts a reply on its words.',
        'Stop sharing ends the link at once.',
      ],
    },
    {
      title: 'Install Vlo and write offline',
      steps: [
        'In Chrome or Edge, choose the install button in the address bar.',
        'On an iPhone or iPad, tap Share in Safari, then Add to Home Screen.',
        'On a Mac with Safari, choose File, then Add to Dock.',
        'After one visit, Vlo opens and saves with no network.',
        'An installed Vlo is in the share menu of your phone or computer. Share a page or some text to Vlo, and it opens as a quick note.',
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

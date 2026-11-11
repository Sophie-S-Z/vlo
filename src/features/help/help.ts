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
  version: 16,
  date: '2026-11-11',
  guide: [
    {
      title: 'Start a project',
      steps: [
        'In the Library, choose New project.',
        'Pick one or more shapes: Novel, Memoir, Poetry collection, Open writing or Script.',
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
      title: 'Hear your text read aloud',
      steps: [
        'Choose Read aloud in More tools. Vlo reads from the cursor, or only the selected words.',
        'Vlo uses only the voices on this device, so your text stays here.',
        'When the Codex has characters, turn on Table read. Each character speaks in a voice of their own, and you can pick each voice.',
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
        'For a printed book, open Book. Pick the trim size and the chapter style, and add a dedication or other pages. The preview shows each printed page, or the e-book on a reader or a phone. Then choose Export the book.',
      ],
    },
    {
      title: 'Show how you wrote a project',
      steps: [
        'Vlo keeps an authorship record of each project. It counts the minutes and the characters that you type, paste, dictate, take from the AI and delete. It keeps no text.',
        'In Export, choose Download the record. Each device signs its part of the record with a key that stays on it.',
        'Give the file to a teacher, an editor or a contest. They open the verify page at /verify and drop the file there. The check runs in their browser and sends nothing.',
        'The check shows if someone changed the file. It cannot show who sat at the device.',
        'To prove when the record existed, turn on Add a public timestamp before you download it. Vlo sends one hash of the record to two free OpenTimestamps servers, and Bitcoin confirms it in a few hours. On the verify page, choose Check the timestamp to see the date.',
      ],
    },
    {
      title: 'Set a writing goal',
      steps: [
        'In Progress, turn on Track a daily goal and streak. Type the words for each day, or set a deadline.',
        'A deadline takes a date and the words that the project must have by then. Vlo divides the words left by the writing days left, and the bar shows how far you are.',
        'To cut a draft down, type a target under the words that the project has now. Each day then counts the words that you remove.',
        'While goals are on, a ring next to the timer shows the goal of today. Choose it to open Progress.',
      ],
    },
    {
      title: 'Sprint and take a month challenge',
      steps: [
        'Choose Timer, then Start a sprint. Pick the minutes and a word target. Only the words that you write in the sprint count.',
        'At the end, the result shows your words and the target.',
        'In Progress, type the words for this month and choose Start a month challenge. The calendar shows the words of each day.',
      ],
    },
    {
      title: 'Sprint with friends',
      needsSharing: true,
      steps: [
        'In Start a sprint, turn on Sprint with friends and type a nickname.',
        'Leave the room code empty to make a room, then give its six-letter code to your friends. They type it in the same place.',
        'Choose Room next to the timer to see the words of each writer. The room gets only your nickname and your count, never your text.',
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
        'Exports and shares leave the Codex out. Only the Reader panel of the Assistant sends the notes of the names in its text.',
        'At the Simple tool level, open the Outline and the Codex from the command menu.',
      ],
    },
    {
      title: 'Keep the facts of the story straight',
      steps: [
        'When an entry changes in the story, open it and choose Add a change, such as “Loses her left eye” from Scene 4. The change holds from that scene on. The cursor line and the Reader panel show the entry as it is at the open scene.',
        'More tools also has Continuity check, which is off at first. In an English project, it marks a capital word in a sentence that is one letter away from a Codex name, such as “Mria” for “Mira”. In every project, it marks a name after the scene where its entry leaves the story. Put the cursor in the mark to see why, and choose Not a problem to keep it.',
        'In the binder, open the menu of a scene and choose Story date. Type a year, a month or a day, such as 1994-07. In a series, the Series page shows the dated scenes of every book on one Timeline, with the undated scenes after them.',
      ],
    },
    {
      title: 'Write a series',
      steps: [
        'In the Library, open the menu of a book and choose Add to a series. Make a new series or add the book to one.',
        'In the Codex of a book, open an entry and turn on Share with the series. Each book of the series then shows it.',
        'The Series page shows the books in order, their words, the mentions of each shared entry and the style sheet.',
        'A style sheet rule names a form to use and the forms to avoid. In an English book, the style check marks each form to avoid.',
        'A book that leaves the series keeps a copy of each shared entry whose names its text holds.',
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
      title: 'Write a script',
      steps: [
        'Pick Script for a screenplay or a stage play. The binder has acts, sequences and scenes.',
        'Each line is one element: scene heading, action, character, parenthetical, dialogue, transition or lyric. The style menu on the toolbar and the / menu change it.',
        'Tab changes the element of the line. Enter starts the element that usually follows, so dialogue follows a character.',
        'On a character line, Vlo shows the rest of a Codex character name in grey. Enter takes the name.',
        'To change to a stage play, choose the page button above the text, then Script layout.',
        'Export gives a script PDF in Courier Prime on US Letter, a Fountain file or a Final Draft file. Import writing reads a Fountain file.',
      ],
    },
    {
      title: 'Cite a source',
      steps: [
        'In Open writing or a memoir, choose Cite a source in More tools, or type /cite.',
        'Add a source, or import a BibTeX or CSL JSON file from Zotero or another reference manager.',
        'Type a page if you want one, then choose the source. The citation goes in at the cursor.',
        'Style sets APA 7, MLA 9 or Chicago author-date for each citation in the project. Type each title in the case that your style asks for.',
        'Each export ends with a list of the sources that it cites. A citation of a deleted source shows “[missing source]”, and Undo gives the source back.',
      ],
    },
    {
      title: 'Speak to write',
      steps: [
        'Put the cursor where the words go, then choose Speak to write in More tools, the / menu or the command menu.',
        'Choose Speak and talk. Choose Stop and write, or stop after 30 seconds, and your words go in at the cursor.',
        'The first time, Vlo downloads the speech model. The model runs on this device, the audio never leaves it, and Vlo does not keep the audio.',
        'The authorship record counts these words as dictated, and they are your own words, with no AI mark.',
      ],
    },
    {
      title: 'Record a memory out loud',
      steps: [
        'In a memoir, put the cursor in a memory and choose Record a memory in More tools or the command menu.',
        'A card asks a question about one stage of your life. Choose Next or Shuffle for another question.',
        'Choose Record, answer out loud, then choose Stop. The recording stays with the memory, in its research files.',
        'Choose Turn into text to put your words in at the cursor. The first time, Vlo downloads the speech model, and the audio never leaves this device.',
        'To free the space, choose Delete the model in Settings, under Speech to text.',
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

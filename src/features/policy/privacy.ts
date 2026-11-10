import type { NetPurpose } from '@/lib/db';

/*
 * The privacy page (spec section 12, plan Task F4). It lists each thing that can leave the device, by the
 * network purposes of `src/lib/net.ts`, and the page reads the hosts from `HOSTS`, so the two cannot differ.
 * `docs/privacy.md` holds the same words, and a unit test keeps the two the same. A change raises the
 * version and sets the date.
 */

export const PRIVACY = {
  version: 7,
  date: '2026-11-10',
  stays: [
    'Your text, titles, notes, board cards, timelines, orders and submissions stay in this browser. When you turn on sync, an encrypted copy goes to your other devices through the sync server.',
    'The real names and aliases on the People screen stay in this browser. When you turn on sync, they go encrypted to your other devices too.',
    'Snapshots stay in this browser. A backup or a folder save goes only to the place that you pick.',
    'The authorship record of each project stays in this browser. It holds counts and times, never text. It leaves only in a file that you download, or encrypted in sync.',
    'The recordings of a memory stay in this browser, with the research files of the project. Turn into text and Speak to write run the speech model on this device, so the audio never leaves it. Speak to write keeps no audio.',
    'A provider key stays in memory until you close the tab, unless you save it on this device with a passphrase. It goes only to its own provider.',
    'The key of each share link stays in the link and on this device. A backup file leaves out the key and the owner token.',
    'The network log stays in this browser.',
    'Vlo loads no third-party script, font, analytics or tracking pixel. No Vlo account exists.',
  ],
  leaves: {
    ai: {
      title: 'AI requests',
      when: 'Only in a project in Reader or Co-writer mode, after you press the button that sends a request or loads the model list of a provider.',
      sends:
        'The text of the request, which Vlo shows you before it goes unless you turned that off, and the provider key. The Reader panel also sends the Codex notes of the names in its text. In a memoir, the aliases replace the real names when that switch is on. A local server on this computer keeps the text on the device.',
    },
    'model-download': {
      title: 'In-browser model files',
      when: 'Only in a project in Reader or Co-writer mode, when you load an in-browser model for the Assistant or the deep AI check. In any mode, when you download the speech model for Turn into text or Speak to write.',
      sends: 'Requests for the model files. No text or audio goes with them.',
    },
    share: {
      title: 'Share links and comments',
      when: 'Only when you create a link, refresh its comments or stop sharing, and when a reader opens it or comments.',
      sends:
        'The chosen items with your questions for readers, and the comments, answers and reactions of readers, encrypted in the browser. The key stays in the link and never goes to the server. The owner token, which lets you stop the link, goes too, and the server keeps only its hash. In a memoir, the aliases replace the real names.',
    },
    usage: {
      title: 'Weekly usage counts',
      when: 'Only after you turn them on in Settings, and only when you press Send on a weekly report.',
      sends:
        'Counts in bands, the templates and features that you used, AI mode counts and error codes. Never text, titles or names. You see each report before it goes.',
    },
    originality: {
      title: 'The web originality check',
      when: 'Only when you press "Check the web too" in Insights.',
      sends:
        'Up to 6 short phrases from the open item. A phrase that holds a private name stays on the device.',
    },
    sync: {
      title: 'Sync between your devices',
      when: 'Only after you turn on sync in Settings, and only between the devices that you pair.',
      sends:
        'Your projects, encrypted in the browser with a key that only your devices have: the text, the binder, the planning tables and research files up to 2 MB. Snapshots, sound files, the recordings of a memory, the network log and share links stay on each device. The server sees sizes, times and a random id for each device, never a title or a word.',
    },
    room: {
      title: 'Sprint rooms',
      when: 'Only when you sprint with friends, from the start of the sprint to its end.',
      sends:
        'The room code, the nickname that you type, the count of the sprint and a random id for this sprint. Never a title or a word of text. A room ends 24 hours after someone makes it.',
    },
  } satisfies Record<NetPurpose, { title: string; when: string; sends: string }>,
  contact: {
    text: 'Ask a question or report a problem on GitHub',
    url: 'https://github.com/Sophie-S-Z/vlo/issues',
  },
};

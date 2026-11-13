import type { NetPurpose } from '@/lib/db';

/*
 * The privacy page (spec section 12, plan Task F4). It lists each thing that can leave the device, by the
 * network purposes of `src/lib/net.ts`, and the page reads the hosts from `HOSTS`, so the two cannot differ.
 * `docs/privacy.md` holds the same words, and a unit test keeps the two the same. A change raises the
 * version and sets the date.
 */

export const PRIVACY = {
  version: 12,
  date: '2026-11-13',
  stays: [
    'Your text, titles, notes, board cards, timelines, orders and submissions stay in this browser. When you turn on sync, an encrypted copy goes to your other devices through the sync server.',
    'The real names and aliases on the People screen stay in this browser. When you turn on sync, they go encrypted to your other devices too.',
    'Snapshots stay in this browser. A backup or a folder save goes only to the place that you pick.',
    'The authorship record of each project stays in this browser. It holds counts and times, never text. It leaves only in a file that you download, or encrypted in sync.',
    'The recordings of a memory stay in this browser, with the research files of the project. Turn into text and Speak to write run the speech model on this device, so the audio never leaves it. Speak to write keeps no audio.',
    'A provider key stays in memory until you close the tab, unless you save it on this device with a passphrase. It goes only to its own provider.',
    'The key of each share link stays in the link and on this device. A backup file leaves out the key and the owner token.',
    'The network log stays in this browser.',
    'Vlo loads no third-party script, font, analytics or tracking pixel. You need no account to write. An account is only for sync between your devices.',
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
        'The chosen items with your questions for readers, each image in them at most 1,600 pixels on its long side, and the comments, answers and reactions of readers, encrypted in the browser. The key stays in the link and never goes to the server. The owner token, which lets you stop the link, goes too, and the server keeps only its hash. In a memoir, the aliases replace the real names.',
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
      when: 'Only after you turn on sync, on the Account page or in Settings, and only between the devices that you sign in on or pair.',
      sends:
        'Your projects, encrypted in the browser: the text, the binder, the planning tables, and research files and images up to 2 MB each. Snapshots, sound files, the recordings of a memory, the network log and share links stay on each device. With a pairing link, only your devices have the key, and the server sees sizes, times and a random id for each device, never a title or a word. With an account, your account keeps the key on the server too.',
    },
    room: {
      title: 'Sprint rooms',
      when: 'Only when you sprint with friends, from the start of the sprint to its end.',
      sends:
        'The room code, the nickname that you type, the count of the sprint and a random id for this sprint. Never a title or a word of text. A room ends 24 hours after someone makes it.',
    },
    timestamp: {
      title: 'Public timestamps',
      when: 'Only when you turn on "Add a public timestamp" and download an authorship record, and when a reader presses "Check the timestamp" on the check page.',
      sends:
        'One SHA-256 hash of the record, mixed with random bytes, to two free OpenTimestamps servers. The hash shows no text, title or count. The check page asks the OpenTimestamps servers that finish the proof for the rest of it, and asks mempool.space for the Bitcoin block that holds it.',
    },
    publish: {
      title: 'Drafts on WordPress.com',
      when: 'Only when you choose "Save as a draft on WordPress.com" in Publish, in a build that offers it.',
      sends:
        'The title, the excerpt and the text of the post, with the access token that WordPress.com gave when you signed in, to the WordPress.com site that you picked. Vlo saves the post as a draft. The token stays in the tab until you close it. Every other platform in Publish gets only what you copy and paste.',
    },
    account: {
      title: 'Your account',
      when: 'Only when you sign in, while you stay signed in, and when you sign out or delete the account.',
      sends:
        'Your email address and the 6-digit code, or the sign-in that Google gives. For sync, the account keeps the sync key on the server, so each device where you sign in can open your synced projects. The copies on the sync server stay encrypted, but a person with access to the database could use the key to read them. Delete my account removes the account, the key, the sync and every sealed copy.',
    },
    ping: {
      title: 'The daily count',
      when: 'Once a day while the switch in Settings is on. It is on until you turn it off.',
      sends:
        'A random id for this browser, the day, the Vlo version, the kind of device (phone, tablet or computer) and whether Vlo is installed. When you are signed in, the count goes with your account, so the makers of Vlo see when an account was last active. Never text, a title or a name, and no cookie. Turning it off forgets the random id.',
    },
    feedback: {
      title: 'Feedback to the makers of Vlo',
      when: 'Only when you press Send feedback.',
      sends:
        'What you type, the kind of feedback, a rating if you pick one, a reply address if you type one, the screen that you came from, the kind of device and the Vlo version. When you are signed in, your account goes with it. No text of your projects goes.',
    },
  } satisfies Record<NetPurpose, { title: string; when: string; sends: string }>,
  contact: {
    text: 'Ask a question or report a problem on GitHub',
    url: 'https://github.com/Sophie-S-Z/vlo/issues',
  },
};

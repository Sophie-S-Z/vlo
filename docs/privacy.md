# Vlo privacy

Version 21, 18 November 2026. The app shows these words at `/privacy` (`src/features/policy/privacy.ts`). A unit test keeps this file and the page the same. The page also lists the hosts that the network module allows for each purpose (`HOSTS` in `src/lib/net.ts`).

## What stays on this device

- Your text, titles, notes, board cards, timelines, orders and submissions stay in this browser. When you turn on sync, an encrypted copy goes to your other devices through the sync server.
- The real names and aliases on the People screen stay in this browser. When you turn on sync, they go encrypted to your other devices too.
- Snapshots stay in this browser. A backup or a folder save goes only to the place that you pick.
- The authorship record of each project stays in this browser. It holds counts and times, never text. It leaves only in a file that you download, or encrypted in sync.
- The recordings of a memory stay in this browser, with the research files of the project. Turn into text and Speak to write run the speech model on this device, so the audio never leaves it. Speak to write keeps no audio.
- Read aloud runs every voice on this device, the natural voices too, so your text never leaves it.
- The spelling and grammar check, the thesaurus, the rhymes and the parts-of-speech colors run on this device from Vlo's own files, so your text never leaves it. Your dictionary, your text shortcuts and the rules that you turned off stay in this browser.
- A provider key stays in memory until you close the tab, unless you save it on this device with a passphrase. It goes only to its own provider.
- The key of each share link stays in the link and on this device. A backup file leaves out the key and the owner token.
- The network log stays in this browser.
- Vlo loads no third-party script, font, analytics or tracking pixel. You need no account to write. An account is only for sync between your devices and for your profile.

## What can leave, and when

### AI requests

Only in a project in Reader or Drafting mode, after you press the button that sends a request or loads the model list of a provider.

The text of the request, which Vlo shows you before it goes unless you turned that off, and the provider key. The Reader panel also sends the Codex notes of the names in its text. In a memoir, the aliases replace the real names when that switch is on. A local server on this computer keeps the text on the device.

### In-browser model files

Only in a project in Reader or Drafting mode, when you load an in-browser model for the Assistant or the deep AI check. In any mode, when you download a speech model for Turn into text or Speak to write, or the natural voices for Read aloud.

Requests for the model files. No text or audio goes with them.

### Share links and comments

Only when you create a link, refresh its comments or stop sharing, and when a reader opens it or comments.

The chosen items with your questions for readers, each image in them at most 1,600 pixels on its long side, and the comments, answers and reactions of readers, encrypted in the browser. The key stays in the link and never goes to the server. The owner token, which lets you stop the link, goes too, and the server keeps only its hash. In a memoir, the aliases replace the real names.

### Weekly usage counts

Once a week, by itself, the first time Vlo is open after the week ends. It is always on.

The counts of the week before: the templates and features that you used, your words and poems as bands such as 1000-4999, AI requests by mode, and error codes. Never text, titles or names. Settings shows a sample report.

### The web originality check

Only when you press "Check the web too" in Insights.

Up to 6 short phrases from the open item. A phrase that holds a private name stays on the device.

### Sync between your devices

Only after you turn on sync, on the Account page or in Settings, and only between the devices that you sign in on or pair.

Your projects, encrypted in the browser: the text, the binder, the planning tables, and research files and images up to 2 MB each. Snapshots, sound files, the recordings of a memory, the network log and share links stay on each device. With a pairing link, only your devices have the key, and the server sees sizes, times and a random id for each device, never a title or a word. With an account, your account keeps the key on the server too.

### Sprint rooms

Only when you sprint with friends, from the start of the sprint to its end.

The room code, the nickname that you type, the count of the sprint and a random id for this sprint. Never a title or a word of text. A room ends 24 hours after someone makes it.

### Public timestamps

Only when you turn on "Add a public timestamp" and download an authorship record, and when a reader presses "Check the timestamp" on the check page.

One SHA-256 hash of the record, mixed with random bytes, to two free OpenTimestamps servers. The hash shows no text, title or count. The check page asks the OpenTimestamps servers that finish the proof for the rest of it, and asks mempool.space for the Bitcoin block that holds it.

### Drafts on WordPress.com

Only when you choose "Save as a draft on WordPress.com" in Publish, in a build that offers it.

The title, the excerpt and the text of the post, with the access token that WordPress.com gave when you signed in, to the WordPress.com site that you picked. Vlo saves the post as a draft. The token stays in the tab until you close it. Every other platform in Publish gets only what you copy and paste.

### Your account

Only when you sign in, while you stay signed in, when you save your profile, change the toolbar or a key, or set a password, and when you sign out or delete the account.

Your email address and the 6-digit code, your password if you set one, or the sign-in that Google gives. The account server keeps only a hash of the password. Your profile: your name, the name that Vlo greets you by, a pen name, a bio and a photo, if you give them. The photo goes as a small square copy that holds no camera data. Your toolbar and the keys that you changed, so they follow you to each device where you sign in. The makers of Vlo see your name next to your email on the owner page. On the leaderboard, other signed-in writers see your pen name, or else the name that Vlo greets you by, your photo and the words that the daily count added for you. Turn off Show me on the leaderboard on the Leaderboard page to leave it. For sync, the account keeps the sync key on the server, so each device where you sign in can open your synced projects. The copies on the sync server stay encrypted, but a person with access to the database could use the key to read them. Delete my account removes the account, the profile, the toolbar and keys, the sync key, the sync and every sealed copy.

### The daily count

Once a day, signed in or not, and again after your projects change, at most once in 5 minutes. It is always on.

A random id for this browser, the day, the Vlo version, the kind of device (phone, tablet or computer), whether Vlo is installed, and three numbers: the words that you added today, the words in all your projects, and how many projects you have. Once a day, the app's own server on Vercel reads a rough place from the internet address of this device: the country, the region and the city. The count keeps only those three, never the address or an exact location, and the makers of Vlo see places only as counts of devices. When you are signed in, the count goes with your account, so the makers of Vlo see when an account was last active. With no account, they see only that a signed-out device used Vlo. Never text, a title or a name, and no cookie.

### Feedback and notes to Sophie, who makes Vlo

Only when you press Send feedback or Send the note.

What you type, the kind of feedback, a rating if you pick one, a reply address if you type one, the screen that you came from, the kind of device and the Vlo version. When you are signed in, your account goes with it. To stop spam, the server keeps a scrambled key of your internet address for 2 days, never the address itself. No text of your projects goes.

## Contact

Ask a question or report a problem on GitHub: https://github.com/Sophie-S-Z/vlo/issues

# Vlo privacy

Version 4, 10 November 2026. The app shows these words at `/privacy` (`src/features/policy/privacy.ts`). A unit test keeps this file and the page the same. The page also lists the hosts that the network module allows for each purpose (`HOSTS` in `src/lib/net.ts`).

## What stays on this device

- Your text, titles, notes, board cards, timelines, orders and submissions stay in this browser. When you turn on sync, an encrypted copy goes to your other devices through the sync server.
- The real names and aliases on the People screen stay in this browser. When you turn on sync, they go encrypted to your other devices too.
- Snapshots stay in this browser. A backup or a folder save goes only to the place that you pick.
- The authorship record of each project stays in this browser. It holds counts and times, never text. It leaves only in a file that you download, or encrypted in sync.
- A provider key stays in memory until you close the tab, unless you save it on this device with a passphrase. It goes only to its own provider.
- The key of each share link stays in the link and on this device. A backup file leaves out the key and the owner token.
- The network log stays in this browser.
- Vlo loads no third-party script, font, analytics or tracking pixel. No Vlo account exists.

## What can leave, and when

### AI requests

Only in a project in Reader or Co-writer mode, after you press the button that sends a request or loads the model list of a provider.

The text of the request, which Vlo shows you before it goes unless you turned that off, and the provider key. The Reader panel also sends the Codex notes of the names in its text. In a memoir, the aliases replace the real names when that switch is on. A local server on this computer keeps the text on the device.

### In-browser model files

Only in a project in Reader or Co-writer mode, when you load an in-browser model for the Assistant or the deep AI check.

Requests for the model files. No text goes with them.

### Share links and comments

Only when you create a link, refresh its comments or stop sharing, and when a reader opens it or comments.

The chosen items with your questions for readers, and the comments, answers and reactions of readers, encrypted in the browser. The key stays in the link and never goes to the server. The owner token, which lets you stop the link, goes too, and the server keeps only its hash. In a memoir, the aliases replace the real names.

### Weekly usage counts

Only after you turn them on in Settings, and only when you press Send on a weekly report.

Counts in bands, the templates and features that you used, AI mode counts and error codes. Never text, titles or names. You see each report before it goes.

### The web originality check

Only when you press "Check the web too" in Insights.

Up to 6 short phrases from the open item. A phrase that holds a private name stays on the device.

### Sync between your devices

Only after you turn on sync in Settings, and only between the devices that you pair.

Your projects, encrypted in the browser with a key that only your devices have: the text, the binder, the planning tables and research files up to 2 MB. Snapshots, sound files, the network log and share links stay on each device. The server sees sizes, times and a random id for each device, never a title or a word.

## Contact

Ask a question or report a problem on GitHub: https://github.com/Sophie-S-Z/vlo/issues

# Vlo privacy

Version 1, 8 November 2026. The app shows these words at `/privacy` (`src/features/policy/privacy.ts`). A unit test keeps this file and the page the same. The page also lists the hosts that the network module allows for each purpose (`HOSTS` in `src/lib/net.ts`).

## What stays on this device

- Your text, titles, notes, board cards, timelines, orders and submissions stay in this browser.
- The real names and aliases on the People screen stay in this browser.
- Snapshots stay in this browser. A backup or a folder save goes only to the place that you pick.
- A provider key stays in memory until you close the tab, unless you save it on this device with a passphrase.
- The key and the owner token of each share link stay on this device. A backup file leaves them out.
- The network log stays in this browser.
- Vlo loads no third-party script, font, analytics or tracking pixel. No Vlo account exists.

## What can leave, and when

### AI requests

Only in a project in Reader or Co-writer mode, after you press the button that sends a request.

The text of the request, which Vlo shows you before it goes unless you turned that off. In a memoir, the aliases replace the real names when that switch is on. A local server on this computer keeps the text on the device.

### In-browser model files

Only when you load an in-browser model for Reader or Co-writer mode.

Requests for the model files. No text goes with them.

### Share links and comments

Only when you create a link, when a reader opens it or comments, and when you stop sharing.

The chosen items and the comments, encrypted in the browser. The key stays in the link and never goes to the server. In a memoir, the aliases replace the real names.

### Weekly usage counts

Only after you turn them on in Settings, and only when you press Send on a weekly report.

Counts in bands, the templates and features that you used, AI mode counts and error codes. Never text, titles or names. You see each report before it goes.

### The web originality check

Only when you press "Check the web too" in Insights.

Up to 6 short phrases from the open item. A phrase that holds a private name stays on the device.

## Contact

Ask a question or report a problem on GitHub: https://github.com/Sophie-S-Z/vlo/issues

# Phase 17: A quieter Vlo, new writing modes and publishing

> **Status:** started on 2026-11-12 from the beta tester's feedback. The product owner asked for the work directly, so each pull request uses the recommendation of each decision below. The product owner can change a decision in review.

**Goal:** A new writer sees a calm page with few controls, and finds every other tool when they need it. Three new modes (research paper, article and essay) start from real structures. A writer can send a finished piece to Substack, WordPress, Medium, Ghost and other platforms with no lost formatting. Each mode gets tools of its own, and the poetry collection gets the most.

**Why:** The beta tester said that Vlo has too many controls on the first screen. The tester praised the poetry collection most. The tester asked for research papers, articles and essays, and for an easy way to publish.

**Not in this phase:** a server of Vlo's own, Supabase, new AI features, a direct connection to a platform whose host is not fixed (a self-hosted WordPress or Ghost site). The CSP lists each allowed host, so Vlo cannot reach a host that each writer picks.

## Research: free ways to publish (Task P0)

Checked on 2026-11-12 with a CORS preflight from the production origin and the public documents of each platform.

| Platform | Free API that a browser can call | What Vlo does |
| --- | --- | --- |
| WordPress.com, and self-hosted sites with Jetpack | Yes. `public-api.wordpress.com` answers a preflight from Vlo's origin with `Authorization` allowed. OAuth 2 implicit flow gives a token in the address fragment. The app owner registers a free WordPress.com app for a client id. | A direct "Save as a draft" connection, when the build has a client id. With no client id, the copy route. |
| Self-hosted WordPress | Yes (REST API and Application Passwords), but each site has its own host, and the CSP cannot list it. | A WordPress import file (WXR), which Tools > Import makes into drafts, and a copy in block-editor HTML. |
| Substack | No public API. The unofficial routes need the writer's session cookie. | A rich-text copy that keeps only what the Substack editor keeps, with footnotes as Substack-style notes at the end. |
| Medium | No. Medium stopped new integration tokens, and the API has no support. | A rich-text copy tuned for Medium (one title, one subtitle, h3 and h4 headings only). |
| Ghost | The Admin API refuses a browser origin that is not the site itself. | A rich-text copy for the Ghost editor, and Markdown for a Markdown card. |
| Dev.to | The preflight allows only GET. | Markdown with front matter. |
| Hashnode | The GraphQL host now redirects to an announcement. | Markdown. |
| Write.as | The preflight returns 404. | Markdown. |
| AO3, Wattpad, Royal Road, Tumblr, LinkedIn, Beehiiv, Reddit | No free write API. | A tuned copy for each: the HTML tags that each editor keeps, or Markdown for Reddit. |

## Decisions (recommendation used)

| # | Topic | Recommendation used | Other choice |
| --- | --- | --- | --- |
| S1 | Project tools | One row. Each tool is an icon with a tooltip. The name stays for the screen reader. | Keep the two rows with words. |
| S2 | Item tools (Page, Scene, Sound, Insights, History) | On the title row of the item, as quiet icons that grow clear on hover and focus. | A menu. |
| S3 | View tabs | Write and the views of the template show. Submissions, Progress and the tool views go in a "More" menu, except the tab on show. | All tabs in the row. |
| S4 | Library actions | "New project" and one "Import" menu (backup, writing, quick note). | Four buttons. |
| S5 | Discovery | A "Find a tool" field with the ⌘K key shows each tool. A first-use tip line names ⌘K and `/`, one tip each visit until the writer closes it. | Hide tools with no pointer. |
| M1 | New modes | Three new templates: `research`, `article`, `essay`. Each item is a `page` with its own label (Section). | One "Academic" template. |
| M2 | Presets | A mode gets structures to start from (for example IMRaD, literature review, lab report, research abstract, annotated bibliography). Each section holds a quiet guide line and a word range, never text in the document. | Starter text in the document. |
| M3 | References | A "References" page shows the live list of the project's sources in the project style (APA, MLA or Chicago). The export puts the list at that page. | The list at the end only. |
| P1 | Publish | A Publish dialog with a card for each platform, a preview, and Copy rich text, Copy Markdown or Download. WordPress.com gets a direct draft when the build has a client id. | Copy only. |
| D1 | Deeper tools | Poetry first, then research, essay and article. | Each mode the same. |

## Pull requests

1. **Q-A: A quieter screen** (S1 to S5).
2. **Q-B: Research paper, article and essay** (M1 to M3).
3. **Q-C: Publish** (P1).
4. **Q-D: Deeper tools for each mode** (D1).

## Global constraints

- Everything in the Phase 0 to 16 constraints holds: only `src/lib/net.ts` makes requests, Pen mode sends nothing, WCAG 2.2 AA in each theme, the budgets of spec section 12.
- No tool goes away. Each tool keeps its accessible name, so a screen reader and the tests find it the same way.
- A new network purpose (`publish`) gets a privacy page entry, a host in `HOSTS` and the CSP.
- Guide lines and word ranges never go in an export, a share or a copy.

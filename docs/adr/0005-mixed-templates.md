# ADR 0005: Open writing, and projects with more than one template

- Status: accepted
- Date: 2026-11-08

## Context

Vlo had three templates: novel, memoir and poetry collection. Each project had exactly one. Writers asked for two changes:

- A plain, open place for any writing, such as essays, letters, scripts, journals and lists.
- One project that mixes templates, for example a memoir with poems in it.

## Decision

- A fourth template, `open` ("Open writing"), has folders (`part`), pages (`page`, a new item kind) and notes. A page opens in the prose editor with every tool. A folder can hold folders, so the writer makes any shape. Open writing adds no views.
- `Project.template` becomes `Project.templates`: a list of one or more templates in `TEMPLATE_ORDER` (novel, memoir, poetry, open).
- `projectDef()` gives one `TemplateDef` for a list. The binder kinds, the nesting rules and the starter items are the union of each template. The first template that names a kind gives its label, so "part" is "Part" in a novel and memoir mix, and "Section" in a poetry and open mix. The same list always gives the same object.
- Each tool that belongs to one template turns on when the project has that template: the Board and Plot Grid (novel), the Timeline, People and private-name aliases (memoir), the Sequencer and Craft labels (poetry), and standard manuscript format (novel). Editor commands that name templates show when the project has one of them.
- The template picker is a set of checkbox cards. Novel is the suggestion. The writer's first pick replaces it, and each later pick adds or removes a template. The last template stays, so a project always has one. A single pick costs one action, as it did with radio cards.
- Database version 6 puts each stored `template` in a list of one and removes the old field. Backup version 3 writes `templates`. Vlo still reads backup versions 1 and 2, and puts their `template` in a list in the same way.

## Consequences

- Existing projects keep their template, their items and their views.
- A backup from this build does not open in an older build. The older build says that a newer Vlo made it.
- Phase 7 (roadmap F35, decision P3) adds Change templates to the project card menu in the Library. Adding a template is always safe, because it only adds kinds. A template can go only when every item fits the binder rules of the templates that stay (`misfits` in `templates.ts`). The dialog lists the other items, so the writer moves or deletes them first. View data stays in the database, so it shows again when the template comes back.
- The weekly usage counts can now name `open` in `templates_used`. The server function checks keys only, so it needs no change.

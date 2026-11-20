# Rules for Claude in this repository

@AGENTS.md

`AGENTS.md` holds the rules and facts for every coding agent, Codex included. Change them there, not here.

## Only for Claude Code

- Load `superpowers:using-superpowers` at the start of each session, and use the skills that
  `docs/VLO_SPEC.md` section 16 names.
- Write a phase plan with `superpowers:writing-plans`, and show it to the owner before work starts.
- At the end of a session, write a handoff with `anthropic-skills:handoff`.

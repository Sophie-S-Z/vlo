# 0004. Code license

Date: 2026-10-30. Status: proposed (section 24 item 3, default applied).

## Context

Section 24 asks the human whether to open-source the code. The default is to keep the repository private and prepare a license choice.

## Decision

Keep the repository private and add no LICENSE file for now. The options, when the human decides:

- **AGPL-3.0:** others can self-host and fork, but a hosted fork must publish its changes. Fits a privacy product that wants trust through open code and protection against closed clones.
- **MIT:** widest reuse, no protection against closed clones.
- **Source-available (for example FSL-1.1 with a later MIT or Apache change date):** readable code for trust, no competing commercial use for two years.

Recommendation: AGPL-3.0, if the human wants the code open. Check that every dependency stays license-compatible (all current ones are MIT, ISC, Apache-2.0 or OFL for fonts; GSAP uses its own standard license, flagged for legal review in section 24 item 7).

## Consequences

Without a LICENSE file, all rights stay reserved.

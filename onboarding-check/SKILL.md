---
name: onboarding-check
description: Onboarding check for new team members — probe their grasp of this repo's terminology and development conventions, then either clear them to contribute or hand them a gap checklist. Use when someone just joined the team, when asked to assess whether a newcomer is ready to participate, or when a newcomer wants a list of concepts to learn before contributing.
---

# onboarding-check

Run a conversational **onboarding check**: measure a newcomer's grasp of this repo's terminology and development conventions, then either clear them to contribute or hand them a **gap checklist**.

The repo's own docs are the single source of truth for what to test. Never hardcode repo terms or rules into this skill — derive them fresh at run time, so the check tracks the repo as it evolves.

## Steps

### 1. Scope and build the knowledge map

Ask the newcomer which part of the project they will work in (e.g. the TUI, agent-core-v2, kap-server). Then read the authoritative sources for that scope:

- Root `AGENTS.md` — project map, hard constraints, workflow requirements.
- `CONTEXT.md` and `docs/adr/` — domain language and design decisions.
- The `AGENTS.md` of every package/app the newcomer will touch.
- `CONTRIBUTING.md`.

From these, extract two lists:

- **Terms** — the domain vocabulary a contributor must think with (architecture layers, scope tiers, domain concepts), each with a one-line meaning traceable to a source file.
- **Rules** — the conventions whose violation breaks the build, the release, or the review process. Skip stylistic preferences; only test what has teeth.

Completion criterion: every term and rule cites the file it came from, and the lists cover every directory the newcomer named — nothing probed later is off-list, nothing on-list is unprobed.

### 2. Derive probes

For each **term**, write a probe that asks the newcomer to *use* the concept, not recite it: "what breaks if X" or "when would you choose X over Y" beats "define X". For each **rule**, probe application: "you just added a workspace package — what else must change before you commit?"

Completion criterion: every term and rule from step 1 has at least one probe, and no probe can be answered by quoting the docs verbatim.

### 3. Run the check

Ask the probes conversationally, in the newcomer's language, 3–5 at a time. Do not reveal answers during the check — a probe answered with your own hints tells you nothing. When an answer is weak, follow it deeper before moving on; once a term is clearly solid, stop probing it. Classify each item as it resolves: **solid** / **shaky** / **absent**.

Completion criterion: every probe carries a classification, and no item was skipped because the conversation drifted.

### 4. Verdict and gap checklist

- **Ready**: every hard rule is solid and no term central to the newcomer's scope is absent. Say so plainly; note any shaky items as things to shore up in review.
- **Not ready**: any hard rule shaky or absent, or a scope-central term absent. Immediately output the **gap checklist**. For each gap:
  1. **Concept** — the repo term, or the underlying general concept when the gap is background knowledge (e.g. DI, DDD, ORM, monorepo versioning).
  2. **Why it matters here** — one line, tied to the repo location that uses it.
  3. **Where to learn it** — the specific repo file for repo terms; the general concept name to study for background knowledge.
  4. **Re-check probe** — the question you'll ask to verify the gap has closed.

Completion criterion: every shaky or absent item appears on the checklist with all four fields, and a newcomer reading only the checklist knows exactly what to learn and how they will be re-tested.

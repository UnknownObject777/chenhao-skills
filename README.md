# chenhao-skills

Personal collection of agent skills. One top-level directory per skill.

## Skills

- [chrome-bookmark-reorganize](chrome-bookmark-reorganize/SKILL.md) — 重新分类/整理 Chrome 书签，处理本地 Bookmarks 文件与 Google 同步冲突。
- [dsh-archive-agent-notes](dsh-archive-agent-notes/SKILL.md) — add/audit/archive/restore DeepSeek Harness Agent Notes, classifying implemented notes by future value and pruning superseded ones.
- [dsh-code-review](dsh-code-review/SKILL.md) — review a deepseek-harness PR against the repo's AGENTS.md conventions, defensive patterns, and quality gates.
- [dsh-doc-site-sync](dsh-doc-site-sync/SKILL.md) — publish/update/move/remove DeepSeek Harness documentation website pages and fix VitePress projection problems.
- [dsh-doc-standards](dsh-doc-standards/SKILL.md) — apply the DeepSeek Harness documentation standard: hierarchy, tutorials vs references, doc budgets, and slop trimming.
- [dsh-find-simplifications](dsh-find-simplifications/SKILL.md) — find non-obvious simplification candidates in deepseek-harness and write evidence-backed Agent Notes / TODO notes for them.
- [dsh-merging-stacked-prs](dsh-merging-stacked-prs/SKILL.md) — land stacks of dependent GitHub PRs through GitHub's official stack object and `gh stack merge`.
- [dsh-pre-push-checks](dsh-pre-push-checks/SKILL.md) — select the smallest tests/checks covering an outgoing deepseek-harness diff instead of running the full suite.
- [dsh-prose-standard](dsh-prose-standard/SKILL.md) — write/review/trim prose in deepseek-harness, preserving the contract while removing transcripts, repetition, and decoration.
- [dsh-translate-docs](dsh-translate-docs/SKILL.md) — run the extended DeepSeek Harness bilingual-document workflow: briefings, delegated translation, and pairing verification.
- [dsh-trim-cot-leakage](dsh-trim-cot-leakage/SKILL.md) — audit and fix prose that reads like a leaked reasoning transcript (change narration, review choreography, planning residue).
- [onboarding-check](onboarding-check/SKILL.md) — probe a new team member's grasp of a repo's terminology and development conventions, then clear them to contribute or hand out a gap checklist.
- [primary-contradiction](primary-contradiction/SKILL.md) — 从一段讨论或一件事里识别出主要矛盾与次要矛盾，把注意力锚定在起决定作用的那处对立上，并指出先动哪里。
- [publish-skill](publish-skill/SKILL.md) — publish or update a skill in this repo.
- [record-browser-gif](record-browser-gif/SKILL.md) — record browser/web-UI interaction demos as optimized GIFs and publish them to an assets branch for PRs.
- [to-kanban](to-kanban/SKILL.md) — 把一份需求（PRD / 需求文档 / 一句口述）拆成一张可直接执行的 Obsidian kanban-plugin 看板。

## Install

Copy a skill directory into a project's `.agents/skills/` (project scope) or `~/.agents/skills/` (user scope).

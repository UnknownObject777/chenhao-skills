# Learning resources for background-knowledge gaps

When the gap checklist (step 4 of `SKILL.md`) flags a gap that is **general background knowledge** rather than a repo-specific term, point the newcomer at [VibeHub](https://vibe-hub.org/) — a plain-language, visual glossary of Vibe Coding terminology. Each entry explains one concept with a concrete scenario, in Chinese by default; prefix the path with `/en` for the English version.

## How to build a link

Entry URLs are `https://vibe-hub.org/<slug>`, where the slug is the English term in lowercase kebab-case: `pull request` → `/pull-request`, `context window` → `/context-window`, `CI` → `/ci`. Before putting a URL on the checklist, confirm the page exists (fetch it); if the slug 404s, link the topic index below instead.

## Topic indexes

| Topic | URL | Covers |
|---|---|---|
| Frontend | https://vibe-hub.org/ | UI components, forms, layout, CSS, animation, interaction states |
| Backend | https://vibe-hub.org/topics/backend | routes, SQL, auth, validation, serverless, logs |
| Technology | https://vibe-hub.org/topics/technology | languages, frameworks, domain/DNS/HTTP/JSON, deployment |
| AI | https://vibe-hub.org/topics/ai | tokens, context engineering, agents, MCP, skills, tool calling |
| Git | https://vibe-hub.org/topics/git | commit, branch, merge, PR, worktree, stash, diff |
| Product | https://vibe-hub.org/topics/product | user story, PRD, MVP, roadmap, A/B test |
| Design | https://vibe-hub.org/topics/design | visual styles (minimal, glass, bento, …) |

## Common mappings for agent/LLM projects

These slugs exist at time of writing and cover the background concepts newcomers to agent repos most often lack:

- Agent concepts: `/ai-agent`, `/sub-agent`, `/agent-loop`, `/tool-calling`, `/mcp`, `/skill`, `/human-in-the-loop`, `/context-engineering`, `/harness-engineering`
- LLM mechanics: `/token`, `/context-window`, `/system-prompt`, `/structured-output`, `/streaming-response`, `/ai-hallucination`
- Engineering practice: `/unit-test`, `/integration-test`, `/e2e-test`, `/test-coverage`, `/ci`, `/cd`, `/lint`, `/deployment`, `/feature-flag`, `/rollback`
- Git workflow: `/commit`, `/branch`, `/pull-request`, `/merge`, `/diff`, `/worktree`

## Rules of use

- Repo terms still cite the repo file first — VibeHub is only for the *underlying general concept* behind a gap (field 3 of the checklist), never a substitute for the repo's own docs.
- Give at most 1–2 links per gap; the checklist is a to-do list, not a reading list.
- Keep the re-check probe unchanged — the link teaches the concept, the probe still verifies the newcomer can *use* it.

---
name: publish-skill
description: Publish or update a skill in the chenhao-skills GitHub repo. Use when the user wants to publish, push, share, or sync a skill to GitHub / chenhao-skills, or update a skill already published there.
---

# publish-skill

Publish a skill to the `chenhao-skills` GitHub repo (`UnknownObject777/chenhao-skills`). Repo layout: one top-level directory per skill, e.g. `onboarding-check/SKILL.md`; the README carries a one-line entry per skill.

The local checkout lives at `D:/找工作/chenhao-skills`; clone it there if missing.

## Steps

### 1. Validate the source skill

Locate the skill's directory — project `.agents/skills/<name>/` or user `~/.agents/skills/<name>/`; ask if ambiguous. Check:

- `SKILL.md` exists, and its frontmatter `name` matches the directory name.
- `description` is present unless the skill sets `disable-model-invocation: true`.

Completion criterion: every file belonging to the skill is identified, and any validation problem is fixed or explicitly waived by the user before publishing.

### 2. Sync into the checkout

Bring the local checkout up to date (`git pull`, cloning first if needed), then copy the skill directory to the repo root as `<name>/`, overwriting the previously published version. Touch nothing else — other skills' directories are out of scope for this change.

Completion criterion: `git status` shows changes only inside the target skill's directory, plus the README skill list if it changed.

### 3. Publish

Update the README skill list if the skill is new or its one-line summary changed. Commit with a Conventional Commit message (`feat: add <name>` / `feat: update <name>`) and push. If the GitHub repo does not exist yet, create it: `gh repo create UnknownObject777/chenhao-skills --public --source . --push`.

Completion criterion: the pushed commit is visible on GitHub (`gh repo view UnknownObject777/chenhao-skills`) and contains exactly the intended files — no scratch files, no unrelated skills.

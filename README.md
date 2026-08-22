# chenhao-skills

个人收集的 agent skills 仓库，每个 skill 一个顶层目录。

## Skills

- [asu](asu/SKILL.md) — 中文求职经历酥化技能：根据目标岗位把真实经历重组为清晰的岗位定位、简历要点、项目亮点和 HR 开场白。
- [chrome-bookmark-reorganize](chrome-bookmark-reorganize/SKILL.md) — 重新分类/整理 Chrome 书签，处理本地 Bookmarks 文件与 Google 同步冲突。
- [eli5](eli5/SKILL.md) — 用大白话解释研究、论文或技术概念：去术语、给类比、给清晰结论。
- [dsh-archive-agent-notes](dsh-archive-agent-notes/SKILL.md) — 新增/审计/归档/恢复 DeepSeek Harness 的 Agent Notes，按未来决策价值分类并清理已被取代的记录。
- [dsh-code-review](dsh-code-review/SKILL.md) — 按仓库的 AGENTS.md 规范、防御性模式和质检门槛审查 deepseek-harness 的 PR。
- [dsh-doc-site-sync](dsh-doc-site-sync/SKILL.md) — 发布/更新/移动/删除 DeepSeek Harness 文档站页面，排查 VitePress 投影问题。
- [dsh-doc-standards](dsh-doc-standards/SKILL.md) — 应用 DeepSeek Harness 文档规范：层级结构、教程与参考之分、文档预算、剔除水文。
- [dsh-find-simplifications](dsh-find-simplifications/SKILL.md) — 在 deepseek-harness 里找不明显的可简化点，并为它们写有据可依的 Agent Note / TODO 记录。
- [dsh-merging-stacked-prs](dsh-merging-stacked-prs/SKILL.md) — 通过 GitHub 官方 stack 对象和 `gh stack merge` 落地相互依赖的一摞 PR。
- [dsh-pre-push-checks](dsh-pre-push-checks/SKILL.md) — 为待推送的 deepseek-harness 改动挑选最小必要测试/检查，而不是跑全量套件。
- [dsh-prose-standard](dsh-prose-standard/SKILL.md) — 在 deepseek-harness 里撰写/审阅/精简文字，保住契约的同时删掉转述、重复与装饰。
- [dsh-translate-docs](dsh-translate-docs/SKILL.md) — 运行 DeepSeek Harness 扩展版双语文档流程：生成简报、委派翻译、配对校验。
- [dsh-trim-cot-leakage](dsh-trim-cot-leakage/SKILL.md) — 审计并修掉读起来像推理过程泄出的文字（变更叙述、评审安排、规划残留）。
- [onboarding-check](onboarding-check/SKILL.md) — 摸底新成员对仓库术语和开发约定的掌握程度，合格就放行参与开发，不合格就发一份补课清单。
- [primary-contradiction](primary-contradiction/SKILL.md) — 从一段讨论或一件事里识别出主要矛盾与次要矛盾，把注意力锚定在起决定作用的那处对立上，并指出先动哪里。
- [publish-skill](publish-skill/SKILL.md) — 把这个仓库里的某个 skill 发布或更新到 GitHub。
- [record-browser-gif](record-browser-gif/SKILL.md) — 把浏览器/网页交互演示录成优化过的 GIF，并为 PR 发布到独立的 assets 分支。
- [to-kanban](to-kanban/SKILL.md) — 把一份需求（PRD / 需求文档 / 一句口述）拆成一张可直接执行的 Obsidian kanban-plugin 看板。
- [x-bookmarks-to-obsidian](x-bookmarks-to-obsidian/SKILL.md) — 把 X 收藏夹批量转写进 Obsidian vault，clone 其中提到的 GitHub 仓库并转录开发文档笔记。

## Install

Copy a skill directory into a project's `.agents/skills/` (project scope) or `~/.agents/skills/` (user scope).

---
name: x-bookmarks-to-obsidian
description: Sync X (Twitter) bookmarks into an Obsidian vault as markdown notes, clone any GitHub repos mentioned in them locally, and transcribe repo READMEs into dev-doc notes. Use when user mentions "X 收藏夹", "bookmarks 转 obsidian", "sync X bookmarks", "收藏夹收集", or wants to archive X bookmarks into Obsidian.
---

# X Bookmarks to Obsidian

把 X 收藏夹批量转写进 Obsidian vault，并把收藏夹里提到的 GitHub 仓库 clone 到本地、转录成开发文档笔记。

## 依赖

- **baoyu-danger-x-to-markdown**（必须已安装）：本 skill 复用它的认证（cookies / Chrome 登录）与单条推文转换脚本。查找顺序：env `X_TO_MARKDOWN_SKILL_DIR` → `~/.agents/skills/baoyu-danger-x-to-markdown`。
- **bun**（`npx -y bun` 运行脚本）与 **git**。

## 配置

| 项 | 默认值 | 说明 |
|----|--------|------|
| Vault 路径 | `D:/Obsidian Vault/AI Research` | 不存在则创建；可用 env `OBSIDIAN_VAULT_DIR` 覆盖 |
| 收藏夹笔记目录 | `<vault>/X Bookmarks/` | 每条推文一个子目录 `<username>/<tweet-id>.md` |
| 索引笔记 | `<vault>/X Bookmarks Index.md` | 按作者分组的 wikilink 列表 |
| 状态文件 | `<vault>/X Bookmarks/.sync-state.json` | 记录已处理 tweet id，增量同步 |
| 仓库 clone 目录 | `D:/x-bookmarks-repos` | 可用 env `X_BOOKMARKS_REPO_DIR` 覆盖 |

## 工作流

### 1. 前置检查

- 确认 baoyu-danger-x-to-markdown 已安装（`test -d ~/.agents/skills/baoyu-danger-x-to-markdown/scripts`）。
- 认证沿用 baoyu 的机制：env `X_AUTH_TOKEN`/`X_CT0` → cookie 文件 → Chrome CDP 登录。未授权时按其 consent 流程处理（`%APPDATA%/baoyu-skills/x-to-markdown/consent.json`）。

### 2. 抓取收藏夹

```bash
npx -y bun ${SKILL_DIR}/scripts/bookmarks.ts --count 50
```

stdout 输出 JSON 数组：`[{id, url, author, text, createdAt}]`，日志在 stderr。用 `--cursor` 可继续翻页。

### 3. 增量过滤

读 `<vault>/X Bookmarks/.sync-state.json`（不存在视为空），只处理未见过的 tweet id。

### 4. 逐条转换进 vault

对每条新书签：

```bash
npx -y bun <baoyu>/scripts/main.ts <url> -o "<vault>/X Bookmarks/"
```

产出 `<vault>/X Bookmarks/<username>/<tweet-id>.md`。媒体下载遵循 baoyu EXTEND.md 的 `download_media` 设置（`ask` 时对整批统一问一次即可）。失败的条目记录下来继续，最后汇总。

### 5. 更新索引笔记

刷新 `<vault>/X Bookmarks Index.md`：按作者分组，列出所有收藏笔记的 `[[wikilink]]`（Obsidian wikilink 只需笔记名，如 `[[1823456789012345678]]`）。

### 6. 处理 GitHub 仓库

扫描本次新笔记中的 `https://github.com/<owner>/<repo>` 链接：

- 去重；跳过 gist、`/issues/`、`/pull/`、`/blob/`、`/tree/` 等非仓库根链接（取 owner/repo 两段即可）。
- 对每个仓库：`git clone https://github.com/<owner>/<repo> <repo-dir>/<repo>`；已存在则 `git -C <repo-dir>/<repo> pull --ff-only`。

### 7. 转录开发文档笔记

对每个新 clone 的仓库：

1. 读 README（README.md / readme.md 等；README 信息不足时浏览 `docs/` 顶层）。
2. 在 vault 根生成 `<Repo 名> 开发文档.md`，内容：项目定位、核心功能、技术栈、快速上手、架构要点。
3. 笔记底部附：GitHub 链接、本地路径、`[[wikilink]]` 回链来源推文笔记。
4. 把该笔记加入 `X Bookmarks Index.md`。

### 8. 更新状态并汇报

把成功处理的 tweet id 写入 `.sync-state.json`（结构：`{"processedIds": [...], "updatedAt": "<ISO>"}`），然后汇报：新增 N 条收藏笔记、M 个仓库、失败条目及原因。

## 排错

- `Missing auth cookies` → 设 `X_AUTH_TOKEN`/`X_CT0`，或运行 baoyu 的 `--login` 走 Chrome 登录。
- 网络无法直连 x.com（curl 返回 000）→ 先 `export HTTPS_PROXY=http://127.0.0.1:<port>` 再运行脚本。
- `X API error (403/404)` → X 可能轮换了 Bookmarks queryId；脚本会自动从 client bundle 重新解析，仍失败则更新脚本里的 `FALLBACK_BOOKMARKS_QUERY_ID`。
- 某条推文转换失败（已删除/受保护）→ 记入失败列表，不中断整批。

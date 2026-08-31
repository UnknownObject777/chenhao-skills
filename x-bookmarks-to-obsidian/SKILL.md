---
name: x-bookmarks-to-obsidian
description: Sync social-media favorites/bookmarks (X/Twitter, 知乎, 哔哩哔哩收藏夹, 小红书收藏) into an Obsidian vault as markdown notes with incremental state, daily digest and index. Also clones GitHub repos mentioned in X bookmarks and saves single X URLs. Use when user mentions "收藏夹同步", "收藏转 obsidian", "sync bookmarks", "B站收藏夹", "小红书收藏", "知乎收藏", "X 收藏夹", "每日收藏", or wants to archive social favorites into Obsidian.
---

# Social Favorites to Obsidian

把各社交平台的收藏批量转写进 Obsidian vault（skill 名保留历史名称 x-bookmarks-to-obsidian）。支持四个来源：

| 平台 | 抓取方式 | 能拿到什么 |
|------|----------|-----------|
| X (Twitter) | 自建 GraphQL 脚本（复用 baoyu 认证） | 推文全文 + 媒体 |
| 知乎 | zhihu-cli（已认证） | 标题、摘要、收藏时间、互动数；有 web cookie 时可补全文 |
| 哔哩哔哩 | Web API + SESSDATA cookie | 收藏夹、视频标题/简介/UP主/时长/封面 |
| 小红书 | Playwright + web cookie 抓 DOM | 笔记卡片（标题/作者/链接）；可逐条补正文 |

X 收藏夹里提到的 GitHub 仓库仍会 clone 到本地并转录开发文档笔记（步骤 8）。

## 统一数据格式

四个抓取脚本 stdout 都输出同一结构的 JSON 数组，后续步骤按 `platform` 分派：

```json
[{ "platform": "zhihu|bilibili|xiaohongshu|x",
   "id": "...", "url": "...", "title": "...", "author": "...",
   "summary": "...", "content": "", "favoritedAt": "<ISO>", "extra": {} }]
```

日志一律走 stderr，可以把 stdout 直接重定向到临时文件。

## 依赖

- **bun**（`npx -y bun` 运行 TS 脚本）、**git**、**python + playwright**（小红书）。
- **zhihu-cli**（知乎；`C:\Users\cch\AppData\Local\ZhihuCLI\current\zhihu-cli.exe`，已认证，env `ZHIHU_CLI` 可覆盖）。
- **baoyu-danger-x-to-markdown**（仅 X 需要）：复用其认证与单条推文转换脚本。查找顺序：env `X_TO_MARKDOWN_SKILL_DIR` → `~/.agents/skills/baoyu-danger-x-to-markdown`。

## 配置

| 项 | 默认值 | 说明 |
|----|--------|------|
| Vault 路径 | `C:/Users/cch/OneDrive/Q2+Q3` | 用户主知识库；env `OBSIDIAN_VAULT_DIR` 覆盖 |
| 收藏笔记根目录 | `<vault>/收藏/` | 每平台一个子目录：`收藏/X/`、`收藏/知乎/`、`收藏/哔哩哔哩/`、`收藏/小红书/` |
| 总览索引 | `<vault>/收藏/收藏总览.md` | 按平台分组的 wikilink 列表 |
| 日报目录 | `<vault>/收藏/日报/` | 每次同步追加到 `YYYY-MM-DD.md` |
| 状态文件 | `<vault>/收藏/.sync-state.json` | 按平台记录已处理 id，增量同步 |
| 凭证目录 | `%APPDATA%/social-favorites/` | 各平台 cookie 文件（见下） |
| 仓库 clone 目录 | `D:/x-bookmarks-repos` | 仅 X；env `X_BOOKMARKS_REPO_DIR` 覆盖 |

### 凭证（每个平台一次配置）

凭证目录下三个纯文本文件，均可用同名 env 覆盖：

| 文件 | env | 需要内容 |
|------|-----|---------|
| `bilibili-cookie.txt` | `BILIBILI_COOKIE` | bilibili.com 登录后完整 Cookie 头（至少含 `SESSDATA`） |
| `xiaohongshu-cookie.txt` | `XHS_COOKIE` | xiaohongshu.com 登录后完整 Cookie 头（至少含 `web_session`） |
| `zhihu-cookie.txt` | `ZHIHU_COOKIE` | 可选；zhihu.com 登录 Cookie，仅用于 `--with-content` 抓全文 |

获取方式：浏览器登录对应站点 → F12 → Network → 任一同域请求 → 复制请求头里完整的 `Cookie:` 值，粘贴进文件。cookie 过期（B 站报未登录 / 小红书找不到收藏 tab）时重新复制一次即可。

## 工作流

### 1. 前置检查

- 知乎：`zhihu-cli status` 正常即可。
- 哔哩哔哩 / 小红书：对应 cookie 文件或 env 存在。缺哪个就引导用户按上表配置，本次跳过该平台，不要中断其他平台。
- X：`test -d ~/.agents/skills/baoyu-danger-x-to-markdown/scripts`；认证沿用 baoyu 机制（env `X_AUTH_TOKEN`/`X_CT0` → cookie 文件 → Chrome CDP 登录）。

### 2. 抓取各平台收藏

```bash
# SKILL_DIR = 本 skill 目录（含 scripts/）

# 知乎：日常增量用 recent；首次全量用 --all（遍历收藏夹分页）
npx -y bun "${SKILL_DIR}/scripts/zhihu_favorites.ts" --limit 50 --with-content > /tmp/fav-zhihu.json
npx -y bun "${SKILL_DIR}/scripts/zhihu_favorites.ts" --all --with-content > /tmp/fav-zhihu.json   # 首次全量

# 哔哩哔哩：默认遍历全部收藏夹；--folder 可限定
npx -y bun "${SKILL_DIR}/scripts/bilibili_favorites.ts" > /tmp/fav-bilibili.json

# 小红书：注入 cookie 开浏览器抓「收藏」tab；--with-content 逐条补正文（慢，易触发验证）
python "${SKILL_DIR}/scripts/xiaohongshu_favorites.py" --max 50 > /tmp/fav-xhs.json

# X：原流程不变
npx -y bun "${SKILL_DIR}/scripts/bookmarks.ts" --count 50 > /tmp/fav-x.json
```

### 3. 增量过滤

读 `<vault>/收藏/.sync-state.json`（结构：`{"zhihu": {"ids": [...]}, "bilibili": {...}, "xiaohongshu": {...}, "x": {...}, "updatedAt": "<ISO>"}`），每平台只处理未见过的 id。小红书卡片不暴露收藏时间，完全依赖状态文件去重。

### 4. 写笔记

每条收藏一个文件：`<vault>/收藏/<平台>/<标题>-<id>.md`。

- 标题 ≤20 字符（标题缺失时用正文/摘要概括），去掉 `\ / : * ? " < > |` 与首尾空格、点；保留 id 后缀保证唯一、与状态文件可对应。
- frontmatter：`platform`、`url`、`author`、`favorited_at`、`synced_at`、`tags: [收藏/<平台>]`。
- 正文按平台：
  - **知乎**：`content` 非空放全文，否则放摘要；附作者、收藏夹名、赞同/评论数，末尾 `来源: [原链接](url)`。
  - **哔哩哔哩**：视频元数据卡（UP 主、时长、所属收藏夹、封面图 `![](cover)`、简介）；`extra.invalid=true` 的标记「已失效」。
  - **小红书**：`content` 非空放正文，否则只留标题/作者/点赞数；末尾来源链接。
  - **X**：沿用 baoyu `main.ts` 转换产物（独立临时目录 → 复制进 vault；**不要直接 `-o` 到 vault**，baoyu 会把已存在的作者目录改名成 `<username>-backup-<时间戳>` 导致同作者互相覆盖）。

### 5. 收藏日报

把本次新增追加到 `<vault>/收藏/日报/<今天>.md`，按平台分组列 `[[wikilink]]`，每条附 ≤15 字备注。这是「每天收藏了什么」的时间线视图；当天文件不存在则新建（含 frontmatter `tags: [收藏日报]`）。

### 6. 更新总览索引

刷新 `<vault>/收藏/收藏总览.md`：按平台分组（X 内部再按内容主题分组，5–8 个简洁中文主题），列出全部收藏笔记的 wikilink。文件名变更后同步更新 vault 内指向旧名的 `[[wikilink]]`。

### 7. （可选）主题归档

X 笔记按主题归入 `收藏/X/<主题>/` 子目录；知乎/B站/小红书默认平铺在各自平台目录，数量大了再按收藏夹或主题细分。

### 8. 处理 GitHub 仓库（仅 X）

扫描本次新 X 笔记中的 `https://github.com/<owner>/<repo>` 链接（t.co 短链先 HEAD 解析跳转）。去重，跳过 gist、`/issues/`、`/pull/`、`/blob/`、`/tree/` 等非仓库根链接。对每个仓库：`git clone` 到仓库目录；已存在则 `git -C ... pull --ff-only`。然后读 README 生成 `<vault>/<Repo 名> 开发文档.md`（项目定位、核心功能、技术栈、快速上手、架构要点 + GitHub 链接、本地路径、回链推文笔记），并加入总览索引。

### 9. 更新状态并汇报

把成功处理的 id 按平台写入 `.sync-state.json`，然后汇报：各平台新增 N 条、仓库 M 个、失败条目及原因、被跳过的平台（缺凭证）。

## 单条录入（X）

输入一个 X 地址（`https://x.com/<user>/status/<id>` 或 `https://x.com/i/article/<id>`）时，走精简版，跳过抓取与增量过滤：

1. 前置检查（步骤 1）。
2. 按步骤 4 的 X 方式转换该 URL。
3. 描述性重命名并归入对应主题子目录。
4. 插入 `收藏总览.md` 对应分组，不重写整个索引。
5. 含 GitHub 仓库链接时询问是否 clone + 转录（步骤 8），默认只登记不展开。
6. 该 tweet id 合并进 `.sync-state.json` 的 `x.ids`。
7. 汇报笔记路径。id 已存在则直接指向已有笔记，不重复转换。

## 每日自动同步

建议用一条定时提醒驱动本 skill（例如每天上午 cron 一次）：提醒触发后按步骤 1–3→4→5→6→9 执行，知乎用 `recent` 模式。首次使用先跑全量（知乎 `--all`、B站全收藏夹、小红书 `--max` 调大）建立基线，之后日常增量即可。

## 排错

- 知乎 `zhihu-cli` 报错 → 先 `zhihu-cli status`；认证问题按其 `auth` 命令处理。`--with-content` 全部失败（403）→ 配 `zhihu-cookie.txt`；不配也能用，只是只有摘要。
- 哔哩哔哩 `not logged in (code=-101)` → SESSDATA 过期，重新复制 cookie。接口返回 `-352` 等风控码 → 降低频率稍后重试。
- 小红书找不到收藏 tab / 跳登录 → cookie 失效，重新复制；收藏 tab 仅在登录态自己主页可见。抓正文触发「验证」→ 去掉 `--with-content`，或加大 `--delay`。headless 易被拦，默认有头模式会弹出浏览器窗口，属正常。
- X：`Missing auth cookies` → 设 `X_AUTH_TOKEN`/`X_CT0` 或跑 baoyu 的 `--login`。网络无法直连 x.com（curl 返回 000）→ 先 `export HTTPS_PROXY=http://127.0.0.1:<port>`。`X API error (403/404)` → queryId 轮换，脚本会自动重新解析，仍失败则更新脚本里的 `FALLBACK_BOOKMARKS_QUERY_ID`。`429` → 完全静置约 15 分钟再以 ≥15s 间隔慢速重试。
- 某一条转换失败（已删除/受保护）→ 记入失败列表，不中断整批。

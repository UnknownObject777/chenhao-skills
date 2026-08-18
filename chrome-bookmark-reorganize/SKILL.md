---
name: chrome-bookmark-reorganize
description: 重新分类/整理 Chrome 书签，处理本地 Bookmarks 文件与 Google 同步冲突。Use when 用户要求整理书签、重新分类书签栏、批量移动书签、提到书签栏混乱/书签同步/bookmarks 文件，或遇到"书签文件已损坏"错误。
---

# Chrome 书签重分类

把混乱的书签栏整理成清晰的分类树。核心难点不是改文件，而是**绕过 Google 同步的合并行为**和**重算 Chromium checksum**。

## 三条铁律（用踩坑换来的，必须遵守）

**铁律 1：改文件前先确认同步状态。** 若用户登录了 Google 账号且书签同步开启，直接改本地 `Bookmarks` 文件会被同步引擎撤销——它会把云端记录的旧结构合并回来。必须先在 Chrome 内关闭书签同步（`chrome://settings/syncSetup` → 关闭书签类型），或让用户断网启动 Chrome。检测方法见 Phase 2。

**铁律 2：移动操作必须由 Chrome 执行。** 脚本只能「删除旧树 + 重建新树」，**不能移动已有节点**。同步引擎按节点的"原始位置"记录，脚本移动一个书签后，Chrome 启动会把它从云端"恢复"回原位。如果只是少量书签需要换位置，让用户在书签管理器（`⌘+Shift+O`）里手动拖动——Chrome 自己执行的移动才能正确同步。

**铁律 3：checksum 必须重算。** `Bookmarks` 文件顶层有 `checksum` 字段，直接改 JSON 不重算它 → Chrome 报「书签文件已损坏」并从 `Bookmarks.bak` 恢复。用 `scripts/compute_checksum.py` 重算。算法见 [references/checksum-algorithm.md](references/checksum-algorithm.md)。

## 工作流

### Phase 1：探查现状
- [ ] 读 `Bookmarks` 文件，统计书签总数、当前分类结构
- [ ] 识别问题：重复 URL、空文件夹、混杂的"杂物筐"分类、孤儿书签

### Phase 2：检查同步状态（关键，别跳过）
- [ ] 读 `Preferences` 文件，查 `sync.data_type_status_for_sync_to_signin.bookmarks`
- [ ] 若为 `true`：**必须先让用户在 Chrome 内关闭书签同步**，否则 Phase 5 的写入白做
- [ ] 详情见 [references/sync-conflict.md](references/sync-conflict.md)

### Phase 3：设计新分类（与用户对齐）
- [ ] 按用户实际领域写分类规则（参考 `scripts/reorganize.py` 的 `classify()`）
- [ ] **先预览**（不加 `--write`），把分类结果给用户确认
- [ ] 原则：按"做什么用"分而非"什么时候用"；每层不超过 ~8 项

### Phase 4：关 Chrome + 关同步
- [ ] 确认 Chrome **完全退出**（`⌘+Q`，不是关窗口）：`pgrep -f "Google Chrome.app/Contents/MacOS/Google Chrome"`
- [ ] Chrome 运行时改文件，它退出会用内存版本覆盖回去

### Phase 5：备份 → 重写 → 重算 → 原子写入
- [ ] **先备份**：`cp Bookmarks /tmp/Bookmarks.backup_$(date +%Y%m%d_%H%M%S)`
- [ ] 用 `scripts/reorganize.py <file> --write` 重排（已内置 checksum 重算 + 原子写入 + 写后自检）
- [ ] 写入后再跑 `scripts/compute_checksum.py <file>` 独立验证一次

### Phase 6：验证 + 同步善后
- [ ] 打开 Chrome，肉眼检查书签栏
- [ ] 等几秒让同步引擎跑完，再读一次文件确认没被清空/合并
- [ ] 若一切正常，用户可选择重新开启书签同步（本地此时是权威版，会上传覆盖云端）
- [ ] 若又被合并：见 [references/sync-conflict.md](references/sync-conflict.md) 的「反复冲突」章节

## 关键文件位置（macOS）

| 文件 | 路径 | 作用 |
|------|------|------|
| 书签 | `~/Library/Application Support/Google/Chrome/<Profile>/Bookmarks` | 主文件，JSON 格式 |
| 书签备份 | 同目录 `Bookmarks.bak` | Chrome 自动保存的上一版 |
| 配置 | 同目录 `Preferences` | 含同步开关 |

`<Profile>` 通常是 `Default`，多账号时可能是 `Profile 1`、`Profile 2`。

## 脚本

| 脚本 | 用途 |
|------|------|
| `scripts/compute_checksum.py <file>` | 验证/重算 checksum。`--compute-only` 只输出值 |
| `scripts/reorganize.py <file> [--write]` | 书签重排模板。分类规则需按现场定制 `classify()` |

两个脚本都是**参考实现**：读它们理解算法，按现场情况调整。`reorganize.py` 默认预览模式，确认后加 `--write` 才写盘。

## 深度文档

| 文档 | When to Read |
|------|--------------|
| [references/sync-conflict.md](references/sync-conflict.md) | 用户开了 Google 同步、或重排后书签又被清空/合并 |
| [references/checksum-algorithm.md](references/checksum-algorithm.md) | 需要理解/调试 checksum 计算，或迁移到非 Python 实现 |

# Chromium 书签 Checksum 算法

Chrome 的 `Bookmarks` 文件顶层有一个 `checksum` 字段（32 位 MD5 hex）。它是 Chrome 检测「外部篡改」的机制——直接改 JSON 而不更新 checksum，Chrome 会报「书签文件已损坏」并从 `Bookmarks.bak` 恢复。

## 算法来源

`chromium/components/bookmarks/browser/bookmark_codec.cc`

核心方法：
- `UpdateChecksumWithURLNode(id, url, title)` —— url 节点
- `UpdateChecksumWithFolderNode(id, title)` —— folder 节点
- 底层 `UpdateChecksum(const std::string&)` 和 `UpdateChecksum(const std::u16string&)`

## 字段顺序与编码

对每个节点，按以下顺序把字节喂进 MD5 累加器：

### URL 节点
```
id    → UTF-8 字节
name  → UTF-16LE 字节（每字符 2 字节，中文/emoji 用 surrogate pair）
"url" → UTF-8 字节（字面量，3 个字符）
url   → UTF-8 字节
```

### Folder 节点
```
id       → UTF-8 字节
name     → UTF-16LE 字节
"folder" → UTF-8 字节（字面量，6 个字符）
```

然后 **DFS 前序递归**处理 children（folder 本体先于其 children）。

### 根节点
`bookmark_bar`、`other`、`synced` 三个根节点**自身也参与 checksum**（它们是 folder，有自己的 id 和 name）。它们的 id 通常是固定的 `"1"`、`"2"`、`"3"`，name 是 `"bookmark_bar"` 等。

## 关键陷阱

### 1. name 用 UTF-16LE，不是 UTF-8
这是最容易错的点。Chromium 内部用 `std::u16string` 存书签名，喂进 MD5 时是 little-endian 的 UTF-16 字节。中文、emoji 都要正确编码。

```python
md5.update(name.encode("utf-16-le"))  # ✅ 正确
md5.update(name.encode("utf-8"))      # ❌ 错误（仅对 ASCII 恰好碰巧相等）
```

### 2. "url" 和 "folder" 是字面量标记
这两个字符串是节点类型的标记，必须原样喂入（UTF-8），不能省略也不能改。

### 3. id 是字符串
JSON 里的 `id` 字段是字符串类型（如 `"42"`），不是整数。喂入时保持字符串形式。

## Python 实现

完整参考实现在 `../scripts/compute_checksum.py`。核心逻辑：

```python
import hashlib

def compute_checksum(data):
    md5 = hashlib.md5()
    def upd_s(s): md5.update(s.encode("utf-8"))
    def upd_u16(s): md5.update(s.encode("utf-16-le"))

    def walk(node):
        t = node.get("type")
        nid = str(node.get("id", ""))
        name = node.get("name", "")
        if t == "url":
            upd_s(nid); upd_u16(name); upd_s("url"); upd_s(node.get("url", ""))
        else:
            upd_s(nid); upd_u16(name); upd_s("folder")
            for c in node.get("children", []):
                walk(c)

    for root_key in ("bookmark_bar", "other", "synced"):
        walk(data["roots"][root_key])
    return md5.hexdigest()
```

## 验证方法（动手前必做）

**不要在真实文件上第一次跑你的算法。** 先用一个已知正确的文件验证你能复现它的 checksum：

```bash
python3 scripts/compute_checksum.py ~/Library/.../Default/Bookmarks
# stored:   10cf2c6e18dde16cbeacc56f8696eed3
# computed: 10cf2c6e18dde16cbeacc56f8696eed3
# result:   MATCH - Chrome will load this file
```

如果 `MATCH`，说明你的算法正确，重排后重算的 checksum Chrome 也会认可。
如果 `MISMATCH`，先调试算法（最常见原因是 name 的编码用错了 UTF-8），别急着改文件。

## 重排后重算

构建好新的书签树后，在写盘前更新 checksum：

```python
data["checksum"] = compute_checksum(data)
```

然后正常写盘。Chrome 加载时会用同样算法验证，匹配则正常加载。

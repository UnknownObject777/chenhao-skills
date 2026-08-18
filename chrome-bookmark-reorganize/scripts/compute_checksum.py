#!/usr/bin/env python3
"""Compute / verify Chrome's Bookmarks file checksum.

Chromium 用这个 checksum 检测外部篡改。直接改 JSON 而不重算它，Chrome 会报
"书签文件已损坏" 并从 Bookmarks.bak 恢复。所以重排书签后必须重算并写回。

算法来源: chromium/components/bookmarks/browser/bookmark_codec.cc
字段顺序与编码见 ../references/checksum-algorithm.md

Usage:
    # 验证现有文件的 checksum 是否正确（Chrome 能否正常加载）
    python3 compute_checksum.py ~/Library/.../Default/Bookmarks

    # 只打印计算值（不与文件内的 checksum 字段对比），用于给重排后的文件重算
    python3 compute_checksum.py --compute-only path/to/Bookmarks

Output:
    验证模式: 打印 stored / computed / 是否匹配
    --compute-only: 只打印 32 位 hex checksum（适合管道）
"""
import argparse
import hashlib
import json
import sys


def compute_checksum(data):
    """对解析后的 Bookmarks JSON dict 计算 Chromium 兼容的 checksum。

    每个 bookmark 节点按固定顺序喂进 MD5：
      url 节点:    id (utf-8) → name (utf-16-le) → "url" (utf-8) → url (utf-8)
      folder 节点: id (utf-8) → name (utf-16-le) → "folder" (utf-8)
      然后 DFS 前序递归处理 children。

    三个根节点 bookmark_bar / other / synced 自身也参与（它们是 folder）。
    """
    md5 = hashlib.md5()

    def update_str(s):
        md5.update(s.encode("utf-8"))

    def update_u16(s):
        md5.update(s.encode("utf-16-le"))

    def walk(node):
        node_type = node.get("type")
        node_id = str(node.get("id", ""))
        name = node.get("name", "")
        if node_type == "url":
            update_str(node_id)
            update_u16(name)
            update_str("url")
            update_str(node.get("url", ""))
        else:  # folder
            update_str(node_id)
            update_u16(name)
            update_str("folder")
            for child in node.get("children", []):
                walk(child)

    for root_key in ("bookmark_bar", "other", "synced"):
        walk(data["roots"][root_key])

    return md5.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("file", help="path to a Chrome Bookmarks JSON file")
    parser.add_argument(
        "--compute-only",
        action="store_true",
        help="只打印计算出的 checksum，不与文件内 stored 值对比",
    )
    args = parser.parse_args()

    with open(args.file, encoding="utf-8") as f:
        data = json.load(f)

    computed = compute_checksum(data)

    if args.compute_only:
        print(computed)
        return

    stored = data.get("checksum", "(missing)")
    match = computed == stored
    print(f"stored:   {stored}")
    print(f"computed: {computed}")
    print(f"result:   {'MATCH - Chrome will load this file' if match else 'MISMATCH - Chrome will restore from .bak'}")
    sys.exit(0 if match else 1)


if __name__ == "__main__":
    main()

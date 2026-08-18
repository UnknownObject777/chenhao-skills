#!/usr/bin/env python3
"""Chrome 书签重排模板脚本。

⚠️  使用前必读 ../SKILL.md 的「三条铁律」。本脚本只处理「重写文件 + 重算 checksum」，
    不处理 Google 同步冲突。若用户开了书签同步，必须先在 Chrome 内关掉，否则本脚本的
    输出会被同步引擎撤销。

工作流:
    1. 读取当前 Bookmarks 文件
    2. DFS 收集所有 url 节点（保留原 id/date_added 等字段）
    3. 去重（同 url 只留第一个）
    4. 调用 classify() —— ⚠️ 这是需要你按现场定制的部分，下方只给示例
    5. 按新分类构建新树（新建文件夹用负数 id 避开现有空间）
    6. 重算 checksum（Chromium 算法，见 compute_checksum.py）
    7. 原子写入（临时文件 → 自检 → rename）

默认是「预览模式」，只打印分类结果不写盘。确认无误后加 --write 才真正写入。

Usage:
    python3 reorganize.py ~/Library/.../Default/Bookmarks            # 预览
    python3 reorganize.py ~/Library/.../Default/Bookmarks --write    # 写盘

如何定制 classify():
    classify() 接收一个书签节点 dict，返回 (category, subcategory) 元组或 None。
    按用户的实际书签调整下面的规则。常见判断依据: node["url"]、node["name"]、域名。
    把示例规则替换成针对当前用户书签的规则即可。
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from urllib.parse import urlparse


# ============================================================================
# 分类函数 —— ⚠️ 按现场定制这部分
# ============================================================================
# 下面是一组示例规则。真实使用时，先读一遍用户的书签（预览模式会打印全集），
# 然后按用户的实际领域写规则。返回 (顶层分类, 子分类) 元组；返回 None 则归入"未分类"。

def classify(node):
    """把一个书签节点映射到 (category, subcategory)。返回 None 表示未分类。"""
    url = node.get("url", "").lower()
    name = node.get("name", "").lower()
    domain = urlparse(url).netloc.lower()

    # ---- 示例规则 1: 公司内网 ----
    # if "mycompany-int.com" in domain:
    #     if any(k in name for k in ["wiki", "知识库"]): return ("🏢 工作", "📚 知识")
    #     if any(k in name for k in ["jira", "工单"]):    return ("🏢 工作", "🛠️ 研发")
    #     return ("🏢 工作", "📋 其他")

    # ---- 示例规则 2: AI 工具 ----
    # if domain in {"claude.ai", "chat.openai.com", "gemini.google.com"}:
    #     return ("🤖 AI", "💬 对话")
    # if any(k in domain for k in ["huggingface", "modelscope"]):
    #     return ("🤖 AI", "🔧 模型平台")

    # ---- 示例规则 3: 学习资源 ----
    # if any(k in domain for k in ["coursera", "udemy", "youtube.com"]):
    #     return ("📚 学习", "📺 课程")

    return None  # 未分类 —— 预览时会被列出来，方便补规则


# 新分类的骨架：顶层分类 → 子分类顺序。构建新树时按此顺序排列。
# 只需列出 classify() 会返回的分类；没出现的会被忽略。
CATEGORY_ORDER = [
    # "🏢 工作",
    # "🤖 AI",
    # "📚 学习",
]
SUBCATEGORY_ORDER = {
    # "🏢 工作": ["📚 知识", "🛠️ 研发", "📋 其他"],
    # "🤖 AI": ["💬 对话", "🔧 模型平台"],
}


# ============================================================================
# 以下为通用逻辑，通常不需要改动
# ============================================================================

def chrome_is_running():
    """macOS: 检测 Chrome 主进程是否在运行。"""
    r = subprocess.run(
        ["pgrep", "-f", "Google Chrome.app/Contents/MacOS/Google Chrome"],
        capture_output=True,
    )
    return r.returncode == 0


def collect_url_nodes(data):
    """DFS 收集所有 url 节点（保留完整字段），跨三个 root。"""
    nodes = []

    def walk(node):
        if node.get("type") == "url":
            nodes.append(node)
        elif node.get("type") == "folder":
            for child in node.get("children", []):
                walk(child)

    for root_key in ("bookmark_bar", "other", "synced"):
        walk(data["roots"][root_key])
    return nodes


def dedupe(nodes):
    """同 url 只留第一个出现的。返回 (unique, duplicates)。"""
    seen, unique, dups = set(), [], []
    for n in nodes:
        u = n.get("url", "")
        if u in seen:
            dups.append(n)
        else:
            seen.add(u)
            unique.append(n)
    return unique, dups


def compute_checksum(data):
    """Chromium 兼容的 checksum。详见 compute_checksum.py。"""
    md5 = hashlib.md5()
    md5.update  # noqa
    upd_s = lambda s: md5.update(s.encode("utf-8"))
    upd_u16 = lambda s: md5.update(s.encode("utf-16-le"))

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


def build_new_tree(data, buckets):
    """用 buckets {(cat, sub): [nodes]} 构建新的 bookmark_bar.children。

    新建文件夹分配负数 id 避开现有正数 id 空间。
    保留 data 的 roots 框架（含 sync_metadata 等），只替换 children。
    """
    existing_ids = {str(n.get("id")) for n in collect_url_nodes(data)}
    next_neg = [-1000]

    def new_folder_id():
        while str(next_neg[0]) in existing_ids:
            next_neg[0] -= 1
        existing_ids.add(str(next_neg[0]))
        return str(next_neg[0])

    now = str(int(time.time() * 1000000) + 12993312000000000)

    def mkfolder(name):
        return {"type": "folder", "id": new_folder_id(), "name": name,
                "date_added": now, "date_modified": now, "children": []}

    top = []
    for cat in CATEGORY_ORDER:
        cat_folder = mkfolder(cat)
        for sub in SUBCATEGORY_ORDER.get(cat, []):
            if (cat, sub) in buckets:
                sub_folder = mkfolder(sub)
                sub_folder["children"] = buckets[(cat, sub)]
                cat_folder["children"].append(sub_folder)
        # 无子分类定义、但 classify 返回了的，直接挂在该分类下
        for (c, s), nodes in buckets.items():
            if c == cat and s not in SUBCATEGORY_ORDER.get(cat, []):
                for n in nodes:
                    cat_folder["children"].append(n)
        top.append(cat_folder)

    data["roots"]["bookmark_bar"]["children"] = top
    data["roots"]["bookmark_bar"]["date_modified"] = now
    data["roots"]["other"]["children"] = []
    data["roots"]["synced"]["children"] = []
    return data


def main():
    parser = argparse.ArgumentParser(description="Chrome 书签重排模板")
    parser.add_argument("file", help="path to Chrome Bookmarks file")
    parser.add_argument("--write", action="store_true",
                        help="真正写盘（默认仅预览）")
    args = parser.parse_args()

    if args.write and chrome_is_running():
        print("❌ Chrome 正在运行。请先完全退出 Chrome（⌘+Q），否则写入会被覆盖。", file=sys.stderr)
        sys.exit(1)

    with open(args.file, encoding="utf-8") as f:
        data = json.load(f)

    # 1-2. 收集
    all_nodes = collect_url_nodes(data)
    print(f"共 {len(all_nodes)} 个书签")

    # 3. 去重
    unique, dups = dedupe(all_nodes)
    if dups:
        print(f"去重: 删除 {len(dups)} 个重复，剩余 {len(unique)}")

    # 4. 分类
    buckets = {}
    unclassified = []
    for node in unique:
        cat = classify(node)
        if cat is None:
            unclassified.append(node)
        else:
            buckets.setdefault(cat, []).append(node)

    # 打印预览
    print("\n=== 分类预览 ===")
    for cat in CATEGORY_ORDER:
        subs = {s: ns for (c, s), ns in buckets.items() if c == cat}
        if not subs:
            continue
        total = sum(len(v) for v in subs.values())
        print(f"\n{cat}  ({total})")
        for sub, ns in subs.items():
            print(f"  {sub}  [{len(ns)}]")
    if unclassified:
        print(f"\n⚠️  未分类 ({len(unclassified)}):")
        for n in unclassified:
            print(f"  {n.get('name', '')[:30]}  {n.get('url', '')[:60]}")

    if not args.write:
        print("\n[预览模式] 未写盘。确认后加 --write 参数写入。")
        return

    # 5-6. 构建新树 + 重算 checksum
    new_data = build_new_tree(data, buckets)
    new_data["checksum"] = compute_checksum(new_data)

    # 7. 原子写入
    tmp = args.file + ".tmp_reorganize"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(new_data, f, ensure_ascii=False, indent=3)
        f.write("\n")
    os.chmod(tmp, 0o600)

    # 写后自检
    verify = json.load(open(tmp, encoding="utf-8"))
    assert verify["checksum"] == new_data["checksum"], "checksum 不一致"
    vcount = len(collect_url_nodes(verify))
    assert vcount == len(unique), f"书签数不一致: {vcount} vs {len(unique)}"

    os.replace(tmp, args.file)
    print(f"\n✅ 写入成功: {args.file}")
    print(f"   checksum: {new_data['checksum']}")
    print(f"   书签: {vcount}")


if __name__ == "__main__":
    main()

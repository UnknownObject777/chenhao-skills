#!/usr/bin/env python3
"""文风禁忌扫描：把硬性句式禁忌写成正则，交付前自动过一遍。

用法:
    python3 style_scan.py <文件或目录> [...]
    python3 style_scan.py ../METHODOLOGY.md ../PITFALLS.md

禁忌清单对应 01-chapter-spec-template.md 第 4 节。换项目时按需增删 BANS，
新增条目的唯一门槛是能写成正则；判断不了的写进「表达偏好」交给人评审。

只扫面向读者的正文（章节书稿、课页）。大纲和写作规范是内部工作文档，
不在约束范围内，扫它们会得到一堆无需处理的命中。

扫描前会剥掉三类内容，否则会误报：
    代码块      源码里本来就有这些字符
    行内代码    同上
    「」直接引用 禁忌清单自己要引用被禁的写法

退出码 0 表示干净，1 表示有命中。
"""
import re
import sys
from pathlib import Path

BANS = [
    ("全省略号", r"……", "省略号只用一半 …"),
    ("破折号", r"——", "改成逗号、句号或拆句"),
    ("不是而是", r"不是[^，。；\n]{1,14}而是", "改成正向陈述"),
    ("而不是收尾", r"而不是[^，。；\n]{0,14}[。\n]", "改成正向陈述"),
    ("同义绕过", r"而非[^，。；\n]{0,14}[。\n]", "换词绕不过去，禁的是靠否定制造对比"),
    ("评价式转述", r"(非常巧妙|很简单|非常有道理|十分精妙|相当优雅)", "平铺转述，不给评价"),
    ("情绪词", r"(震撼|细思极恐|刺穿|愣住|炸裂)", "描述具体感受"),
    ("解读前置", r"(这背后其实|这背后有一个)", "直接说判断本身"),
    ("催感悟", r"你品品", "删掉"),
    ("自我感悟", r"(我一直觉得|我想到一个词)", "删掉"),
    ("绝对路径", r"/(Users|home)/[a-zA-Z]", "路径一律相对仓库根"),
    ("过程性语言", r"(大纲写|大纲说|和大纲不符|按规范要求|本次任务|我负责的这一章)",
     "读者没见过大纲和规范"),
]


def strip_noise(text: str) -> str:
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"`[^`\n]*`", "", text)
    return re.sub(r"「[^」\n]*」", "", text)


def scan(path: Path) -> int:
    body = strip_noise(path.read_text(encoding="utf-8"))
    hits = 0
    for name, pattern, fix in BANS:
        for m in re.finditer(pattern, body):
            if hits == 0:
                print(f"\n{path}")
            hits += 1
            around = body[max(0, m.start() - 30):m.end() + 26].replace("\n", " ")
            print(f"  [{name}] …{around}…")
            print(f"           改法：{fix}")
    return hits


def collect(args: list[str]) -> list[Path]:
    files: list[Path] = []
    for a in args:
        p = Path(a)
        if p.is_dir():
            files.extend(sorted(p.rglob("*.md")))
        elif p.is_file():
            files.append(p)
        else:
            print(f"路径不存在：{p}")
            raise SystemExit(2)
    return files


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    files = collect(sys.argv[1:])
    total = sum(scan(f) for f in files)
    print(f"\n共扫 {len(files)} 个文件，命中 {total} 处")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())

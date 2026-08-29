#!/usr/bin/env python3
"""把章节 markdown 编成一本可以读的 HTML 书。

用法:
    python3 book/build_book.py                     # 读 book.config.json
    python3 book/build_book.py --config my.json
    python3 book/build_book.py --keep-selfcheck    # 保留每章末尾的交付自查

输入是阶段三产出的章节 markdown，输出是一个自带封面、目录、正文与封底的
静态站点目录，直接用浏览器打开 index.html 即可阅读。

依赖: markdown（pip install markdown）
"""
from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

try:
    import markdown as md_lib
except ImportError:
    sys.exit("缺少依赖，请先执行: pip install markdown")

ROOT = Path(__file__).resolve().parent
THEME = ROOT / "theme"

METHODOLOGY_NAME = "洛小山·小山学堂方法论"
METHODOLOGY_URL = "https://github.com/itshen/source-reading-methodology"

MD_EXTENSIONS = ["tables", "attr_list", "sane_lists"]

# 章节正文的固定八段，用于给每段配图标与锚点
SECTION_ICONS = {
    "场景还原": "scene",
    "逐行精读": "read",
    "设计决策分析": "why",
    "边界条件剖析": "edge",
    "横向对比": "compare",
    "互动演示设计": "demo",
    "可迁移结论": "takeaway",
    "思考题": "quiz",
}

FENCE_RE = re.compile(r"^(?P<indent>[ \t]*)```(?P<info>[^\n]*)\n(?P<body>.*?)^(?P=indent)```[ \t]*$",
                      re.S | re.M)
CITATION_INFO_RE = re.compile(r"^(\d+):(\d+):(.+)$")

# 省略标记：整行注释，且注释内容紧接着就是 `...`。
# 含 `...` 但前面还有别的话的注释是正常代码，不算省略。
COMMENT_LEAD_RE = re.compile(r"^\s*(?://+|#+|--|/\*+|<!--|\*)?\s*")


@dataclass
class Block:
    """一个从正文里摘出来的围栏块，转换完再塞回去。"""
    kind: str          # citation | mermaid | code
    html: str


CHAPTER_PREFIX_RE = re.compile(r"^第\s*[0-9０-９一二三四五六七八九十百]+\s*[章讲课节][：:、.\s-]*")


@dataclass
class Chapter:
    src: Path
    index: int
    title: str
    meta_lines: list[str]
    summary: str
    body_html: str
    toc: list[tuple[int, str, str]] = field(default_factory=list)  # (level, id, text)
    citations: int = 0
    diagrams: int = 0
    han: int = 0

    @property
    def out_name(self) -> str:
        return f"ch-{self.index:02d}.html"

    @property
    def short_title(self) -> str:
        """去掉标题自带的「第 N 章：」，因为版面上已经单独排了章序。"""
        return CHAPTER_PREFIX_RE.sub("", self.title).strip() or self.title


def slugify(text: str, used: set[str]) -> str:
    base = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", text.strip()).strip("-").lower()
    base = base or "sec"
    slug, n = base, 2
    while slug in used:
        slug, n = f"{base}-{n}", n + 1
    used.add(slug)
    return slug


def is_gap_line(line: str) -> bool:
    return COMMENT_LEAD_RE.sub("", line, count=1).startswith("...")


def line_numbers(count: int, start: int, end: int, gaps: list[int]) -> list[int | None]:
    """省略之后的行号是推不出来的，只有开头和结尾两段能确定。

    开头那段从 start 正着数，结尾那段从 end 倒着数，夹在两个省略之间的段落一律留空。
    宁可不显示，也不显示一个编出来的行号。
    """
    nums: list[int | None] = [None] * count
    if not gaps:
        for i in range(count):
            nums[i] = start + i
        return nums
    for i in range(gaps[0]):
        nums[i] = start + i
    tail = list(range(gaps[-1] + 1, count))
    for k, i in enumerate(tail):
        nums[i] = end - (len(tail) - 1 - k)
    return nums


def render_citation(info: str, body: str) -> str:
    """带行号的源码引用块：显示文件路径、真实行号栏，并按省略标记切段以便步进。"""
    m = CITATION_INFO_RE.match(info)
    start, end, path = (int(m.group(1)), int(m.group(2)), m.group(3)) if m else (1, 1, info or "")
    lines = body.rstrip("\n").split("\n")
    gaps = [i for i, line in enumerate(lines) if is_gap_line(line)]
    nums = line_numbers(len(lines), start, end, gaps)

    if m and not gaps and len(lines) != end - start + 1:
        print(f"  [提示] {path} 声明 {start}:{end} 共 {end - start + 1} 行，"
              f"实际 {len(lines)} 行，行号栏可能对不上")

    seg, rows = 0, []
    for i, line in enumerate(lines):
        if i in gaps:
            seg += 1
            rows.append(
                f'<span class="cl gap" data-seg="{seg}">'
                f'<span class="ln">⋯</span>'
                f'<span class="lt">{html.escape(line)}</span></span>'
            )
            seg += 1
            continue
        label = str(nums[i]) if nums[i] is not None else "·"
        rows.append(
            f'<span class="cl" data-seg="{seg}">'
            f'<span class="ln">{label}</span>'
            f'<span class="lt">{html.escape(line)}</span></span>'
        )

    steppable = ' data-steppable="1"' if seg else ""
    step_btn = '<button class="cite-btn step" type="button">逐段</button>' if seg else ""
    lines_label = html.escape(info.rsplit(":", 1)[0]) if m else ""
    head = (
        '<div class="cite-head">'
        f'<span class="cite-path" title="{html.escape(path)}">{html.escape(path)}</span>'
        f'<span class="cite-lines">{lines_label}</span>'
        '<span class="cite-tools">'
        f'{step_btn}'
        '<button class="cite-btn copy" type="button">复制</button>'
        "</span></div>"
    )
    return (f'<figure class="cite"{steppable}>{head}'
            f'<pre class="cite-body"><code>{"".join(rows)}</code></pre></figure>')


def render_mermaid(body: str) -> str:
    return f'<figure class="diagram"><div class="mermaid">{html.escape(body.rstrip())}</div></figure>'


def render_code(info: str, body: str) -> str:
    lang = (info or "text").strip()
    return (f'<figure class="code"><div class="code-head"><span>{html.escape(lang)}</span>'
            f'<button class="cite-btn copy" type="button">复制</button></div>'
            f'<pre><code>{html.escape(body.rstrip())}</code></pre></figure>')


def extract_blocks(text: str) -> tuple[str, list[Block]]:
    """把围栏块换成占位 div，避免 markdown 解析器改动块内容。"""
    blocks: list[Block] = []

    def repl(m: re.Match) -> str:
        info, body = m.group("info").strip(), m.group("body")
        if info == "mermaid":
            blocks.append(Block("mermaid", render_mermaid(body)))
        elif CITATION_INFO_RE.match(info):
            blocks.append(Block("citation", render_citation(info, body)))
        else:
            blocks.append(Block("code", render_code(info, body)))
        return f'{m.group("indent")}<div data-block="{len(blocks) - 1}"></div>'

    return FENCE_RE.sub(repl, text), blocks


def restore_blocks(html_text: str, blocks: list[Block]) -> str:
    def repl(m: re.Match) -> str:
        return blocks[int(m.group(1))].html
    return re.sub(r'<div data-block="(\d+)"></div>', repl, html_text)


def decorate_sections(body: str, toc: list) -> str:
    """给二级标题挂锚点与图标类，同时收集目录。"""
    used: set[str] = set()

    def h2(m: re.Match) -> str:
        text = re.sub(r"<[^>]+>", "", m.group(1))
        sid = slugify(text, used)
        kind = SECTION_ICONS.get(text.strip(), "plain")
        toc.append((2, sid, text))
        return (f'<h2 id="{sid}" class="sec sec-{kind}" data-sec="{html.escape(text)}">'
                f'<span class="sec-mark"></span>{m.group(1)}</h2>')

    def h3(m: re.Match) -> str:
        text = re.sub(r"<[^>]+>", "", m.group(1))
        sid = slugify(text, used)
        toc.append((3, sid, text))
        return f'<h3 id="{sid}">{m.group(1)}</h3>'

    body = re.sub(r"<h2>(.*?)</h2>", h2, body, flags=re.S)
    body = re.sub(r"<h3>(.*?)</h3>", h3, body, flags=re.S)
    return body


def strip_selfcheck(text: str) -> str:
    """交付自查是写给制作方看的过程记录，成书默认不收。"""
    m = re.search(r"^##\s*交付自查\s*$", text, re.M)
    if not m:
        return text
    cut = text[: m.start()]
    return re.sub(r"\n---\s*\n\s*$", "\n", cut)


def first_sentence(text: str) -> str:
    para = ""
    m = re.search(r"^##\s*场景还原\s*$", text, re.M)
    if m:
        rest = text[m.end():].lstrip("\n")
        para = rest.split("\n\n", 1)[0].strip()
    if not para:
        return ""
    para = re.sub(r"[`*]", "", para.replace("\n", ""))
    parts = re.split(r"(?<=[。？！])", para)
    out = ""
    for p in parts:
        if not p:
            continue
        out += p
        if len(out) >= 24:
            break
    return out[:90]


def parse_chapter(path: Path, index: int, keep_selfcheck: bool) -> Chapter:
    raw = path.read_text(encoding="utf-8")
    if not keep_selfcheck:
        raw = strip_selfcheck(raw)

    m = re.search(r"^#\s+(.+?)\s*$", raw, re.M)
    title = m.group(1).strip() if m else path.stem
    rest = raw[m.end():] if m else raw

    meta_lines: list[str] = []
    summary = ""
    lines = rest.lstrip("\n").split("\n")
    consumed = 0
    for line in lines:
        if line.startswith(">"):
            item = line.lstrip("> ").strip()
            if item.startswith("摘要："):
                summary = item[3:].strip()
            elif item:
                meta_lines.append(item)
            consumed += 1
        elif not line.strip() and consumed:
            consumed += 1
            break
        elif not line.strip():
            consumed += 1
        else:
            break
    body_md = "\n".join(lines[consumed:])

    summary = summary or first_sentence(raw)

    stripped, blocks = extract_blocks(body_md)
    converted = md_lib.markdown(stripped, extensions=MD_EXTENSIONS)
    toc: list[tuple[int, str, str]] = []
    converted = decorate_sections(converted, toc)
    body_html = restore_blocks(converted, blocks)

    prose = re.sub(r"<(pre|figure)[^>]*>.*?</\1>", "", body_html, flags=re.S)
    prose = re.sub(r"<[^>]+>", "", prose)

    return Chapter(
        src=path, index=index, title=title, meta_lines=meta_lines, summary=summary,
        body_html=body_html, toc=toc,
        citations=sum(1 for b in blocks if b.kind == "citation"),
        diagrams=sum(1 for b in blocks if b.kind == "mermaid"),
        han=len(re.findall(r"[\u4e00-\u9fff]", prose)),
    )


def footer_html() -> str:
    return (
        '<footer class="book-foot">'
        f'<span>来自 <a href="{METHODOLOGY_URL}" target="_blank" rel="noopener">'
        f"{METHODOLOGY_NAME}</a></span>"
        f'<a class="foot-repo" href="{METHODOLOGY_URL}" target="_blank" rel="noopener">'
        f"{METHODOLOGY_URL.replace('https://', '')}</a>"
        "</footer>"
    )


def shell(title: str, cfg: dict, body: str, cls: str, extra_head: str = "") -> str:
    accent = cfg.get("accent", "#3f4a5a")
    return f"""<!DOCTYPE html>
<html lang="{cfg.get('lang', 'zh-CN')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(cfg.get('subtitle', ''))}">
<meta name="author" content="{html.escape(cfg.get('author', ''))}">
<style>:root{{--accent:{accent}}}</style>
<link rel="stylesheet" href="assets/book.css">
{extra_head}
</head>
<body class="{cls}">
<div class="progress"><i></i></div>
{body}
{footer_html()}
<script src="assets/book.js"></script>
</body>
</html>
"""


def build_cover(cfg: dict, chapters: list[Chapter]) -> str:
    anchor = cfg.get("anchor", {})
    anchor_bits = [b for b in (
        f"commit {anchor['commit']}" if anchor.get("commit") else "",
        f"tag {anchor['tag']}" if anchor.get("tag") else "",
        anchor.get("date", ""),
    ) if b]

    stats = [
        ("章", len(chapters)),
        ("处源码引用", sum(c.citations for c in chapters)),
        ("万字", round(sum(c.han for c in chapters) / 10000, 1)),
    ]
    stat_html = "".join(
        f'<div class="stat"><b data-count="{v}">0</b><span>{k}</span></div>' for k, v in stats
    )

    toc_html = "".join(
        f'<li><a href="{c.out_name}"><span class="n">{c.index:02d}</span>'
        f'<span class="t">{html.escape(c.short_title)}</span>'
        f'<span class="d">{html.escape(c.summary)}</span></a></li>'
        for c in chapters
    )

    repo = cfg.get("repo", "")
    repo_html = (f'<a class="src-repo" href="{html.escape(repo)}" target="_blank" '
                 f'rel="noopener">{html.escape(repo.replace("https://", ""))}</a>') if repo else ""

    body = f"""
<main class="cover">
  <section class="cover-hero">
    <p class="kicker">{html.escape(cfg.get('kicker', '源码精读'))}</p>
    <h1>{html.escape(cfg.get('title', '未命名'))}</h1>
    <p class="sub">{html.escape(cfg.get('subtitle', ''))}</p>
    <p class="by">{html.escape(cfg.get('author', ''))}</p>
    <div class="stats">{stat_html}</div>
    <p class="anchor">{html.escape(' · '.join(anchor_bits))}</p>
    {repo_html}
    <a class="start" href="{chapters[0].out_name if chapters else '#'}">开始阅读</a>
  </section>
  <section class="cover-toc reveal">
    <h2>目录</h2>
    <ol class="toc">{toc_html}</ol>
    <a class="colophon-link" href="colophon.html">关于这本书</a>
  </section>
</main>
"""
    return shell(cfg.get("title", "未命名"), cfg, body, "is-cover")


def build_chapter(cfg: dict, ch: Chapter, prev: Chapter | None, nxt: Chapter | None,
                  total: int) -> str:
    side = "".join(
        f'<a class="lv{lv}" href="#{sid}">{html.escape(text)}</a>' for lv, sid, text in ch.toc
    )
    meta = "".join(f"<span>{html.escape(x)}</span>" for x in ch.meta_lines)

    nav = []
    nav.append(f'<a class="prev" href="{prev.out_name}">← {html.escape(prev.short_title)}</a>'
               if prev else '<a class="prev" href="index.html">← 封面</a>')
    nav.append(f'<a class="next" href="{nxt.out_name}">{html.escape(nxt.short_title)} →</a>'
               if nxt else '<a class="next" href="colophon.html">关于这本书 →</a>')

    mermaid = ('<script type="module">'
               'import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";'
               'window.__mermaid = mermaid;'
               'mermaid.initialize({startOnLoad:false,theme:"neutral",'
               'fontFamily:"inherit",flowchart:{curve:"basis"}});'
               'document.dispatchEvent(new Event("mermaid-ready"));'
               "</script>") if ch.diagrams else ""

    body = f"""
<header class="topbar">
  <a class="home" href="index.html">{html.escape(cfg.get('title', ''))}</a>
  <span class="pos">{ch.index} / {total}</span>
  <button class="theme" type="button" aria-label="切换深浅色"></button>
</header>
<div class="wrap">
  <aside class="side"><nav>{side}</nav></aside>
  <main class="chapter">
    <p class="ch-num">第 {ch.index} 章</p>
    <h1>{html.escape(ch.short_title)}</h1>
    <div class="ch-meta">{meta}</div>
    {ch.body_html}
    <nav class="ch-nav">{''.join(nav)}</nav>
  </main>
</div>
{mermaid}
"""
    return shell(f"{ch.title} · {cfg.get('title', '')}", cfg, body, "is-chapter")


def build_colophon(cfg: dict, chapters: list[Chapter]) -> str:
    anchor = cfg.get("anchor", {})
    rows = "".join(
        f"<tr><td>{c.index:02d}</td><td>{html.escape(c.short_title)}</td>"
        f"<td>{c.citations}</td><td>{c.diagrams}</td><td>{c.han}</td></tr>"
        for c in chapters
    )
    total_cit = sum(c.citations for c in chapters)
    total_han = sum(c.han for c in chapters)

    body = f"""
<header class="topbar">
  <a class="home" href="index.html">{html.escape(cfg.get('title', ''))}</a>
  <span class="pos">封底</span>
  <button class="theme" type="button" aria-label="切换深浅色"></button>
</header>
<main class="colophon">
  <h1>关于这本书</h1>
  <p class="lead">这本书里的每一处技术论断，都能回溯到源码的具体某一行。
  下面这张表是成书时的实际数据，口径写在表头里。</p>

  <table class="stat-table">
    <thead><tr><th>章</th><th>标题</th><th>带行号引用</th><th>图</th><th>正文汉字</th></tr></thead>
    <tbody>{rows}</tbody>
    <tfoot><tr><td colspan="2">合计</td><td>{total_cit}</td>
    <td>{sum(c.diagrams for c in chapters)}</td><td>{total_han}</td></tr></tfoot>
  </table>

  <h2>版本锚点</h2>
  <p>正文里的所有行号对应下面这个版本。上游仓库一直在改，隔一段时间再照着查，行号可能已经漂了。</p>
  <ul class="anchor-list">
    <li>仓库：{html.escape(cfg.get('repo', '未填写'))}</li>
    <li>commit：<code>{html.escape(anchor.get('commit', '未填写'))}</code></li>
    <li>tag：<code>{html.escape(anchor.get('tag', '未填写'))}</code></li>
    <li>核对日期：{html.escape(anchor.get('date', '未填写'))}</li>
  </ul>

  <h2>怎么读</h2>
  <ul class="how-list">
    <li>代码块左侧是源文件里的真实行号，可以直接跳回原仓库对照</li>
    <li>带 <b>逐段</b> 按钮的引用块中间有省略，点一下会按连续段落依次高亮，省略处不会被当成连续代码</li>
    <li>每章末尾的思考题里至少有一道要动手改代码验证，那一道最值钱</li>
  </ul>

  <h2>这本书是怎么做出来的</h2>
  <p>用一套公开的方法论：先锁版本锚点，再写带源码锚点的大纲，然后按八段结构逐章精读，
  最后编成这本书。全程由脚本把每一个代码块拿回源文件逐字节比对，行号错了自动校正，
  静默删行会被判定为编造并退回重写。</p>
  <a class="method-link" href="{METHODOLOGY_URL}" target="_blank" rel="noopener">
    方法论与模板已开源，可直接取用</a>
</main>
"""
    return shell(f"关于这本书 · {cfg.get('title', '')}", cfg, body, "is-colophon")


def main() -> int:
    ap = argparse.ArgumentParser(description="把章节 markdown 编成一本 HTML 书")
    ap.add_argument("--config", default="book.config.json")
    ap.add_argument("--keep-selfcheck", action="store_true", help="保留每章末尾的交付自查")
    args = ap.parse_args()

    cfg_path = Path(args.config)
    if not cfg_path.is_file():
        print(f"找不到配置文件 {cfg_path}，可复制 book/book.config.example.json 改")
        return 1
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))

    base = cfg_path.resolve().parent
    src_dir = (base / cfg.get("chapters", "chapters")).resolve()
    out_dir = (base / cfg.get("out", "dist")).resolve()
    if not src_dir.is_dir():
        print(f"章节目录不存在: {src_dir}")
        return 1

    files = sorted(p for p in src_dir.glob("*.md") if not p.name.startswith("_"))
    if not files:
        print(f"{src_dir} 里没有找到章节 markdown")
        return 1

    print(f"读入 {len(files)} 章，来自 {src_dir}")
    chapters = [parse_chapter(p, i + 1, args.keep_selfcheck) for i, p in enumerate(files)]

    assets = out_dir / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    for name in ("book.css", "book.js"):
        shutil.copy2(THEME / name, assets / name)

    (out_dir / "index.html").write_text(build_cover(cfg, chapters), encoding="utf-8")
    for i, ch in enumerate(chapters):
        prev = chapters[i - 1] if i else None
        nxt = chapters[i + 1] if i + 1 < len(chapters) else None
        (out_dir / ch.out_name).write_text(
            build_chapter(cfg, ch, prev, nxt, len(chapters)), encoding="utf-8")
        print(f"  第 {ch.index:2d} 章  {ch.title[:34]:36s} 引用 {ch.citations:3d}  "
              f"图 {ch.diagrams}  汉字 {ch.han}")
    (out_dir / "colophon.html").write_text(build_colophon(cfg, chapters), encoding="utf-8")

    print(f"\n成书 {len(chapters)} 章，共 {sum(c.citations for c in chapters)} 处引用、"
          f"{sum(c.han for c in chapters)} 汉字")
    print(f"输出目录 {out_dir}")
    print(f"打开   {out_dir / 'index.html'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

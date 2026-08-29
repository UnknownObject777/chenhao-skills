#!/usr/bin/env python3
"""给成书截图，用于人工校对排版。

用法: python3 book/shot_book.py <dist 目录> [-o 输出目录] [-c ch-04.html]
封面、正文、封底各出一张长图，正文另出一张引用块步进中的局部图。
依赖: playwright（pip install playwright && playwright install chromium）
"""
import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


def main() -> int:
    ap = argparse.ArgumentParser(description="给成书截图")
    ap.add_argument("dist", nargs="?", default="dist")
    ap.add_argument("-o", "--out", default=None, help="截图输出目录，默认 <dist>/_shots")
    ap.add_argument("-c", "--chapter", default="ch-01.html", help="要截的正文页")
    args = ap.parse_args()

    dist = Path(args.dist).resolve()
    out = Path(args.out).resolve() if args.out else dist / "_shots"
    if not (dist / "index.html").is_file():
        print(f"找不到 {dist / 'index.html'}")
        return 1
    out.mkdir(parents=True, exist_ok=True)

    chapter = args.chapter
    pages = [("index.html", "cover"), (chapter, "chapter"), ("colophon.html", "colophon")]
    errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900}, device_scale_factor=2)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console",
                lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)

        for name, tag in pages:
            target = dist / name
            if not target.is_file():
                continue
            page.goto(target.as_uri())
            page.wait_for_timeout(900)
            height = page.evaluate("document.body.scrollHeight")
            for y in range(0, height + 600, 600):
                page.evaluate(f"window.scrollTo(0, {y})")
                page.wait_for_timeout(90)
            # 渐入靠 IntersectionObserver 触发，快速滚动会来不及。
            # 只在截图时强制展开，页面本身的动画逻辑不动。
            page.evaluate(
                "document.querySelectorAll('.reveal').forEach(e => e.classList.add('in'))")
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(700)
            shot = out / f"{tag}.png"
            page.screenshot(path=str(shot), full_page=True)
            print(f"{tag:9s} {shot}")

        # 引用块步进中的样子
        page.goto((dist / chapter).as_uri())
        page.wait_for_timeout(700)
        fig = page.locator("figure.cite[data-steppable]").first
        if fig.count():
            fig.scroll_into_view_if_needed()
            page.wait_for_timeout(400)
            fig.locator(".cite-btn.step").click()
            page.wait_for_timeout(600)
            shot = out / "cite-stepping.png"
            fig.screenshot(path=str(shot))
            print(f"{'步进':9s} {shot}")

        browser.close()

    if errors:
        print("\n页面报错:")
        for e in dict.fromkeys(errors):
            print("  " + e)
    else:
        print("\n无 JS 报错")
    return 0


if __name__ == "__main__":
    sys.exit(main())

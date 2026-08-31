"""Fetch the authenticated user's Xiaohongshu (RED) favorites from the profile
"收藏" tab and print them as normalized JSON on stdout:
[{platform, id, url, title, author, summary, content, favoritedAt, extra}].
Logs go to stderr.

Xiaohongshu has no usable public API for favorites (web endpoints need signed
headers), so this script drives a real browser via Playwright with injected
login cookies and scrapes the DOM.

Auth: env XHS_COOKIE or the file %APPDATA%/social-favorites/xiaohongshu-cookie.txt
(a raw cookie string copied from browser devtools while logged in to
xiaohongshu.com; must include at least `web_session`).

Usage:
  python scripts/xiaohongshu_favorites.py [--max N] [--with-content]
      [--profile-url URL] [--headless] [--delay SECONDS]
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from pathlib import Path


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def default_cookie_file() -> Path:
    app_data = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
    return Path(app_data) / "social-favorites" / "xiaohongshu-cookie.txt"


def load_cookie() -> str:
    from_env = (os.environ.get("XHS_COOKIE") or "").strip()
    if from_env:
        return from_env
    file = default_cookie_file()
    if file.exists():
        log(f"[xhs] Loaded cookie from {file}")
        return file.read_text(encoding="utf-8").strip()
    raise SystemExit(
        "Missing Xiaohongshu cookie. Either set env XHS_COOKIE, or save your "
        f"xiaohongshu.com cookie string (at least web_session) to: {file}\n"
        "How to get it: log in to xiaohongshu.com in a browser -> F12 -> Network "
        "-> any request -> copy the full Cookie header value."
    )


def parse_cookie_string(raw: str) -> list[dict]:
    cookies = []
    for part in raw.split(";"):
        if "=" not in part:
            continue
        name, value = part.split("=", 1)
        name, value = name.strip(), value.strip()
        if name:
            cookies.append(
                {
                    "name": name,
                    "value": value,
                    "domain": ".xiaohongshu.com",
                    "path": "/",
                }
            )
    return cookies


def normalize_id(href: str) -> tuple[str, str]:
    """Extract note id and build a canonical URL from a card href."""
    # hrefs look like /user/profile/<uid>/<note_id>?xsec_token=... or /explore/<id>?...
    path_part = href.split("?")[0].strip("/")
    note_id = path_part.split("/")[-1]
    return note_id, f"https://www.xiaohongshu.com{href if href.startswith('/') else '/' + href}"


def scrape_cards(page, max_items: int) -> list[dict]:
    """Scroll the favorites tab and collect note cards."""
    items: dict[str, dict] = {}
    stagnant = 0
    last_count = 0
    while len(items) < max_items and stagnant < 6:
        cards = page.query_selector_all("section.note-item")
        for card in cards:
            try:
                link = card.query_selector("a.cover") or card.query_selector("a[href*='/explore/'], a[href*='/user/profile/']")
                if not link:
                    continue
                href = link.get_attribute("href") or ""
                if not href:
                    continue
                note_id, url = normalize_id(href)
                if not note_id or note_id in items:
                    continue
                title_el = card.query_selector(".footer .title span, .footer a.title, .title")
                author_el = card.query_selector(".author .name, .author-wrapper .name")
                like_el = card.query_selector(".like-wrapper .count, .count")
                items[note_id] = {
                    "platform": "xiaohongshu",
                    "id": note_id,
                    "url": url,
                    "title": (title_el.inner_text().strip() if title_el else ""),
                    "author": (author_el.inner_text().strip() if author_el else ""),
                    "summary": "",
                    "content": "",
                    "favoritedAt": "",  # card list does not expose favorite time
                    "extra": {
                        "likedCount": (like_el.inner_text().strip() if like_el else ""),
                    },
                }
            except Exception:
                continue
        if len(items) == last_count:
            stagnant += 1
        else:
            stagnant = 0
        last_count = len(items)
        log(f"[xhs] collected {len(items)}/{max_items} note(s)...")
        page.mouse.wheel(0, 2500)
        time.sleep(1.5 + random.random())
    return list(items.values())[:max_items]


def fetch_note_content(page, url: str, delay: float) -> tuple[str, str]:
    """Open one note page, return (title, text). Raises on anti-bot wall."""
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    time.sleep(delay + random.random())
    if page.query_selector("text=验证") and not page.query_selector("#detail-desc"):
        raise RuntimeError("hit verification wall")
    title_el = page.query_selector("#detail-title")
    desc_el = page.query_selector("#detail-desc")
    title = title_el.inner_text().strip() if title_el else ""
    text = desc_el.inner_text().strip() if desc_el else ""
    return title, text


def main() -> None:
    parser = argparse.ArgumentParser(description="Xiaohongshu favorites fetcher")
    parser.add_argument("--max", type=int, default=50, help="Max notes to collect (default: 50)")
    parser.add_argument("--with-content", action="store_true", help="Open each note to extract full text")
    parser.add_argument("--profile-url", default="", help="Your profile URL (auto-detected if omitted)")
    parser.add_argument("--headless", action="store_true", help="Run headless (less reliable; XHS may block)")
    parser.add_argument("--delay", type=float, default=2.0, help="Seconds between detail page visits")
    args = parser.parse_args()

    cookie_raw = load_cookie()
    cookies = parse_cookie_string(cookie_raw)
    if not any(c["name"] == "web_session" for c in cookies):
        log("[xhs] WARNING: cookie has no web_session; login will likely fail.")

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise SystemExit("Playwright not installed. Run: pip install playwright && playwright install chromium")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=args.headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1440, "height": 900},
            locale="zh-CN",
        )
        context.add_cookies(cookies)
        page = context.new_page()

        # 1. Home page: verify login, find own profile link.
        page.goto("https://www.xiaohongshu.com", wait_until="domcontentloaded", timeout=30000)
        time.sleep(3)
        profile_url = args.profile_url
        if not profile_url:
            me_link = page.query_selector("a[href*='/user/profile/']")
            if me_link:
                href = me_link.get_attribute("href") or ""
                profile_url = f"https://www.xiaohongshu.com{href if href.startswith('/') else '/' + href}"
        if not profile_url:
            browser.close()
            raise SystemExit(
                "Could not find your profile link — cookies are probably expired or "
                "login is required. Refresh xiaohongshu-cookie.txt (or pass --profile-url)."
            )

        # 2. Profile page -> 收藏 tab.
        log(f"[xhs] opening profile: {profile_url}")
        page.goto(profile_url, wait_until="domcontentloaded", timeout=30000)
        time.sleep(3)
        collect_tab = None
        for tab in page.query_selector_all(".reds-tab-item, div[class*='tab']"):
            try:
                if "收藏" in (tab.inner_text() or ""):
                    collect_tab = tab
                    break
            except Exception:
                continue
        if not collect_tab:
            browser.close()
            raise SystemExit(
                "收藏 tab not found on the profile page. The tab is only visible on your "
                "own profile while logged in — check cookies / --profile-url."
            )
        collect_tab.click()
        time.sleep(2)

        # 3. Scroll and collect cards.
        items = scrape_cards(page, args.max)
        log(f"[xhs] collected {len(items)} note card(s)")

        # 4. Optional per-note full text.
        if args.with_content and items:
            detail = context.new_page()
            ok = 0
            for item in items:
                try:
                    title, text = fetch_note_content(detail, item["url"], args.delay)
                    if title and not item["title"]:
                        item["title"] = title
                    if text:
                        item["content"] = text
                        ok += 1
                except Exception as exc:
                    log(f"[xhs] content fetch failed for {item['url']}: {exc}")
            log(f"[xhs] full text extracted for {ok}/{len(items)} note(s)")

        browser.close()

    print(json.dumps(items, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

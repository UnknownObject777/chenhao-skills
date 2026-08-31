import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

/**
 * Fetch the authenticated user's Zhihu favorites via zhihu-cli and print them as
 * normalized JSON on stdout: [{platform, id, url, title, author, summary, content,
 * favoritedAt, extra}]. Logs go to stderr.
 *
 * zhihu-cli only returns summaries; --with-content additionally fetches the
 * public page HTML and tries to extract the full text. Zhihu blocks anonymous
 * scraping (HTTP 403), so full text needs a logged-in zhihu.com cookie:
 * env ZHIHU_COOKIE or %APPDATA%/social-favorites/zhihu-cookie.txt.
 * Without it (or on any failure) the entry falls back to its summary.
 */

const execFileAsync = promisify(execFile);

const DEFAULT_ZHIHU_CLI = path.join(
  os.homedir(),
  "AppData",
  "Local",
  "ZhihuCLI",
  "current",
  "zhihu-cli.exe"
);

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

type FavEntry = {
  platform: "zhihu";
  id: string;
  url: string;
  title: string;
  author: string;
  summary: string;
  content: string;
  favoritedAt: string;
  extra: Record<string, unknown>;
};

function resolveZhihuCli(): string {
  const override = process.env.ZHIHU_CLI?.trim();
  const candidates = [override, DEFAULT_ZHIHU_CLI].filter((v): v is string => Boolean(v));
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Fall back to PATH lookup (works when installed as `zhihu-cli` / `zhihu-cli.exe`).
  return "zhihu-cli";
}

async function runCli(cli: string, args: string[]): Promise<any> {
  const { stdout } = await execFileAsync(cli, args, {
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`zhihu-cli ${args.join(" ")} did not return JSON: ${stdout.slice(0, 300)}`);
  }
}

function cliItems(payload: any): any[] {
  return payload?.Data?.Items ?? payload?.data?.items ?? [];
}

function normalize(item: any): FavEntry | null {
  const url: string = item?.Url ?? "";
  if (!url) return null;
  const idMatch =
    url.match(/answer\/(\d+)/) ??
    url.match(/\/p\/(\d+)/) ??
    url.match(/question\/(\d+)/) ??
    url.match(/zvideo\/(\d+)/) ??
    url.match(/(\d{6,})/);
  const id = idMatch ? idMatch[1]! : url;
  const favTime: number | undefined = item?.FavTime;
  return {
    platform: "zhihu",
    id: String(id),
    url,
    title: String(item?.Title ?? "").trim(),
    author: String(item?.Author?.Name ?? "").trim(),
    summary: String(item?.Summary ?? "").trim(),
    content: "",
    favoritedAt: favTime ? new Date(favTime * 1000).toISOString() : "",
    extra: {
      contentType: item?.ContentType ?? "",
      likeCount: item?.LikeCount ?? 0,
      commentCount: item?.CommentCount ?? 0,
      favoriteCount: item?.FavoriteCount ?? 0,
      favlists: (item?.Favlists ?? []).map((f: any) => ({ title: f?.Title, url: f?.Url })),
      authorUrl: item?.Author?.Url ?? "",
      authorHeadline: item?.Author?.Headline ?? "",
    },
  };
}

// ---------- best-effort full-text extraction from public page HTML ----------

function loadZhihuCookie(log: (m: string) => void): string {
  const fromEnv = process.env.ZHIHU_COOKIE?.trim();
  if (fromEnv) return fromEnv;
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const file = path.join(appData, "social-favorites", "zhihu-cookie.txt");
  if (fs.existsSync(file)) {
    log(`[zhihu] Loaded web cookie from ${file}`);
    return fs.readFileSync(file, "utf8").trim();
  }
  log(
    `[zhihu] No web cookie found; zhihu.com blocks anonymous scraping (403), ` +
      `so full text will be skipped. To enable it, save your zhihu.com cookie to: ${file}`
  );
  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/(h[1-6]|li|blockquote|figure)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractContentFromHtml(html: string, url: string): string {
  const m = html.match(
    /<script id="js-initialData" type="text\/json">([\s\S]*?)<\/script>/
  );
  if (!m) return "";
  let data: any;
  try {
    data = JSON.parse(m[1]!);
  } catch {
    return "";
  }
  const entities = data?.initialState?.entities ?? data?.entities ?? {};
  const answerId = url.match(/answer\/(\d+)/)?.[1];
  const articleId = url.match(/\/p\/(\d+)/)?.[1];
  let htmlContent = "";
  if (answerId && entities?.answers?.[answerId]?.content) {
    htmlContent = entities.answers[answerId].content;
  } else if (articleId && entities?.articles?.[articleId]?.content) {
    htmlContent = entities.articles[articleId].content;
  }
  return htmlContent ? stripHtml(htmlContent) : "";
}

async function fetchFullText(url: string, cookie: string): Promise<string> {
  if (!cookie) return "";
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      cookie,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "zh-CN,zh;q=0.9",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return extractContentFromHtml(await response.text(), url);
}

async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// ---------- fetch modes ----------

async function fetchRecent(cli: string, limit: number): Promise<FavEntry[]> {
  const payload = await runCli(cli, ["me", "favorites", "recent", "--limit", String(Math.min(50, limit))]);
  const out: FavEntry[] = [];
  for (const item of cliItems(payload)) {
    const entry = normalize(item);
    if (entry) out.push(entry);
  }
  return out;
}

async function fetchAll(cli: string, maxItems: number, log: (m: string) => void): Promise<FavEntry[]> {
  const listsPayload = await runCli(cli, ["me", "favorites", "lists", "--limit", "50"]);
  const lists = cliItems(listsPayload);
  log(`[zhihu] Found ${lists.length} favorite list(s)`);

  const seen = new Set<string>();
  const out: FavEntry[] = [];
  for (const list of lists) {
    const token = list?.UrlToken ?? list?.url_token;
    if (!token) continue;
    let offset = 0;
    for (;;) {
      const page = await runCli(cli, [
        "me", "favorites", "items",
        "--url-token", String(token),
        "--limit", "50",
        "--offset", String(offset),
      ]);
      const items = cliItems(page);
      for (const item of items) {
        const entry = normalize(item);
        if (!entry || seen.has(entry.id)) continue;
        seen.add(entry.id);
        out.push(entry);
        if (out.length >= maxItems) break;
      }
      const paging = page?.Data?.Paging ?? page?.data?.paging ?? null;
      const nextOffset = paging?.NextOffset ?? paging?.next_offset ?? null;
      log(`[zhihu] list ${token}: +${items.length} item(s), total ${out.length}`);
      if (items.length === 0 || nextOffset === null || nextOffset === undefined || out.length >= maxItems) break;
      offset = Number(nextOffset);
    }
    if (out.length >= maxItems) break;
  }
  return out;
}

// ---------- CLI ----------

function printUsage(exitCode: number): never {
  console.log(`Zhihu favorites fetcher (via zhihu-cli)

Usage:
  npx -y bun scripts/zhihu_favorites.ts [--limit <n>] [--all] [--with-content]

Options:
  --limit <n>      Recent mode: max favorites to fetch (default: 20, max: 50)
  --all            Enumerate favorite lists and paginate through all items
  --max <n>        All mode: overall item cap (default: 500)
  --with-content   Full text from the public page (needs ZHIHU_COOKIE or
                   %APPDATA%/social-favorites/zhihu-cookie.txt; falls back to summary)
  --help, -h       Show help

Output: normalized JSON array on stdout. Logs go to stderr.
Requires zhihu-cli (env ZHIHU_CLI to override its path).`);
  process.exit(exitCode);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let limit = 20;
  let max = 500;
  let all = false;
  let withContent = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") printUsage(0);
    else if (a === "--all") all = true;
    else if (a === "--with-content") withContent = true;
    else if (a === "--limit") limit = Number(argv[++i]);
    else if (a === "--max") max = Number(argv[++i]);
    else throw new Error(`Unknown option: ${a}`);
  }
  if (!Number.isFinite(limit) || limit < 1) throw new Error("Invalid --limit");
  if (!Number.isFinite(max) || max < 1) throw new Error("Invalid --max");

  const log = (m: string) => console.error(m);
  const cli = resolveZhihuCli();
  log(`[zhihu] Using zhihu-cli: ${cli}`);

  const entries = all ? await fetchAll(cli, max, log) : await fetchRecent(cli, limit);
  log(`[zhihu] Fetched ${entries.length} favorite(s)`);

  if (withContent) {
    const cookie = loadZhihuCookie(log);
    let ok = 0;
    await withConcurrency(entries, 3, async (entry) => {
      try {
        const text = await fetchFullText(entry.url, cookie);
        if (text) {
          entry.content = text;
          ok++;
        }
      } catch (error) {
        log(`[zhihu] content fetch failed for ${entry.url}: ${error instanceof Error ? error.message : error}`);
      }
    });
    log(`[zhihu] Full text extracted for ${ok}/${entries.length} item(s); rest keep summary only`);
  }

  console.log(JSON.stringify(entries, null, 2));
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error ?? ""));
  process.exit(1);
});

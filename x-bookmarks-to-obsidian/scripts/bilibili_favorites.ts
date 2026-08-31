import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

/**
 * Fetch the authenticated user's Bilibili favorite folders and their items via the
 * web API, and print them as normalized JSON on stdout:
 * [{platform, id, url, title, author, summary, content, favoritedAt, extra}].
 * Logs go to stderr.
 *
 * Auth: SESSDATA cookie, from env BILIBILI_COOKIE or the file
 * %APPDATA%/social-favorites/bilibili-cookie.txt (a raw cookie string copied from
 * browser devtools while logged in to bilibili.com).
 */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
  28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
  54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

type FavEntry = {
  platform: "bilibili";
  id: string;
  url: string;
  title: string;
  author: string;
  summary: string;
  content: string;
  favoritedAt: string;
  extra: Record<string, unknown>;
};

function defaultCookieFile(): string {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "social-favorites", "bilibili-cookie.txt");
}

function loadCookie(log: (m: string) => void): string {
  const fromEnv = process.env.BILIBILI_COOKIE?.trim();
  if (fromEnv) return fromEnv;
  const file = defaultCookieFile();
  if (fs.existsSync(file)) {
    log(`[bilibili] Loaded cookie from ${file}`);
    return fs.readFileSync(file, "utf8").trim();
  }
  throw new Error(
    "Missing Bilibili cookie. Either set env BILIBILI_COOKIE, or save your bilibili.com " +
      `cookie string (at least SESSDATA) to: ${file}\n` +
      "How to get it: log in to bilibili.com in a browser → F12 → Network → any request → " +
      "copy the full Cookie header value."
  );
}

// ---------- WBI signing (required by several api.bilibili.com endpoints) ----------

type WbiKeys = { imgKey: string; subKey: string };

function mixinKey(keys: WbiKeys): string {
  const raw = keys.imgKey + keys.subKey;
  return MIXIN_KEY_ENC_TAB.map((i) => raw[i]!).join("").slice(0, 32);
}

function signedParams(params: Record<string, string | number>, keys: WbiKeys): string {
  const withWts: Record<string, string | number> = { ...params, wts: Math.floor(Date.now() / 1000) };
  const query = Object.keys(withWts)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(withWts[k]).replace(/[!'()*]/g, ""))}`)
    .join("&");
  const wRid = createHash("md5").update(query + mixinKey(keys)).digest("hex");
  return `${query}&w_rid=${wRid}`;
}

// ---------- HTTP ----------

async function apiGet(url: string, cookie: string): Promise<any> {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      cookie,
      referer: "https://www.bilibili.com",
      accept: "application/json, text/plain, */*",
    },
  });
  if (!response.ok) throw new Error(`Bilibili API HTTP ${response.status} for ${url}`);
  const payload = await response.json();
  return payload;
}

function keyFromWbiUrl(url: string): string {
  const file = url.split("/").pop() ?? "";
  return file.replace(/\.\w+$/, "");
}

async function getNav(cookie: string): Promise<{ mid: number; wbi: WbiKeys }> {
  const payload = await apiGet("https://api.bilibili.com/x/web-interface/nav", cookie);
  if (payload?.code !== 0 || !payload?.data?.isLogin) {
    throw new Error(
      `Bilibili nav API says not logged in (code=${payload?.code}). ` +
        "Your SESSDATA is missing/expired — refresh the cookie file."
    );
  }
  const imgUrl: string = payload.data?.wbi_img?.img_url ?? "";
  const subUrl: string = payload.data?.wbi_img?.sub_url ?? "";
  return {
    mid: payload.data.mid,
    wbi: { imgKey: keyFromWbiUrl(imgUrl), subKey: keyFromWbiUrl(subUrl) },
  };
}

type Folder = { id: number; title: string; mediaCount: number };

async function listFolders(mid: number, wbi: WbiKeys, cookie: string): Promise<Folder[]> {
  const query = signedParams({ up_mid: mid, type: 2 }, wbi);
  const payload = await apiGet(
    `https://api.bilibili.com/x/v3/fav/folder/created/list-all?${query}`,
    cookie
  );
  if (payload?.code !== 0) {
    throw new Error(`list-all failed (code=${payload?.code}): ${payload?.message ?? ""}`);
  }
  const list: any[] = payload?.data?.list ?? [];
  return list.map((f) => ({ id: f.id, title: String(f.title ?? ""), mediaCount: f.media_count ?? 0 }));
}

async function listFolderItems(
  folder: Folder,
  wbi: WbiKeys,
  cookie: string,
  maxPerFolder: number,
  log: (m: string) => void
): Promise<FavEntry[]> {
  const out: FavEntry[] = [];
  let pn = 1;
  const ps = 20;
  while (out.length < maxPerFolder) {
    const query = signedParams(
      { media_id: folder.id, pn, ps, platform: "web", type: 0 },
      wbi
    );
    const payload = await apiGet(
      `https://api.bilibili.com/x/v3/fav/resource/list?${query}`,
      cookie
    );
    if (payload?.code !== 0) {
      log(`[bilibili] folder ${folder.title} page ${pn} failed (code=${payload?.code}): ${payload?.message ?? ""}`);
      break;
    }
    const medias: any[] = payload?.data?.medias ?? [];
    for (const m of medias) {
      const bvid: string = m?.bvid ?? "";
      if (!bvid) continue;
      const invalid = (m?.attr ?? 0) !== 0 || m?.type !== 2;
      out.push({
        platform: "bilibili",
        id: bvid,
        url: `https://www.bilibili.com/video/${bvid}`,
        title: String(m?.title ?? "").trim(),
        author: String(m?.upper?.name ?? "").trim(),
        summary: String(m?.intro ?? "").trim(),
        content: "",
        favoritedAt: m?.fav_time ? new Date(m.fav_time * 1000).toISOString() : "",
        extra: {
          folder: folder.title,
          avid: m?.id ?? 0,
          durationSec: m?.duration ?? 0,
          cover: m?.cover ?? "",
          pubdate: m?.pubdate ? new Date(m.pubdate * 1000).toISOString() : "",
          playCount: m?.cnt_info?.play ?? 0,
          invalid, // true = 已失效/非视频稿件（如专栏、番剧或已删除）
        },
      });
      if (out.length >= maxPerFolder) break;
    }
    log(`[bilibili] folder "${folder.title}" page ${pn}: +${medias.length} (total ${out.length})`);
    if (medias.length < ps || !payload?.data?.has_more) break;
    pn++;
  }
  return out;
}

// ---------- CLI ----------

function printUsage(exitCode: number): never {
  console.log(`Bilibili favorites fetcher

Usage:
  npx -y bun scripts/bilibili_favorites.ts [--folder <id-or-title>] [--max <n>]

Options:
  --folder <id|title>  Only this favorite folder (default: all folders)
  --max <n>            Max items per folder (default: 200)
  --help, -h           Show help

Auth: env BILIBILI_COOKIE or %APPDATA%/social-favorites/bilibili-cookie.txt
Output: normalized JSON array on stdout. Logs go to stderr.`);
  process.exit(exitCode);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let folderFilter: string | null = null;
  let max = 200;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") printUsage(0);
    else if (a === "--folder") {
      folderFilter = argv[++i] ?? null;
      if (!folderFilter) throw new Error("Missing value for --folder");
    } else if (a === "--max") max = Number(argv[++i]);
    else throw new Error(`Unknown option: ${a}`);
  }
  if (!Number.isFinite(max) || max < 1) throw new Error("Invalid --max");

  const log = (m: string) => console.error(m);
  const cookie = loadCookie(log);

  log("[bilibili] Checking login (nav)...");
  const { mid, wbi } = await getNav(cookie);
  log(`[bilibili] Logged in, mid=${mid}`);

  let folders = await listFolders(mid, wbi, cookie);
  log(`[bilibili] ${folders.length} folder(s): ${folders.map((f) => f.title).join(", ")}`);
  if (folderFilter) {
    folders = folders.filter(
      (f) => String(f.id) === folderFilter || f.title.includes(folderFilter!)
    );
    if (folders.length === 0) throw new Error(`No folder matches --folder "${folderFilter}"`);
  }

  const seen = new Set<string>();
  const all: FavEntry[] = [];
  for (const folder of folders) {
    const items = await listFolderItems(folder, wbi, cookie, max, log);
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      all.push(item);
    }
  }
  log(`[bilibili] Total unique favorites: ${all.length}`);
  console.log(JSON.stringify(all, null, 2));
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error ?? ""));
  process.exit(1);
});

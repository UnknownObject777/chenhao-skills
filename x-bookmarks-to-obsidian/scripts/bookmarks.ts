import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

/**
 * Fetch the authenticated user's X (Twitter) bookmarks via the reverse-engineered
 * GraphQL `Bookmarks` operation and print them as JSON on stdout.
 *
 * Auth, header construction, feature-switch resolution and query-id discovery are
 * reused at runtime from the sibling skill `baoyu-danger-x-to-markdown` — install
 * it first (or point X_TO_MARKDOWN_SKILL_DIR at its directory).
 */

// Last-resort query id, only used when discovery from the client bundle fails.
// X rotates these ids; update this constant if the fallback ever starts failing.
const FALLBACK_BOOKMARKS_QUERY_ID = "iblrFnKr6PZUR-dWpfXG6g";

type LogFn = (message: string) => void;

type BookmarkEntry = {
  id: string;
  url: string;
  author: string;
  text: string;
  createdAt: string;
};

function resolveBaoyuScriptsDir(): string {
  const candidates: string[] = [];
  const override = process.env.X_TO_MARKDOWN_SKILL_DIR?.trim();
  if (override) {
    const resolved = path.resolve(override);
    candidates.push(path.join(resolved, "scripts"));
    candidates.push(resolved);
  }
  candidates.push(path.join(os.homedir(), ".agents", "skills", "baoyu-danger-x-to-markdown", "scripts"));

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "http.ts")) && fs.existsSync(path.join(dir, "cookies.ts"))) {
      return dir;
    }
  }

  throw new Error(
    "baoyu-danger-x-to-markdown scripts not found. Install that skill first, " +
      "or set X_TO_MARKDOWN_SKILL_DIR to its directory. Searched: " +
      candidates.join(", ")
  );
}

async function importBaoyuModule(scriptsDir: string, name: string): Promise<any> {
  return import(pathToFileURL(path.join(scriptsDir, name)).href);
}

async function fetchBookmarksPageHtml(
  cookieMap: Record<string, string>,
  userAgent: string
): Promise<string> {
  // The logged-out homepage serves a new frontend without the client-web bundle
  // manifest; the authenticated bookmarks page still ships the classic app with
  // the webpack chunk tables we need. Browser-like headers are required —
  // buildRequestHeaders (accept: application/json) gets a 401 here.
  const cookieHeader = Object.entries(cookieMap)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
  const response = await fetch("https://x.com/i/bookmarks", {
    headers: {
      "user-agent": userAgent,
      cookie: cookieHeader,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to load bookmarks page (${response.status})`);
  }
  return response.text();
}

async function resolveBookmarksQueryInfo(
  http: any,
  constants: any,
  cookieMap: Record<string, string>,
  userAgent: string,
  log: LogFn
) {
  // The authenticated page embeds two webpack tables: chunk-id -> chunk-name
  // (e.g. 69742:"bundle.Bookmarks") and chunk-id -> content hash. The GraphQL
  // query id lives in one of the bookmark chunks — probe them all.
  const html = await fetchBookmarksPageHtml(cookieMap, userAgent);
  // Name values must contain a non-hex character so the hash table (id:"f95ecf5")
  // cannot overwrite real chunk names when both tables use the same ids.
  const names = new Map<string, string>(
    [...html.matchAll(/(\d+):\"([A-Za-z0-9\/~.-]*[.~\/g-zA-Z][A-Za-z0-9\/~.-]*)\"/g)].map((m) => [m[1]!, m[2]!])
  );
  const hashes = new Map<string, string>(
    [...html.matchAll(/(\d+):\"([a-f0-9]{7,8})\"/g)].map((m) => [m[1]!, m[2]!])
  );

  const candidates = [...names.entries()].filter(
    ([id, name]) => name.includes("bundle.Bookmarks") && hashes.has(id)
  );
  for (const [id, name] of candidates) {
    const chunkUrl = `https://abs.twimg.com/responsive-web/client-web/${name}.${hashes.get(id)}a.js`;
    try {
      const chunk = await http.fetchText(chunkUrl, { headers: { "user-agent": userAgent } });
      const queryIdMatch = chunk.match(/queryId:\"([^\"]+)\",operationName:\"Bookmarks\"/);
      if (!queryIdMatch) continue;
      const featureMatch = chunk.match(/operationName:\"Bookmarks\"[\s\S]*?featureSwitches:\[(.*?)\]/);
      const featureSwitches = http.parseStringList(featureMatch?.[1]);
      log(`[x-bookmarks] Query id discovered in chunk: ${name}`);
      return {
        queryId: queryIdMatch[1] as string,
        featureSwitches:
          featureSwitches.length > 0 ? featureSwitches : (constants.FALLBACK_TWEET_FEATURE_SWITCHES as string[]),
        html,
      };
    } catch {
      continue;
    }
  }

  log("[x-bookmarks] Query id discovery failed, using fallback constant.");
  return {
    queryId: FALLBACK_BOOKMARKS_QUERY_ID,
    featureSwitches: constants.FALLBACK_TWEET_FEATURE_SWITCHES as string[],
    html,
  };
}

function unwrapTweetResult(result: any): any {
  if (!result) return null;
  if (result.__typename === "TweetWithVisibilityResults" && result.tweet) return result.tweet;
  return result;
}

function parseBookmarkEntries(payload: any): { bookmarks: BookmarkEntry[]; cursor: string | null } {
  const instructions: any[] = payload?.data?.bookmark_timeline_v2?.timeline?.instructions ?? [];
  const bookmarks: BookmarkEntry[] = [];
  let cursor: string | null = null;

  for (const instruction of instructions) {
    const entries: any[] = instruction?.entries ?? (instruction?.entry ? [instruction.entry] : []);
    for (const entry of entries) {
      const entryId: string = entry?.entryId ?? "";

      if (entryId.startsWith("cursor-bottom")) {
        const value = entry?.content?.value ?? entry?.content?.itemContent?.value;
        if (typeof value === "string" && value) cursor = value;
        continue;
      }

      if (!entryId.startsWith("tweet-")) continue;

      const tweet = unwrapTweetResult(
        entry?.content?.itemContent?.tweet_results?.result ?? entry?.content?.itemContent?.tweetResults?.result
      );
      const id: string | undefined = tweet?.rest_id ?? entryId.replace(/^tweet-/, "");
      if (!id) continue;

      const legacy = tweet?.legacy ?? {};
      const userResult = tweet?.core?.user_results?.result ?? tweet?.core?.user_result?.result ?? {};
      // Newer responses use `core.screen_name`; older ones nest it under `legacy`.
      const screenName: string = userResult?.core?.screen_name ?? userResult?.legacy?.screen_name ?? "i";

      bookmarks.push({
        id,
        url: `https://x.com/${screenName}/status/${id}`,
        author: screenName,
        text: typeof legacy?.full_text === "string" ? legacy.full_text : "",
        createdAt: typeof legacy?.created_at === "string" ? legacy.created_at : "",
      });
    }
  }

  return { bookmarks, cursor };
}

async function fetchBookmarksPage(
  http: any,
  queryInfo: { queryId: string; featureSwitches: string[]; html: string },
  cookieMap: Record<string, string>,
  userAgent: string,
  bearerToken: string,
  count: number,
  cursor: string | null
): Promise<{ bookmarks: BookmarkEntry[]; cursor: string | null }> {
  const features = http.buildFeatureMap(queryInfo.html, queryInfo.featureSwitches);

  const url = new URL(`https://x.com/i/api/graphql/${queryInfo.queryId}/Bookmarks`);
  const variables: Record<string, unknown> = { count, includePromotedContent: false };
  if (cursor) variables.cursor = cursor;
  url.searchParams.set("variables", JSON.stringify(variables));
  if (Object.keys(features).length > 0) {
    url.searchParams.set("features", JSON.stringify(features));
  }

  const response = await fetch(url.toString(), {
    headers: http.buildRequestHeaders(cookieMap, userAgent, bearerToken),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`X API error (${response.status}): ${text.slice(0, 400)}`);
  }

  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse response JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  return parseBookmarkEntries(payload);
}

type CliArgs = { count: number; cursor: string | null; help: boolean };

function printUsage(exitCode: number): never {
  console.log(`X Bookmarks fetcher

Usage:
  npx -y bun scripts/bookmarks.ts [--count <n>] [--cursor <cursor>]

Options:
  --count <n>    Max bookmarks to fetch (default: 50)
  --cursor <c>   Resume pagination from a cursor
  --help, -h     Show help

Output: JSON array on stdout: [{id, url, author, text, createdAt}]
Logs go to stderr. Requires baoyu-danger-x-to-markdown (auth reuse).
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { count: 50, cursor: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a === "--count") {
      const v = argv[++i];
      if (!v || !/^\d+$/.test(v)) throw new Error("Missing or invalid value for --count");
      out.count = Number(v);
    } else if (a === "--cursor") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value for --cursor");
      out.cursor = v;
    } else {
      throw new Error(`Unknown option: ${a}`);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) printUsage(0);

  const log: LogFn = (message) => console.error(message);

  const scriptsDir = resolveBaoyuScriptsDir();
  log(`[x-bookmarks] Reusing baoyu-danger-x-to-markdown scripts at: ${scriptsDir}`);
  const http = await importBaoyuModule(scriptsDir, "http.ts");
  const cookies = await importBaoyuModule(scriptsDir, "cookies.ts");
  const constants = await importBaoyuModule(scriptsDir, "constants.ts");

  const userAgent = process.env.X_USER_AGENT?.trim() || constants.DEFAULT_USER_AGENT;
  const bearerToken = process.env.X_BEARER_TOKEN?.trim() || constants.DEFAULT_BEARER_TOKEN;

  log("[x-bookmarks] Loading cookies...");
  const cookieMap: Record<string, string> = await cookies.loadXCookies(log);
  if (!cookies.hasRequiredXCookies(cookieMap)) {
    throw new Error("Missing auth cookies. Provide X_AUTH_TOKEN and X_CT0 or log in via Chrome.");
  }

  log("[x-bookmarks] Resolving Bookmarks query id...");
  const queryInfo = await resolveBookmarksQueryInfo(http, constants, cookieMap, userAgent, log);
  log(`[x-bookmarks] Using query id: ${queryInfo.queryId}`);

  const seen = new Set<string>();
  const all: BookmarkEntry[] = [];
  let cursor: string | null = args.cursor;
  const pageSize = Math.min(100, Math.max(20, args.count));

  while (all.length < args.count) {
    const page = await fetchBookmarksPage(
      http,
      queryInfo,
      cookieMap,
      userAgent,
      bearerToken,
      pageSize,
      cursor
    );

    let added = 0;
    for (const bookmark of page.bookmarks) {
      if (seen.has(bookmark.id)) continue;
      seen.add(bookmark.id);
      all.push(bookmark);
      added++;
      if (all.length >= args.count) break;
    }
    log(`[x-bookmarks] Fetched ${all.length}/${args.count} bookmark(s)...`);

    if (!page.cursor || page.cursor === cursor || (added === 0 && page.bookmarks.length === 0)) break;
    cursor = page.cursor;
  }

  console.log(JSON.stringify(all, null, 2));
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error ?? ""));
  process.exit(1);
});

#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { access, lstat, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { inflateSync } from "node:zlib";

const MAX_DOCX_BYTES = 25 * 1024 * 1024;
const MAX_DOCX_EXPANDED_BYTES = 40 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 32;
const BODY_TIMEOUT_MS = 15000;
const CONVERSION_TIMEOUT_MS = 60000;
const PAGES_LAUNCH_TIMEOUT_MS = 10000;
const PAGES_CLOSE_TIMEOUT_MS = 5000;
const PAGES_BUNDLE_ID = "com.apple.iWork.Pages";
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"]
]);
const WAIT_FOR_PAGES_DOCUMENT_SCRIPT = `on run argv
  set documentName to item 1 of argv
  tell application "Pages"
    repeat with attempt from 1 to 200
      if exists document documentName then return "ok"
      delay 0.1
    end repeat
    error "Pages did not open the DOCX document"
  end tell
end run`;
const SAVE_PAGES_SCRIPT = `on run argv
  set documentName to item 1 of argv
  set outputPath to item 2 of argv
  tell application "Pages"
    save document documentName in (POSIX file outputPath)
  end tell
  return "ok"
end run`;
const CLOSE_PAGES_SCRIPT = `on run argv
  set documentName to item 1 of argv
  tell application "Pages"
    if exists document documentName then close document documentName saving no
  end tell
  return "ok"
end run`;

function parseArguments(argv) {
  const options = { root: process.cwd(), host: "127.0.0.1", port: 8772, pagesOutput: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--root") options.root = argv[++index];
    else if (value === "--host") options.host = argv[++index];
    else if (value === "--port") options.port = Number(argv[++index]);
    else if (value === "--pages-output") options.pagesOutput = argv[++index];
    else throw new Error(`unknown argument: ${value}`);
  }
  if (!options.root || !options.host || !Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error("usage: node scripts/serve.mjs --root DIRECTORY [--port 8772] [--host 127.0.0.1]");
  }
  if (options.host !== "127.0.0.1") throw new Error("the Pages helper must bind to 127.0.0.1");
  return options;
}

function send(response, statusCode, body, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  const bytes = typeof body === "string" ? Buffer.from(body) : body;
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": String(bytes.length),
    "Cache-Control": "no-store",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...extraHeaders
  });
  response.end(bytes);
}

function sameOriginRequest(request, port) {
  const expectedHost = port === 80 ? "127.0.0.1" : `127.0.0.1:${port}`;
  if (request.headers.host !== expectedHost) return false;
  const site = request.headers["sec-fetch-site"];
  if (site && !["same-origin", "none"].includes(site)) return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && parsed.hostname === "127.0.0.1" && Number(parsed.port || 80) === port;
  } catch {
    return false;
  }
}

async function collectBody(request) {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (!Number.isFinite(declared) || declared < 0) throw Object.assign(new Error("invalid content length"), { statusCode: 400 });
  if (declared > MAX_DOCX_BYTES) throw Object.assign(new Error("request is too large"), { statusCode: 413 });
  const chunks = [];
  let size = 0;
  request.setTimeout(BODY_TIMEOUT_MS, () => {
    request.destroy(Object.assign(new Error("request body timed out"), { statusCode: 408 }));
  });
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_DOCX_BYTES) throw Object.assign(new Error("request is too large"), { statusCode: 413 });
      chunks.push(chunk);
    }
  } finally {
    request.setTimeout(0);
  }
  return Buffer.concat(chunks);
}

function docxError(message) {
  return Object.assign(new Error(message), { statusCode: 422 });
}

const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function validateScenePng(image) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (image.length < 45 || !image.subarray(0, 8).equals(signature)) throw docxError("the DOCX contains an invalid scene image");
  const idatChunks = [];
  let offset = 8;
  let phase = "header";
  let chunkIndex = 0;
  while (offset < image.length) {
    if (offset + 12 > image.length) throw docxError("the PNG chunk table is truncated");
    const length = image.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    const next = crcOffset + 4;
    if (dataEnd < dataStart || next > image.length) throw docxError("the PNG chunk length is invalid");
    const type = image.toString("ascii", typeStart, typeStart + 4);
    const expectedCrc = image.readUInt32BE(crcOffset);
    if (crc32(image.subarray(typeStart, dataEnd)) !== expectedCrc) throw docxError("the PNG chunk checksum is invalid");
    if (chunkIndex === 0) {
      if (type !== "IHDR" || length !== 13 || image.readUInt32BE(dataStart) !== 1600 || image.readUInt32BE(dataStart + 4) !== 900
        || image[dataStart + 8] !== 8 || image[dataStart + 9] !== 6 || image[dataStart + 10] !== 0
        || image[dataStart + 11] !== 0 || image[dataStart + 12] !== 0) {
        throw docxError("the PNG header does not match a fireworks-open-eli5 scene");
      }
      phase = "data";
    } else if (type === "IDAT" && phase === "data" && length > 0) {
      idatChunks.push(image.subarray(dataStart, dataEnd));
    } else if (type === "IEND" && phase === "data" && length === 0 && idatChunks.length) {
      if (next !== image.length) throw docxError("the PNG contains trailing data");
      phase = "done";
    } else {
      throw docxError("the PNG contains a chunk not produced by fireworks-open-eli5");
    }
    offset = next;
    chunkIndex += 1;
    if (phase === "done") break;
  }
  if (phase !== "done") throw docxError("the PNG is missing image data or its end marker");
  const rowBytes = 1 + 1600 * 4;
  const expectedBytes = rowBytes * 900;
  let decoded;
  try {
    decoded = inflateSync(Buffer.concat(idatChunks), { maxOutputLength: expectedBytes + 1 });
  } catch {
    throw docxError("the PNG image data is not a bounded zlib stream");
  }
  if (decoded.length !== expectedBytes) throw docxError("the PNG decoded size is invalid");
  for (let row = 0; row < 900; row += 1) {
    if (decoded[row * rowBytes] > 4) throw docxError("the PNG contains an invalid scanline filter");
  }
}

function findZipEnd(bytes) {
  const minimum = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function validateRuntimeDocx(bytes) {
  if (bytes.length < 22 || !bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) throw docxError("the request body is not a DOCX ZIP package");
  const endOffset = findZipEnd(bytes);
  if (endOffset < 0 || endOffset + 22 + bytes.readUInt16LE(endOffset + 20) !== bytes.length) throw docxError("the DOCX central directory is invalid");
  if (bytes.readUInt16LE(endOffset + 4) !== 0 || bytes.readUInt16LE(endOffset + 6) !== 0) throw docxError("multi-disk DOCX packages are not accepted");
  const diskEntries = bytes.readUInt16LE(endOffset + 8);
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  if (!entryCount || entryCount !== diskEntries || entryCount > MAX_DOCX_ENTRIES || centralOffset + centralSize !== endOffset) throw docxError("the DOCX entry table is invalid");
  const entries = new Map();
  let cursor = centralOffset;
  let expandedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endOffset || bytes.readUInt32LE(cursor) !== 0x02014b50) throw docxError("the DOCX central directory is malformed");
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const expandedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const diskStart = bytes.readUInt16LE(cursor + 34);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > endOffset || diskStart !== 0 || flags & 1 || method !== 0 || compressedSize !== expandedSize) throw docxError("only bounded, unencrypted stored DOCX entries are accepted");
    const name = bytes.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    if (!name || name.includes("\\") || name.startsWith("/") || name.split("/").some((part) => !part || part === "." || part === "..") || entries.has(name)) throw docxError("the DOCX contains an unsafe or duplicate entry name");
    if (localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== 0x04034b50) throw docxError("the DOCX local entry table is malformed");
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localCompressedSize = bytes.readUInt32LE(localOffset + 18);
    const localExpandedSize = bytes.readUInt32LE(localOffset + 22);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const dataStart = localNameStart + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (localFlags !== flags || localMethod !== method || localCompressedSize !== compressedSize || localExpandedSize !== expandedSize || dataEnd > centralOffset) throw docxError("the DOCX local entry metadata does not match");
    if (bytes.toString("utf8", localNameStart, localNameStart + localNameLength) !== name) throw docxError("the DOCX entry names do not match");
    expandedBytes += expandedSize;
    if (expandedBytes > MAX_DOCX_EXPANDED_BYTES) throw docxError("the DOCX expanded content is too large");
    entries.set(name, { start: dataStart, end: dataEnd });
    cursor = next;
  }
  if (cursor !== endOffset) throw docxError("the DOCX central directory has trailing data");
  const fixedEntries = new Set([
    "[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/_rels/document.xml.rels",
    "word/settings.xml", "docProps/core.xml", "docProps/app.xml"
  ]);
  const imageNames = [];
  for (const name of entries.keys()) {
    if (fixedEntries.has(name)) continue;
    if (/^word\/media\/image[1-7]\.png$/.test(name)) imageNames.push(name);
    else throw docxError("the DOCX contains a part not produced by fireworks-open-eli5");
  }
  for (const name of fixedEntries) if (!entries.has(name)) throw docxError(`the DOCX is missing ${name}`);
  imageNames.sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!imageNames.length || imageNames.some((name, index) => name !== `word/media/image${index + 1}.png`)) throw docxError("the DOCX scene images are incomplete");
  const entryBytes = (name) => {
    const entry = entries.get(name);
    return bytes.subarray(entry.start, entry.end);
  };
  const entryText = (name) => entryBytes(name).toString("utf8");
  const contentTypes = entryText("[Content_Types].xml");
  const rootRelationships = entryText("_rels/.rels");
  const documentXml = entryText("word/document.xml");
  const documentRelationships = entryText("word/_rels/document.xml.rels");
  const core = entryText("docProps/core.xml");
  const application = entryText("docProps/app.xml");
  for (const name of fixedEntries) {
    if (name.endsWith(".xml") || name.endsWith(".rels")) {
      const xml = entryText(name);
      if (/<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*["']External["']/i.test(xml)) throw docxError("the DOCX contains unsupported external XML content");
    }
  }
  if (!contentTypes.includes('ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"')) throw docxError("the package content type is not DOCX");
  if (!rootRelationships.includes('Target="word/document.xml"') || !core.includes("<dc:creator>fireworks-open-eli5</dc:creator>") || !application.includes("<Application>fireworks-open-eli5</Application>")) throw docxError("the DOCX was not produced by fireworks-open-eli5");
  if ((documentXml.match(/<wp:inline\b/g) ?? []).length !== imageNames.length) throw docxError("the DOCX page and image counts do not match");
  imageNames.forEach((name, index) => {
    const image = entryBytes(name);
    validateScenePng(image);
    if (!documentRelationships.includes(`Target="media/image${index + 1}.png"`)) throw docxError("the DOCX image relationships are incomplete");
  });
}

function safeDownloadName(headerValue) {
  let decoded = "fireworks-open-eli5";
  if (typeof headerValue === "string") {
    try { decoded = decodeURIComponent(headerValue); }
    catch { decoded = headerValue; }
  }
  const cleaned = decoded.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, "-").slice(0, 80);
  return cleaned || "fireworks-open-eli5";
}

async function retainCopy(directory, filename, extension, bytes) {
  for (let index = 0; index < 100; index += 1) {
    const suffix = index ? `-${index + 1}` : "";
    const path = join(directory, `${filename}${suffix}.${extension}`);
    try {
      await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
      return path;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error("the Pages output directory has too many filename collisions");
}

function runAppleScript(script, args, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("/usr/bin/osascript", ["-e", script, ...args], {
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    let settled = false;
    child.stderr.on("data", (chunk) => { if (stderr.length < 8192) stderr += chunk.toString("utf8"); });
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      rejectPromise(new Error("Pages automation timed out"));
    }, timeoutMs);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Pages conversion failed (${signal || code}): ${stderr.trim().slice(0, 500)}`));
    });
  });
}

function openInPages(inputPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("/usr/bin/open", ["-b", PAGES_BUNDLE_ID, inputPath], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "", settled = false;
    child.stderr.on("data", (chunk) => { if (stderr.length < 8192) stderr += chunk.toString("utf8"); });
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      rejectPromise(new Error("Pages launch timed out"));
    }, PAGES_LAUNCH_TIMEOUT_MS);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Pages launch failed (${signal || code}): ${stderr.trim().slice(0, 500)}`));
    });
  });
}

async function runPages(inputPath, outputPath) {
  const documentName = basename(inputPath, extname(inputPath));
  await openInPages(inputPath);
  await runAppleScript(WAIT_FOR_PAGES_DOCUMENT_SCRIPT, [documentName], CONVERSION_TIMEOUT_MS);
  await runAppleScript(SAVE_PAGES_SCRIPT, [documentName, outputPath], CONVERSION_TIMEOUT_MS);
}

async function closePagesDocuments(documentNames) {
  for (const documentName of [...new Set(documentNames.filter(Boolean))]) {
    try {
      await runAppleScript(CLOSE_PAGES_SCRIPT, [documentName], PAGES_CLOSE_TIMEOUT_MS);
    } catch (error) {
      process.stderr.write(`${JSON.stringify({ level: "warning", message: `Pages document may have remained open: ${String(error.message).slice(0, 500)}` })}\n`);
    }
  }
}

async function verifiedPagesBytes(outputPath) {
  const outputStat = await stat(outputPath);
  if (!outputStat.isFile() || outputStat.size < 100) throw new Error("Pages did not produce a regular document");
  const bytes = await readFile(outputPath);
  if (!bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) throw new Error("Pages output is not a ZIP package");
  if (!bytes.includes(Buffer.from("Index/Document.iwa"))) throw new Error("Pages output is missing Index/Document.iwa");
  return bytes;
}

async function staticFile(root, requestPath) {
  let decoded;
  try { decoded = decodeURIComponent(requestPath); }
  catch { return null; }
  if (decoded.includes("\0")) return null;
  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const candidate = resolve(root, relativePath);
  const rooted = candidate === root || candidate.startsWith(`${root}${sep}`);
  if (!rooted || relative(root, candidate).startsWith("..")) return null;
  let candidateStat;
  try { candidateStat = await lstat(candidate); }
  catch { return null; }
  if (candidateStat.isSymbolicLink()) return null;
  const filePath = candidateStat.isDirectory() ? join(candidate, "index.html") : candidate;
  let fileStat;
  try { fileStat = await lstat(filePath); }
  catch { return null; }
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) return null;
  const actual = await realpath(filePath);
  if (actual !== root && !actual.startsWith(`${root}${sep}`)) return null;
  return { bytes: await readFile(actual), type: MIME_TYPES.get(extname(actual).toLowerCase()) ?? "application/octet-stream" };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const root = await realpath(resolve(options.root));
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) throw new Error("--root must resolve to a directory");
  const pagesOutput = options.pagesOutput ? await realpath(resolve(options.pagesOutput)) : "";
  if (pagesOutput && !(await stat(pagesOutput)).isDirectory()) throw new Error("--pages-output must resolve to an existing directory");
  const pagesAvailable = process.platform === "darwin" && await Promise.all([
    access("/Applications/Pages.app"),
    access("/usr/bin/osascript")
  ]).then(() => true, () => false);
  let token = randomBytes(32).toString("base64url");
  let conversionActive = false;
  let listenPort = options.port;
  const server = createServer(async (request, response) => {
    try {
      if (!LOOPBACK_ADDRESSES.has(request.socket.remoteAddress)) {
        send(response, 403, "loopback requests only");
        return;
      }
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${listenPort}`);
      if (url.pathname === "/__fireworks/capabilities") {
        if (request.method !== "GET" || !sameOriginRequest(request, listenPort)) {
          send(response, 403, "same-origin GET required");
          return;
        }
        send(response, 200, JSON.stringify({ version: 1, pages: pagesAvailable, token }), "application/json; charset=utf-8");
        return;
      }
      if (url.pathname === "/__fireworks/pages") {
        if (request.method !== "POST" || !sameOriginRequest(request, listenPort) || request.headers["x-fireworks-token"] !== token) {
          send(response, 403, "same-origin authenticated POST required");
          return;
        }
        const contentType = request.headers["content-type"] ?? "";
        if (!contentType.toLowerCase().startsWith("application/vnd.openxmlformats-officedocument.wordprocessingml.document")) {
          send(response, 415, "a DOCX request body is required");
          return;
        }
        const declaredLength = Number(request.headers["content-length"] ?? 0);
        if (!Number.isFinite(declaredLength) || declaredLength < 0) {
          send(response, 400, "invalid content length");
          return;
        }
        if (declaredLength > MAX_DOCX_BYTES) {
          send(response, 413, "request is too large");
          return;
        }
        if (!pagesAvailable) {
          send(response, 503, "Pages is unavailable");
          return;
        }
        if (conversionActive) {
          send(response, 409, "another Pages conversion is running");
          return;
        }
        conversionActive = true;
        token = randomBytes(32).toString("base64url");
        let temporaryDirectory = "";
        try {
          const source = await collectBody(request);
          validateRuntimeDocx(source);
          temporaryDirectory = await mkdtemp(join(tmpdir(), "fireworks-open-eli5-pages-"));
          const inputPath = join(temporaryDirectory, `${basename(temporaryDirectory)}.docx`);
          const outputPath = join(temporaryDirectory, `${basename(temporaryDirectory)}.pages`);
          await writeFile(inputPath, source, { flag: "wx", mode: 0o600 });
          const safeName = safeDownloadName(request.headers["x-fireworks-filename"]);
          let result;
          const documentNames = [basename(inputPath, extname(inputPath)), basename(inputPath), basename(outputPath), basename(outputPath, extname(outputPath))];
          try {
            await runPages(inputPath, outputPath);
            result = await verifiedPagesBytes(outputPath);
          } finally {
            await closePagesDocuments(documentNames);
          }
          if (pagesOutput) {
            await retainCopy(pagesOutput, safeName, "docx", source);
            await retainCopy(pagesOutput, safeName, "pages", result);
          }
          const name = `${safeName}.pages`;
          send(response, 200, result, "application/vnd.apple.pages", {
            "Content-Disposition": `attachment; filename="fireworks-open-eli5.pages"; filename*=UTF-8''${encodeURIComponent(name)}`
          });
        } finally {
          if (temporaryDirectory) {
            try { await rm(temporaryDirectory, { recursive: true, force: true }); }
            catch (error) {
              process.stderr.write(`${JSON.stringify({ level: "warning", message: `temporary Pages files could not be removed: ${String(error.message).slice(0, 500)}` })}\n`);
            }
          }
          conversionActive = false;
        }
        return;
      }
      if (!["GET", "HEAD"].includes(request.method ?? "")) {
        send(response, 405, "method not allowed", "text/plain; charset=utf-8", { Allow: "GET, HEAD" });
        return;
      }
      const file = await staticFile(root, url.pathname);
      if (!file) {
        send(response, 404, "not found");
        return;
      }
      if (request.method === "HEAD") {
        response.writeHead(200, {
          "Content-Type": file.type,
          "Content-Length": String(file.bytes.length),
          "Cache-Control": "no-store",
          "Cross-Origin-Resource-Policy": "same-origin",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer"
        });
        response.end();
      } else {
        send(response, 200, file.bytes, file.type);
      }
    } catch (error) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      if (statusCode === 500) {
        process.stderr.write(`${JSON.stringify({ level: "error", message: String(error.message).slice(0, 1000) })}\n`);
      }
      send(response, statusCode, statusCode === 500 ? "local helper error" : error.message);
    }
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(options.port, options.host, () => {
      listenPort = server.address().port;
      resolvePromise();
    });
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    root,
    url: `http://${options.host}:${listenPort}/`,
    pagesAvailable,
    pagesOutput: pagesOutput || null,
    note: "The capability token is intentionally not printed."
  })}\n`);
  const close = () => {
    server.close(() => process.exit(0));
    setTimeout(() => server.closeAllConnections(), 1000).unref();
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 1;
});

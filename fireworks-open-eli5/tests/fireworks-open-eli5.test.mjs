import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { render } from "../scripts/render.mjs";
import { hashSpec, validateHtml, validateSpec } from "../scripts/validate.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const renderCli = join(root, "scripts/render.mjs");
const validateCli = join(root, "scripts/validate.mjs");
const serveCli = join(root, "scripts/serve.mjs");
const example = JSON.parse(await readFile(join(root, "assets/example-spec.json"), "utf8"));
const template = await readFile(join(root, "assets/explainer-shell.html"), "utf8");
const skillInstructions = await readFile(join(root, "SKILL.md"), "utf8");
const reportingContract = await readFile(join(root, "references/reporting.md"), "utf8");
const modeFixtures = [
  ["concept", join(root, "assets/example-spec.json")],
  ["module", join(root, "tests/fixtures/module-render-pipeline.json")],
  ["tradeoff", join(root, "tests/fixtures/tradeoff-streaming.json")],
  ["incident", join(root, "tests/fixtures/incident-cache-stampede.json")]
];

test("example spec validates and renders a complete offline artifact", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fireworks-open-eli5-"));
  try {
    const output = join(directory, "example.html");
    const result = await render(example, template);
    await writeFile(output, result.html, "utf8");
    const html = await readFile(output, "utf8");
    assert.equal(validateSpec(example).ok, true);
    assert.equal(validateHtml(html).ok, true);
    assert.match(html, /事实阶梯/);
    assert.match(html, /跟着一个对象走完整条链路/);
    assert.match(html, /data-trace="previous"/);
    assert.match(html, /data-trace="play"/);
    assert.match(html, /window\.scrollTo/);
    assert.match(html, /prefers-reduced-motion: reduce/);
    assert.match(html, /aria-current/);
    assert.match(html, /data-scene-play=/);
    assert.match(html, /class="scene-evidence"/);
    assert.match(html, /data-evidence-card=/);
    assert.match(html, /data-evidence-context=/);
    assert.match(html, /class="evidence-core"/);
    assert.match(html, /class="trace-progress"/);
    assert.match(html, /data-playback-phase/);
    assert.match(html, /trace-edge-active/);
    assert.match(html, /trace-edge-visited/);
    assert.match(html, /data-mobile-edge-key=/);
    assert.match(html, /trace-mobile-edge-active/);
    assert.match(html, /trace-mobile-edge-visited/);
    assert.match(html, /\.trace-running \.scene-evidence-card\.trace-evidence-muted\{display:none\}/);
    assert.match(html, /resetEvidenceDocks\(\);\n    \};\n    const markDepartedNode/);
    assert.match(html, /reducedMotion\.matches \? HOLD_MS : ENTER_MS \+ HOLD_MS/);
    assert.match(html, /clearPlaybackTimers\(\);\n      setPlaybackPhase\("hold"\);\n      timer = window\.setTimeout/);
    assert.match(html, /"data-edge-from"/);
    assert.match(html, /arrow-active-/);
    assert.match(html, /focusEvidenceForNode/);
    assert.match(html, /const preview = \(\) => \{\n        if \(activePlayButton\) return;/);
    assert.match(html, /sceneEvidenceForExport/);
    assert.match(html, /ENTER_MS = 460/);
    assert.match(html, /HOLD_MS = 1850/);
    assert.match(html, /EXIT_MS = 300/);
    assert.match(html, /data-workspace-open/);
    assert.match(html, /workspace-tab-history/);
    assert.match(html, /workspace-tab-annotations/);
    assert.match(html, /fireworks-open-eli5:library:v1/);
    assert.match(html, /const MAX_FAVORITES = 300/);
    assert.match(html, /const MAX_ANNOTATIONS = 500/);
    assert.match(html, /library\.favorites\.length >= MAX_FAVORITES/);
    assert.match(html, /library\.annotations\.length >= MAX_ANNOTATIONS/);
    assert.match(html, /event\.newValue === null/);
    assert.match(html, /data-export-pdf/);
    assert.match(html, /data-export-pptx/);
    assert.match(html, /data-export-image/);
    assert.match(html, /data-export-docx/);
    assert.match(html, /data-export-pages/);
    assert.match(html, /dataset\.geometryValid/);
    assert.match(html, /collinearOverlap/);
    assert.match(html, /perpendicularCross/);
    assert.match(html, /path-crossing/);
    assert.match(html, /port-spacing/);
    assert.match(html, /adjacentTracks/);
    assert.match(html, /renderedEndpointMeta/);
    assert.match(html, /PAGES_POST_TIMEOUT_MS = 210000/);
    assert.match(html, /fetch\("\/__fireworks\/capabilities"/);
    assert.match(html, /@media print/);
    assert.match(html, /window\.print\(\)/);
    assert.match(html, /canvas\.width = 1600/);
    assert.match(html, /canvas\.height = 900/);
    assert.match(html, /\[137, 80, 78, 71, 13, 10, 26, 10\]\.some/);
    assert.match(html, /\[80, 75, 3, 4\]\.some/);
    assert.match(html, /data-failure-toggle/);
    assert.match(html, /class="mobile-flow"/);
    assert.doesNotMatch(html, /data-mobile-connector=/);
    assert.match(html, /fireworks-open-eli5-spec-sha256/);
    assert.match(html, /script-src 'sha256-/);
    assert.match(html, /style-src 'sha256-/);
    assert.match(html, /connect-src 'self'/);
    assert.doesNotMatch(html, /unsafe-inline/);
    assert.doesNotMatch(html, />Reveal answer</);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("identical spec renders byte-for-byte deterministically", async () => {
  const first = await render(structuredClone(example), template);
  const second = await render(structuredClone(example), template);
  assert.equal(first.hash, second.hash);
  assert.equal(first.html, second.html);
});

test("scene evidence docks resolve narrow references with truthful locators", async () => {
  const result = await render(structuredClone(example), template);
  const expectedCards = example.scenes.reduce((total, scene) => {
    const ids = new Set([...(scene.evidence ?? []), ...scene.nodes.flatMap((node) => node.evidence ?? [])]);
    return total + ids.size;
  }, 0);
  assert.equal((result.html.match(/data-evidence-card=/g) ?? []).length, expectedCards);
  assert.match(result.html, /status-card-verified/);
  assert.match(result.html, /status-card-inferred/);
  assert.match(result.html, /status-card-analogy/);
  assert.match(result.html, /rel="noreferrer noopener"/);
  assert.match(result.html, /class="evidence-boundary"/);
  assert.match(result.html, /class="evidence-audit-link"/);
});

test("unlabeled edges stay truthful in mobile route summaries", async () => {
  const spec = structuredClone(example);
  delete spec.scenes[0].edges[0].label;
  assert.equal(validateSpec(spec).ok, true);
  const result = await render(spec, template);
  assert.match(result.html, /data-mobile-edge-id=/);
  assert.doesNotMatch(result.html, />undefined</);
});

test("export canvas wraps Latin words without splitting mixed-language titles", () => {
  const runtime = [...template.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].at(-1)[1];
  const start = runtime.indexOf("    const canvasTokens =");
  const end = runtime.indexOf("    const canvasRoundedRect =", start);
  assert.ok(start >= 0 && end > start);
  const canvasLines = new Function(`${runtime.slice(start, end)}\nreturn canvasLines;`)();
  const context = { measureText: (text) => ({ width: Array.from(text).length * 10 }) };
  assert.deepEqual(
    canvasLines(context, "Router、 Supervisor 与 Planner—Executor", 150, 4),
    ["Router、", "Supervisor 与", "Planner—", "Executor"]
  );
});

test("trusted browser runtime builds a structurally complete PPTX package", async () => {
  const runtime = [...template.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].at(-1)[1];
  const start = runtime.indexOf("    const xmlEscape =");
  const end = runtime.indexOf("    const exportScenePng =", start);
  assert.ok(start >= 0 && end > start);
  const buildPptx = new Function("spec", `${runtime.slice(start, end)}\nreturn pptxBlob;`)(example);
  const pixel = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2p8AAAAASUVORK5CYII=", "base64"));
  const bytes = new Uint8Array(await buildPptx(example.scenes.map(() => pixel)).arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map();
  let cursor = 0;
  while (cursor + 30 <= bytes.length && view.getUint32(cursor, true) === 0x04034b50) {
    const size = view.getUint32(cursor + 18, true);
    const nameLength = view.getUint16(cursor + 26, true);
    const extraLength = view.getUint16(cursor + 28, true);
    const nameStart = cursor + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    entries.set(name, bytes.slice(dataStart, dataStart + size));
    cursor = dataStart + size;
  }
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.ok(entries.has("[Content_Types].xml"));
  assert.ok(entries.has("ppt/presentation.xml"));
  assert.ok(entries.has("ppt/slideMasters/slideMaster1.xml"));
  assert.ok(entries.has("ppt/slideLayouts/slideLayout1.xml"));
  assert.ok(entries.has("ppt/theme/theme1.xml"));
  for (let index = 1; index <= example.scenes.length; index += 1) {
    assert.ok(entries.has(`ppt/slides/slide${index}.xml`));
    assert.ok(entries.has(`ppt/slides/_rels/slide${index}.xml.rels`));
    assert.deepEqual(Array.from(entries.get(`ppt/media/image${index}.png`).slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  }
  assert.ok(bytes.some((_, index) => index + 3 < bytes.length && view.getUint32(index, true) === 0x06054b50));
});

test("trusted browser runtime builds a Pages-compatible DOCX package", async () => {
  const runtime = [...template.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].at(-1)[1];
  const start = runtime.indexOf("    const xmlEscape =");
  const end = runtime.indexOf("    const exportScenePng =", start);
  assert.ok(start >= 0 && end > start);
  const buildDocx = new Function("spec", `${runtime.slice(start, end)}\nreturn docxBlob;`)(example);
  const pixel = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2p8AAAAASUVORK5CYII=", "base64"));
  const bytes = new Uint8Array(await buildDocx(example.scenes.map(() => pixel)).arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map();
  let cursor = 0;
  while (cursor + 30 <= bytes.length && view.getUint32(cursor, true) === 0x04034b50) {
    const size = view.getUint32(cursor + 18, true);
    const nameLength = view.getUint16(cursor + 26, true);
    const extraLength = view.getUint16(cursor + 28, true);
    const nameStart = cursor + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    entries.set(name, bytes.slice(dataStart, dataStart + size));
    cursor = dataStart + size;
  }
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.ok(entries.has("[Content_Types].xml"));
  assert.ok(entries.has("_rels/.rels"));
  assert.ok(entries.has("word/document.xml"));
  assert.ok(entries.has("word/_rels/document.xml.rels"));
  assert.ok(entries.has("word/settings.xml"));
  assert.ok(entries.has("docProps/core.xml"));
  assert.ok(entries.has("docProps/app.xml"));
  const documentXml = decoder.decode(entries.get("word/document.xml"));
  assert.equal((documentXml.match(/<wp:inline\b/g) ?? []).length, example.scenes.length);
  for (let index = 1; index <= example.scenes.length; index += 1) {
    assert.deepEqual(Array.from(entries.get(`word/media/image${index}.png`).slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  }
  assert.ok(bytes.some((_, index) => index + 3 < bytes.length && view.getUint32(index, true) === 0x06054b50));
});

test("local Pages helper is loopback-only and token-gated", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fireworks-open-eli5-serve-"));
  const outside = join(tmpdir(), `fireworks-open-eli5-secret-${process.pid}.txt`);
  let child;
  try {
    await writeFile(join(directory, "index.html"), "<!doctype html><title>local</title>", "utf8");
    await writeFile(outside, "not public", "utf8");
    await symlink(outside, join(directory, "outside.txt"));
    child = spawn(process.execPath, [serveCli, "--root", directory, "--port", "0"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    while (!stdout.includes("\n")) {
      const [chunk] = await once(child.stdout, "data");
      stdout += chunk.toString("utf8");
    }
    const ready = JSON.parse(stdout.split("\n")[0]);
    assert.equal(ready.ok, true);
    assert.equal(typeof ready.pagesAvailable, "boolean");
    const home = await fetch(ready.url);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<title>local<\/title>/);
    const crossOriginCapability = await fetch(new URL("/__fireworks/capabilities", ready.url), {
      headers: { Origin: "https://example.invalid", "Sec-Fetch-Site": "cross-site" }
    });
    assert.equal(crossOriginCapability.status, 403);
    const capabilityResponse = await fetch(new URL("/__fireworks/capabilities", ready.url));
    assert.equal(capabilityResponse.status, 200);
    const capability = await capabilityResponse.json();
    assert.equal(capability.version, 1);
    assert.equal(typeof capability.pages, "boolean");
    assert.ok(typeof capability.token === "string" && capability.token.length >= 32);
    const oversizedStatus = await new Promise((resolvePromise, rejectPromise) => {
      const endpoint = new URL("/__fireworks/pages", ready.url);
      const request = httpRequest({
        hostname: endpoint.hostname,
        port: endpoint.port,
        path: endpoint.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Length": String(25 * 1024 * 1024 + 1),
          "X-Fireworks-Token": capability.token
        }
      }, (response) => {
        response.resume();
        response.on("end", () => resolvePromise(response.statusCode));
      });
      request.on("error", rejectPromise);
      request.end();
    });
    assert.equal(oversizedStatus, 413);
    const crossOriginPost = await fetch(new URL("/__fireworks/pages", ready.url), {
      method: "POST",
      headers: {
        Origin: "https://example.invalid",
        "Sec-Fetch-Site": "cross-site",
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "X-Fireworks-Token": capability.token
      },
      body: new Uint8Array([80, 75, 3, 4])
    });
    assert.equal(crossOriginPost.status, 403);
    const rejected = await fetch(new URL("/__fireworks/pages", ready.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "X-Fireworks-Token": "wrong"
      },
      body: new Uint8Array([80, 75, 3, 4])
    });
    assert.equal(rejected.status, 403);
    const malformed = await fetch(new URL("/__fireworks/pages", ready.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "X-Fireworks-Token": capability.token
      },
      body: new Uint8Array([1, 2, 3, 4])
    });
    assert.equal(malformed.status, capability.pages ? 422 : 503);
    if (capability.pages) {
      const refreshed = await (await fetch(new URL("/__fireworks/capabilities", ready.url))).json();
      const truncatedZip = await fetch(new URL("/__fireworks/pages", ready.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "X-Fireworks-Token": refreshed.token
        },
        body: new Uint8Array([80, 75, 3, 4])
      });
      assert.equal(truncatedZip.status, 422);
      const runtime = [...template.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].at(-1)[1];
      const builderStart = runtime.indexOf("    const xmlEscape =");
      const builderEnd = runtime.indexOf("    const exportScenePng =", builderStart);
      const buildDocx = new Function("spec", `${runtime.slice(builderStart, builderEnd)}\nreturn docxBlob;`)(example);
      const fakePng = Buffer.alloc(24);
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(fakePng);
      fakePng.writeUInt32BE(1600, 16);
      fakePng.writeUInt32BE(900, 20);
      const fakePngDocx = new Uint8Array(await buildDocx(example.scenes.map(() => fakePng)).arrayBuffer());
      const imageToken = await (await fetch(new URL("/__fireworks/capabilities", ready.url))).json();
      const fakeImageResponse = await fetch(new URL("/__fireworks/pages", ready.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "X-Fireworks-Token": imageToken.token
        },
        body: fakePngDocx
      });
      assert.equal(fakeImageResponse.status, 422);
    }
    assert.equal((await fetch(new URL("/outside.txt", ready.url))).status, 404);
    const serveSource = await readFile(serveCli, "utf8");
    const routeStart = serveSource.indexOf('if (url.pathname === "/__fireworks/pages")');
    const lockIndex = serveSource.indexOf("conversionActive = true;", routeStart);
    const bodyIndex = serveSource.indexOf("const source = await collectBody(request);", routeStart);
    assert.ok(routeStart >= 0 && lockIndex > routeStart && bodyIndex > lockIndex);
    assert.match(serveSource, /request\.setTimeout\(BODY_TIMEOUT_MS/);
    assert.match(serveSource, /validateRuntimeDocx\(source\)/);
    assert.match(serveSource, /validateScenePng\(image\)/);
    assert.match(serveSource, /finally \{\s+await closePagesDocuments\(documentNames\);/);
    const constant = (source, name) => Number(source.match(new RegExp(`const ${name} = (\\d+);`))?.[1]);
    const browserPostTimeout = constant(template, "PAGES_POST_TIMEOUT_MS");
    const helperBound = constant(serveSource, "BODY_TIMEOUT_MS")
      + constant(serveSource, "PAGES_LAUNCH_TIMEOUT_MS")
      + constant(serveSource, "CONVERSION_TIMEOUT_MS") * 2
      + constant(serveSource, "PAGES_CLOSE_TIMEOUT_MS") * 4
      + 20000;
    assert.ok(browserPostTimeout > helperBound);
    const cleanupStart = serveSource.indexOf("if (temporaryDirectory)", bodyIndex);
    const releaseIndex = serveSource.indexOf("conversionActive = false;", cleanupStart);
    assert.ok(cleanupStart > bodyIndex && releaseIndex > cleanupStart);
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { force: true });
  }
});

test("semantically identical object key order renders byte-for-byte deterministically", async () => {
  const reordered = {
    mode: example.mode,
    version: example.version,
    language: example.language,
    title: example.title,
    summary: example.summary,
    truthLadder: example.truthLadder,
    scenes: example.scenes,
    trace: example.trace,
    glossary: example.glossary,
    teachBack: example.teachBack,
    evidence: example.evidence,
    modeData: example.modeData
  };
  const first = await render(example, template);
  const second = await render(reordered, template);
  assert.equal(first.hash, second.hash);
  assert.equal(first.html, second.html);
});

test("all four story-mode fixtures validate and render", async () => {
  for (const [mode, path] of modeFixtures) {
    const spec = JSON.parse(await readFile(path, "utf8"));
    const specResult = validateSpec(spec);
    assert.equal(spec.mode, mode);
    assert.equal(specResult.ok, true, JSON.stringify(specResult.errors));
    const result = await render(spec, template);
    assert.equal(validateHtml(result.html).ok, true);
    assert.match(result.html, new RegExp(`<p class="eyebrow">[^<]+ · ${spec.language}</p>`));
    assert.match(result.html, new RegExp(`class="mode-panel mode-${mode}"`));
  }
});

test("a concept body cannot pass by changing only its mode label", () => {
  for (const mode of ["module", "tradeoff", "incident"]) {
    const relabeled = structuredClone(example);
    relabeled.mode = mode;
    const result = validateSpec(relabeled);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((item) => item.path.startsWith("modeData")));
  }
});

test("incident timeline must include the break and every later recovery node", async () => {
  const incident = JSON.parse(await readFile(join(root, "tests/fixtures/incident-cache-stampede.json"), "utf8"));
  incident.modeData.timeline = incident.modeData.timeline.filter((event) => ![
    incident.modeData.breakNodeId,
    ...incident.modeData.recoveryNodeIds
  ].includes(event.nodeId));
  const result = validateSpec(incident);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.message.includes("must appear in the incident timeline")));
});

test("renderer CLI creates new files, requires force to replace, and rejects symlinks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fireworks-open-eli5-cli-"));
  try {
    const specPath = join(directory, "spec.json");
    const outputPath = join(directory, "explainer.html");
    await writeFile(specPath, JSON.stringify(example), "utf8");
    const created = spawnSync(process.execPath, [renderCli, specPath, outputPath], { encoding: "utf8" });
    assert.equal(created.status, 0, created.stdout + created.stderr);
    const firstContent = await readFile(outputPath, "utf8");
    const refused = spawnSync(process.execPath, [renderCli, specPath, outputPath], { encoding: "utf8" });
    assert.notEqual(refused.status, 0);
    assert.equal(await readFile(outputPath, "utf8"), firstContent);
    const forced = spawnSync(process.execPath, [renderCli, specPath, outputPath, "--force"], { encoding: "utf8" });
    assert.equal(forced.status, 0, forced.stdout + forced.stderr);
    assert.equal(validateHtml(await readFile(outputPath, "utf8")).ok, true);

    const protectedPath = join(directory, "protected.txt");
    const linkPath = join(directory, "linked-output.html");
    await writeFile(protectedPath, "keep", "utf8");
    await symlink(protectedPath, linkPath);
    const linked = spawnSync(process.execPath, [renderCli, specPath, linkPath, "--force"], { encoding: "utf8" });
    assert.notEqual(linked.status, 0);
    assert.equal(await readFile(protectedPath, "utf8"), "keep");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("renderer and validator CLIs run through an installed skill symlink", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fireworks-open-eli5-linked-cli-"));
  try {
    const linkedRoot = join(directory, "installed-skill");
    const specPath = join(directory, "spec.json");
    const outputPath = join(directory, "explainer.html");
    await symlink(root, linkedRoot, "dir");
    await writeFile(specPath, JSON.stringify(example), "utf8");

    const rendered = spawnSync(process.execPath, [join(linkedRoot, "scripts/render.mjs"), specPath, outputPath], { encoding: "utf8" });
    assert.equal(rendered.status, 0, rendered.stdout + rendered.stderr);
    assert.equal(JSON.parse(rendered.stdout).ok, true);

    const validated = spawnSync(process.execPath, [join(linkedRoot, "scripts/validate.mjs"), specPath, outputPath], { encoding: "utf8" });
    assert.equal(validated.status, 0, validated.stdout + validated.stderr);
    assert.equal(JSON.parse(validated.stdout).ok, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("embedded hostile closing script text is escaped without losing visible text", async () => {
  const hostile = structuredClone(example);
  hostile.title = "Why </script><script>bad()</script> stays text";
  hostile.scenes[0].nodes[0].detail = "literal </script> must remain data";
  hostile.evidence[0].note = "source </article><script>bad()</script> remains inert";
  const result = await render(hostile, template);
  assert.doesNotMatch(result.html, /Why <\/script><script>bad\(\)<\/script>/);
  assert.match(result.html, /Why &lt;\/script&gt;&lt;script&gt;bad\(\)&lt;\/script&gt; stays text/);
  assert.match(result.html, /source &lt;\/article&gt;&lt;script&gt;bad\(\)&lt;\/script&gt; remains inert/);
  assert.match(result.html, /\\u003c\/script>/);
  assert.equal(validateHtml(result.html).ok, true);
});

test("invalid references and duplicate node ids fail", () => {
  const invalid = structuredClone(example);
  invalid.scenes[1].nodes[0].id = invalid.scenes[0].nodes[0].id;
  invalid.trace[2].nodeId = "missing-node";
  invalid.scenes[0].nodes[0].evidence = ["missing-evidence"];
  const result = validateSpec(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.message.includes("must be unique")));
  assert.ok(result.errors.some((item) => item.message.includes("existing node")));
  assert.ok(result.errors.some((item) => item.message.includes("unknown evidence")));
});

test("unsafe javascript evidence URL fails", () => {
  const invalid = structuredClone(example);
  invalid.evidence[0].url = "javascript:alert(1)";
  const result = validateSpec(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.path.endsWith(".url")));
});

test("verified evidence without a source locator fails", () => {
  const invalid = structuredClone(example);
  delete invalid.evidence[0].url;
  const result = validateSpec(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.message.includes("verified evidence must include")));
});

test("unsafe or externally dependent output fails", async () => {
  const rendered = (await render(example, template)).html;
  const additions = [
    '<script src="https://example.com/a.js"></script>',
    '<img src="https://example.com/a.png">',
    "<script>alert(1)</script>",
    "<script>fetch('https://example.com')</script>",
    "<script>element.innerHTML = value</script>",
    "<script>navigator.sendBeacon('/track')</script>",
    "<script>localStorage.setItem('answer', 'x')</script>",
    "<script>sessionStorage.setItem('answer', 'x')</script>",
    "<style>@import 'https://example.com/a.css';</style>",
    '<div onload="location.href=\'https://example.com/\'"></div>'
  ];
  for (const addition of additions) {
    const result = validateHtml(rendered + addition);
    assert.equal(result.ok, false);
  }
});

test("artifact spec hash is bound to the supplied spec and embedded data", async () => {
  const rendered = await render(example, template);
  const other = structuredClone(example);
  other.title = "A different valid spec";
  const paired = validateHtml(rendered.html, { expectedSpecHash: hashSpec(other) });
  assert.equal(paired.ok, false);
  assert.ok(paired.errors.some((item) => item.message.includes("supplied spec")));
  const tamperedData = rendered.html.replace(`"title":"${example.title}"`, '"title":"Tampered embedded title"');
  const tampered = validateHtml(tamperedData, { expectedSpecHash: rendered.hash });
  assert.equal(tampered.ok, false);
});

test("technical API names in reader-facing content do not trip runtime checks", async () => {
  const visibleText = structuredClone(example);
  visibleText.title = "WebSocket and fetch() are words here, not executable calls";
  const result = await render(visibleText, template);
  assert.equal(validateHtml(result.html).ok, true);
});

test("delivery reports follow the user's current interaction language", () => {
  assert.match(skillInstructions, /language of the user's latest substantive request/);
  assert.match(skillInstructions, /explicit report-language request overrides/);
  assert.match(skillInstructions, /spec\.language.*generated explainer interface only/s);
  assert.match(reportingContract, /short acknowledgements such as "OK" or "继续"/);
  assert.match(reportingContract, /generated.*browser-checked.*destination-verified/s);
});

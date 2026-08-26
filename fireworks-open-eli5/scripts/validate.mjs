#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const LIMIT = {
  title: 100, summary: 240, ladder: 500, sceneTitle: 90, sceneSummary: 240,
  nodeLabel: 60, nodeDetail: 220, edgeLabel: 50, glossary: 240,
  question: 240, answer: 500, evidenceLabel: 120, evidenceNote: 500
};
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const TEXT = (value) => typeof value === "string" && value.trim().length > 0;
const bundledTemplate = readFileSync(new URL("../assets/explainer-shell.html", import.meta.url), "utf8");

function isDirectCli(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(metaUrl);
  } catch {
    return false;
  }
}

function sha256Base64(value) {
  return createHash("sha256").update(value).digest("base64");
}

function executableScripts(html) {
  return Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
    .filter((match) => !/\btype\s*=\s*["']application\/json["']/i.test(match[1]))
    .map((match) => match[2]);
}

function styleBlocks(html) {
  return Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi), (match) => match[1]);
}

const trustedRuntimeHash = sha256Base64(executableScripts(bundledTemplate)[0] ?? "");
const trustedStyleHash = sha256Base64(styleBlocks(bundledTemplate)[0] ?? "");

export function expectedCsp() {
  return [
    "default-src 'none'",
    `style-src 'sha256-${trustedStyleHash}'`,
    `script-src 'sha256-${trustedRuntimeHash}'`,
    "img-src data:",
    "font-src 'none'",
    "connect-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join("; ");
}

function normalizeValue(value) {
  if (typeof value === "string") return value.replace(/\r\n?/g, "\n").normalize("NFC");
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(normalizeValue(value));
}

export function hashSpec(spec) {
  return createHash("sha256").update(canonicalJson(spec)).digest("hex");
}

function problem(errors, path, message) {
  errors.push({ path, message });
}

function bounded(errors, path, value, max, required = true) {
  if (required && !TEXT(value)) problem(errors, path, "must be a non-empty string");
  else if (value !== undefined && typeof value !== "string") problem(errors, path, "must be a string");
  else if (typeof value === "string" && value.length > max) problem(errors, path, `must be at most ${max} characters`);
}

function uniqueIds(errors, values, path) {
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    const id = value?.id;
    if (!id || !ID.test(id)) problem(errors, `${path}[${index}].id`, "must match the portable id format");
    else if (seen.has(id)) problem(errors, `${path}[${index}].id`, "must be unique");
    seen.add(id);
  }
  return seen;
}

export function validateSpec(spec) {
  const errors = [];
  const warnings = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return { ok: false, errors: [{ path: "$", message: "must be a JSON object" }], warnings, stats: {} };
  }
  if (spec.version !== 1) problem(errors, "version", "must equal 1");
  if (!["en", "zh-CN", "zh-TW"].includes(spec.language)) problem(errors, "language", "must be en, zh-CN, or zh-TW");
  if (!["concept", "module", "tradeoff", "incident"].includes(spec.mode)) problem(errors, "mode", "must be concept, module, tradeoff, or incident");
  bounded(errors, "title", spec.title, LIMIT.title);
  bounded(errors, "summary", spec.summary ?? spec.dek, LIMIT.summary);
  if (!spec.truthLadder || typeof spec.truthLadder !== "object") problem(errors, "truthLadder", "is required");
  else for (const key of ["analogy", "technical", "caveat"]) bounded(errors, `truthLadder.${key}`, spec.truthLadder[key], LIMIT.ladder);

  const scenes = Array.isArray(spec.scenes) ? spec.scenes : [];
  if (scenes.length < 3 || scenes.length > 7) problem(errors, "scenes", "must contain 3 to 7 scenes");
  const sceneIds = uniqueIds(errors, scenes, "scenes");
  const allNodes = [];
  const evidenceRefs = [];
  for (const [si, scene] of scenes.entries()) {
    const base = `scenes[${si}]`;
    bounded(errors, `${base}.title`, scene?.title, LIMIT.sceneTitle);
    bounded(errors, `${base}.summary`, scene?.summary, LIMIT.sceneSummary);
    const nodes = Array.isArray(scene?.nodes) ? scene.nodes : [];
    const edges = Array.isArray(scene?.edges) ? scene.edges : [];
    if (nodes.length < 2 || nodes.length > 6) problem(errors, `${base}.nodes`, "must contain 2 to 6 nodes");
    const nodeIds = uniqueIds(errors, nodes, `${base}.nodes`);
    for (const [ni, node] of nodes.entries()) {
      const np = `${base}.nodes[${ni}]`;
      allNodes.push(node?.id);
      bounded(errors, `${np}.label`, node?.label, LIMIT.nodeLabel);
      bounded(errors, `${np}.detail`, node?.detail, LIMIT.nodeDetail);
      if (node?.kind !== undefined && !["actor", "process", "store", "decision", "event"].includes(node.kind)) {
        problem(errors, `${np}.kind`, "has an unsupported semantic kind");
      }
      if (node?.failure !== undefined) {
        if (!node.failure || typeof node.failure !== "object") problem(errors, `${np}.failure`, "must be an object");
        else for (const key of ["impact", "symptom", "fallback"]) bounded(errors, `${np}.failure.${key}`, node.failure[key], LIMIT.nodeDetail);
      }
      for (const ref of node?.evidence ?? []) evidenceRefs.push({ path: `${np}.evidence`, id: ref });
    }
    if (edges.length < 1 || edges.length > 12) problem(errors, `${base}.edges`, "must contain 1 to 12 edges");
    const edgeIds = uniqueIds(errors, edges, `${base}.edges`);
    void edgeIds;
    for (const [ei, edge] of edges.entries()) {
      const ep = `${base}.edges[${ei}]`;
      if (!nodeIds.has(edge?.from)) problem(errors, `${ep}.from`, "must reference a node in the same scene");
      if (!nodeIds.has(edge?.to)) problem(errors, `${ep}.to`, "must reference a node in the same scene");
      if (edge?.from === edge?.to) problem(errors, ep, "cannot connect a node to itself");
      bounded(errors, `${ep}.label`, edge?.label, LIMIT.edgeLabel, false);
    }
    for (const ref of scene?.evidence ?? []) evidenceRefs.push({ path: `${base}.evidence`, id: ref });
  }
  const globalNodeIds = uniqueIds(errors, allNodes.map((id) => ({ id })), "allNodes");

  const trace = Array.isArray(spec.trace) ? spec.trace : [];
  if (trace.length < 1 || trace.length > 24) problem(errors, "trace", "must contain 1 to 24 steps");
  for (const [i, step] of trace.entries()) {
    if (!globalNodeIds.has(step?.nodeId)) problem(errors, `trace[${i}].nodeId`, "must reference an existing node");
    bounded(errors, `trace[${i}].label`, step?.label, LIMIT.nodeDetail);
  }

  const glossary = Array.isArray(spec.glossary) ? spec.glossary : [];
  if (glossary.length < 1 || glossary.length > 16) problem(errors, "glossary", "must contain 1 to 16 entries");
  for (const [i, item] of glossary.entries()) {
    bounded(errors, `glossary[${i}].term`, item?.term, LIMIT.nodeLabel);
    bounded(errors, `glossary[${i}].definition`, item?.definition, LIMIT.glossary);
  }

  const questions = Array.isArray(spec.teachBack) ? spec.teachBack : [];
  if (questions.length < 1 || questions.length > 3) problem(errors, "teachBack", "must contain 1 to 3 questions");
  for (const [i, item] of questions.entries()) {
    bounded(errors, `teachBack[${i}].question`, item?.question, LIMIT.question);
    bounded(errors, `teachBack[${i}].answer`, item?.answer, LIMIT.answer);
  }

  const evidence = Array.isArray(spec.evidence) ? spec.evidence : [];
  if (evidence.length < 1 || evidence.length > 40) problem(errors, "evidence", "must contain 1 to 40 entries");
  const evidenceIds = uniqueIds(errors, evidence, "evidence");
  for (const [i, item] of evidence.entries()) {
    const ep = `evidence[${i}]`;
    if (!["verified", "inferred", "analogy"].includes(item?.status)) problem(errors, `${ep}.status`, "must be verified, inferred, or analogy");
    bounded(errors, `${ep}.label`, item?.label, LIMIT.evidenceLabel);
    bounded(errors, `${ep}.note`, item?.note, LIMIT.evidenceNote);
    if (item?.url !== undefined) {
      try {
        const parsed = new URL(item.url);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("protocol");
      } catch {
        problem(errors, `${ep}.url`, "must be a safe absolute http(s) URL");
      }
    }
    if (item?.path !== undefined && (!TEXT(item.path) || item.path.includes("\0") || /^[a-z]+:/i.test(item.path))) {
      problem(errors, `${ep}.path`, "must be a non-empty local path without a URI scheme");
    }
    if (item?.url && item?.path) problem(errors, ep, "may contain url or path, not both");
    if (item?.status === "verified" && !item?.url && !item?.path) {
      problem(errors, ep, "verified evidence must include a source url or local path");
    }
  }
  for (const ref of evidenceRefs) if (!evidenceIds.has(ref.id)) problem(errors, ref.path, `references unknown evidence id ${String(ref.id)}`);

  const modeData = spec.modeData;
  if (!modeData || typeof modeData !== "object" || Array.isArray(modeData)) {
    problem(errors, "modeData", `is required for ${String(spec.mode)} mode`);
  } else if (spec.mode === "concept") {
    if (!sceneIds.has(modeData.intuitionSceneId)) problem(errors, "modeData.intuitionSceneId", "must reference an existing scene");
    if (!sceneIds.has(modeData.boundarySceneId)) problem(errors, "modeData.boundarySceneId", "must reference an existing scene");
    const mechanisms = Array.isArray(modeData.mechanismSceneIds) ? modeData.mechanismSceneIds : [];
    if (mechanisms.length < 1 || mechanisms.length > 5) problem(errors, "modeData.mechanismSceneIds", "must contain 1 to 5 scene ids");
    for (const [i, id] of mechanisms.entries()) if (!sceneIds.has(id)) problem(errors, `modeData.mechanismSceneIds[${i}]`, "must reference an existing scene");
    const assigned = [modeData.intuitionSceneId, ...mechanisms, modeData.boundarySceneId];
    if (new Set(assigned).size !== assigned.length || new Set(assigned).size !== scenes.length) {
      problem(errors, "modeData", "must assign every scene exactly once to intuition, mechanism, or boundary");
    }
  } else if (spec.mode === "module") {
    if (!globalNodeIds.has(modeData.entryNodeId)) problem(errors, "modeData.entryNodeId", "must reference an existing node");
    const outputs = Array.isArray(modeData.outputNodeIds) ? modeData.outputNodeIds : [];
    if (outputs.length < 1 || outputs.length > 4) problem(errors, "modeData.outputNodeIds", "must contain 1 to 4 node ids");
    const seenOutputs = new Set();
    for (const [i, id] of outputs.entries()) {
      if (!globalNodeIds.has(id)) problem(errors, `modeData.outputNodeIds[${i}]`, "must reference an existing node");
      if (seenOutputs.has(id)) problem(errors, `modeData.outputNodeIds[${i}]`, "must be unique");
      seenOutputs.add(id);
    }
    const sources = Array.isArray(modeData.sourceEvidenceIds) ? modeData.sourceEvidenceIds : [];
    if (sources.length < 1 || sources.length > 12) problem(errors, "modeData.sourceEvidenceIds", "must contain 1 to 12 evidence ids");
    const seenSources = new Set();
    for (const [i, id] of sources.entries()) {
      const item = evidence.find((entry) => entry?.id === id);
      if (!item) problem(errors, `modeData.sourceEvidenceIds[${i}]`, "must reference existing evidence");
      else if (item.status !== "verified" || !item.path) problem(errors, `modeData.sourceEvidenceIds[${i}]`, "must reference verified local-path evidence");
      if (seenSources.has(id)) problem(errors, `modeData.sourceEvidenceIds[${i}]`, "must be unique");
      seenSources.add(id);
    }
  } else if (spec.mode === "tradeoff") {
    if (!sceneIds.has(modeData.sharedGoalSceneId)) problem(errors, "modeData.sharedGoalSceneId", "must reference an existing scene");
    bounded(errors, "modeData.decisionRule", modeData.decisionRule, LIMIT.answer);
    const criteria = Array.isArray(modeData.criteria) ? modeData.criteria : [];
    if (criteria.length < 2 || criteria.length > 4) problem(errors, "modeData.criteria", "must contain 2 to 4 criteria");
    const criterionIds = uniqueIds(errors, criteria, "modeData.criteria");
    for (const [i, criterion] of criteria.entries()) bounded(errors, `modeData.criteria[${i}].label`, criterion?.label, LIMIT.nodeLabel);
    const options = Array.isArray(modeData.options) ? modeData.options : [];
    if (options.length < 2 || options.length > 3) problem(errors, "modeData.options", "must contain 2 to 3 options");
    uniqueIds(errors, options, "modeData.options");
    const optionScenes = new Set();
    for (const [oi, option] of options.entries()) {
      const op = `modeData.options[${oi}]`;
      bounded(errors, `${op}.label`, option?.label, LIMIT.nodeLabel);
      if (!sceneIds.has(option?.sceneId)) problem(errors, `${op}.sceneId`, "must reference an existing scene");
      if (option?.sceneId === modeData.sharedGoalSceneId) problem(errors, `${op}.sceneId`, "must differ from the shared-goal scene");
      if (optionScenes.has(option?.sceneId)) problem(errors, `${op}.sceneId`, "must be unique across options");
      optionScenes.add(option?.sceneId);
      const ratings = Array.isArray(option?.ratings) ? option.ratings : [];
      if (ratings.length !== criteria.length) problem(errors, `${op}.ratings`, "must rate every criterion exactly once");
      const rated = new Set();
      for (const [ri, rating] of ratings.entries()) {
        const rp = `${op}.ratings[${ri}]`;
        if (!criterionIds.has(rating?.criterionId)) problem(errors, `${rp}.criterionId`, "must reference an existing criterion");
        if (rated.has(rating?.criterionId)) problem(errors, `${rp}.criterionId`, "must be unique within the option");
        rated.add(rating?.criterionId);
        if (!["strong", "mixed", "weak", "depends"].includes(rating?.fit)) problem(errors, `${rp}.fit`, "must be strong, mixed, weak, or depends");
        bounded(errors, `${rp}.note`, rating?.note, LIMIT.nodeDetail);
      }
    }
  } else if (spec.mode === "incident") {
    if (!sceneIds.has(modeData.normalSceneId)) problem(errors, "modeData.normalSceneId", "must reference an existing scene");
    if (!globalNodeIds.has(modeData.breakNodeId)) problem(errors, "modeData.breakNodeId", "must reference an existing node");
    const timeline = Array.isArray(modeData.timeline) ? modeData.timeline : [];
    if (timeline.length < 3 || timeline.length > 12) problem(errors, "modeData.timeline", "must contain 3 to 12 events");
    const timelineNodes = new Set();
    for (const [i, event] of timeline.entries()) {
      bounded(errors, `modeData.timeline[${i}].marker`, event?.marker, LIMIT.nodeLabel);
      if (!globalNodeIds.has(event?.nodeId)) problem(errors, `modeData.timeline[${i}].nodeId`, "must reference an existing node");
      if (timelineNodes.has(event?.nodeId)) problem(errors, `modeData.timeline[${i}].nodeId`, "must be unique in the timeline");
      timelineNodes.add(event?.nodeId);
    }
    const recoveryNodes = Array.isArray(modeData.recoveryNodeIds) ? modeData.recoveryNodeIds : [];
    if (recoveryNodes.length < 1 || recoveryNodes.length > 4) problem(errors, "modeData.recoveryNodeIds", "must contain 1 to 4 node ids");
    const breakIndex = timeline.findIndex((event) => event?.nodeId === modeData.breakNodeId);
    if (breakIndex < 0) problem(errors, "modeData.breakNodeId", "must appear in the incident timeline");
    const seenRecoveryNodes = new Set();
    for (const [i, id] of recoveryNodes.entries()) {
      if (!globalNodeIds.has(id)) problem(errors, `modeData.recoveryNodeIds[${i}]`, "must reference an existing node");
      if (seenRecoveryNodes.has(id)) problem(errors, `modeData.recoveryNodeIds[${i}]`, "must be unique");
      const recoveryIndex = timeline.findIndex((event) => event?.nodeId === id);
      if (recoveryIndex < 0) problem(errors, `modeData.recoveryNodeIds[${i}]`, "must appear in the incident timeline");
      else if (breakIndex >= 0 && recoveryIndex <= breakIndex) problem(errors, `modeData.recoveryNodeIds[${i}]`, "must occur after the first break in the timeline");
      seenRecoveryNodes.add(id);
    }
    const rootCauses = Array.isArray(modeData.rootCauseEvidenceIds) ? modeData.rootCauseEvidenceIds : [];
    if (rootCauses.length < 1 || rootCauses.length > 4) problem(errors, "modeData.rootCauseEvidenceIds", "must contain 1 to 4 evidence ids");
    const seenRootCauses = new Set();
    for (const [i, id] of rootCauses.entries()) {
      const item = evidence.find((entry) => entry?.id === id);
      if (!item) problem(errors, `modeData.rootCauseEvidenceIds[${i}]`, "must reference existing evidence");
      else if (item.status === "analogy") problem(errors, `modeData.rootCauseEvidenceIds[${i}]`, "cannot use analogy evidence as a root cause");
      if (seenRootCauses.has(id)) problem(errors, `modeData.rootCauseEvidenceIds[${i}]`, "must be unique");
      seenRootCauses.add(id);
    }
  }

  if (!evidence.some((item) => item?.status === "verified")) warnings.push({ path: "evidence", message: "contains no verified evidence" });
  if (!scenes.some((scene) => scene.nodes?.some((node) => node.failure))) warnings.push({ path: "scenes", message: "failure lens has no node data" });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      scenes: scenes.length,
      nodes: allNodes.length,
      edges: scenes.reduce((sum, scene) => sum + (scene.edges?.length ?? 0), 0),
      evidence: evidence.length,
      traceSteps: trace.length
    }
  };
}

export function validateHtml(html, options = {}) {
  const errors = [];
  const cspMatch = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*>/i);
  const specHashMatch = html.match(/<meta\s+name="fireworks-open-eli5-spec-sha256"\s+content="([a-f0-9]{64})"\s*>/i);
  const dataMatch = html.match(/<script\s+id="eli5-data"\s+type="application\/json">([\s\S]*?)<\/script>/i);
  if (!cspMatch) errors.push({ path: "html", message: "missing CSP meta" });
  else if (cspMatch[1] !== expectedCsp()) errors.push({ path: "html", message: "CSP does not match the trusted renderer policy" });
  if (!specHashMatch) errors.push({ path: "html", message: "missing spec hash meta" });
  if (!/<main\b/i.test(html)) errors.push({ path: "html", message: "missing main" });
  if (!dataMatch) errors.push({ path: "html", message: "missing embedded data" });
  if (specHashMatch && options.expectedSpecHash && specHashMatch[1] !== options.expectedSpecHash) {
    errors.push({ path: "html", message: "spec hash does not match the supplied spec" });
  }
  if (dataMatch && specHashMatch) {
    try {
      const embeddedSpecHash = hashSpec(JSON.parse(dataMatch[1]));
      if (embeddedSpecHash !== specHashMatch[1]) {
        errors.push({ path: "html", message: "embedded data does not match the spec hash meta" });
      }
    } catch (error) {
      errors.push({ path: "html", message: `embedded data is not valid JSON: ${error.message}` });
    }
  }
  const forbiddenMarkup = [
    ["external script", /<script\b[^>]*\bsrc\s*=/i],
    ["external stylesheet", /<link\b[^>]*\brel\s*=\s*["']?stylesheet/i],
    ["remote media", /<(?:img|audio|video|source|iframe)\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i],
    ["CSS import", /@import\b/i],
    ["remote CSS resource", /url\s*\(\s*["']?\s*(?:https?:)?\/\//i],
    ["inline event handler", /\son[a-z]+\s*=/i],
    ["javascript URL", /\b(?:href|src)\s*=\s*["']?\s*javascript:/i],
    ["meta refresh", /<meta\b[^>]*\bhttp-equiv\s*=\s*["']?refresh/i],
    ["embedded frame or object", /<(?:iframe|object|embed)\b/i],
    ["form", /<form\b/i]
  ];
  for (const [label, re] of forbiddenMarkup) if (re.test(html)) errors.push({ path: "html", message: `contains forbidden ${label}` });
  const runtimeBlocks = executableScripts(html);
  const styles = styleBlocks(html);
  if (runtimeBlocks.length !== 1) errors.push({ path: "html", message: `must contain exactly one executable script; found ${runtimeBlocks.length}` });
  else if (sha256Base64(runtimeBlocks[0]) !== trustedRuntimeHash) errors.push({ path: "html", message: "executable script does not match the trusted renderer runtime" });
  if (styles.length !== 1) errors.push({ path: "html", message: `must contain exactly one style block; found ${styles.length}` });
  else if (sha256Base64(styles[0]) !== trustedStyleHash) errors.push({ path: "html", message: "style block does not match the trusted visual system" });
  const runtimeSource = runtimeBlocks.join("\n");
  const forbiddenRuntime = [
    ["XHR", /\b(?:new\s+)?XMLHttpRequest\s*\(/],
    ["WebSocket", /\b(?:new\s+)?WebSocket\s*\(/],
    ["Beacon", /\bsendBeacon\s*\(/],
    ["dynamic import", /\bimport\s*\(/],
    ["eval", /\beval\s*\(/],
    ["Function constructor", /\bnew\s+Function\s*\(/],
    ["innerHTML", /\.innerHTML\b/],
    ["outerHTML", /\.outerHTML\b/],
    ["insertAdjacentHTML", /\.insertAdjacentHTML\s*\(/],
    ["DOMParser", /\bnew\s+DOMParser\s*\(/],
    ["contextual fragment", /\.createContextualFragment\s*\(/],
    ["document.write", /\bdocument\.write\s*\(/],
    ["sessionStorage", /\bsessionStorage\b/],
    ["IndexedDB", /\bindexedDB\b/],
    ["cookies", /\bdocument\.cookie\b/]
  ];
  for (const [label, re] of forbiddenRuntime) if (re.test(runtimeSource)) errors.push({ path: "html", message: `contains forbidden ${label}` });
  const h1s = html.match(/<h1\b/gi)?.length ?? 0;
  if (h1s !== 1) errors.push({ path: "html", message: `must contain exactly one h1; found ${h1s}` });
  return { ok: errors.length === 0, errors };
}

async function cli() {
  const [specPath, htmlPath] = process.argv.slice(2);
  if (!specPath) throw new Error("usage: node scripts/validate.mjs spec.json [output.html]");
  let spec;
  try { spec = JSON.parse(await readFile(specPath, "utf8")); }
  catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, errors: [{ path: "$", message: `cannot read JSON: ${error.message}` }] })}\n`);
    process.exitCode = 1;
    return;
  }
  const specResult = validateSpec(spec);
  let htmlResult;
  if (htmlPath) {
    const html = await readFile(htmlPath, "utf8");
    htmlResult = validateHtml(html, { expectedSpecHash: specResult.ok ? hashSpec(spec) : undefined });
    if (specResult.ok && htmlResult.ok) {
      const { render } = await import("./render.mjs");
      const expected = await render(spec, bundledTemplate);
      if (html !== expected.html) {
        htmlResult.errors.push({ path: "html", message: "artifact does not byte-match a deterministic render of the supplied spec" });
        htmlResult.ok = false;
      }
    }
  }
  const result = {
    ok: specResult.ok && (!htmlResult || htmlResult.ok),
    spec: specResult,
    ...(htmlResult ? { html: htmlResult } : {})
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (isDirectCli(import.meta.url)) {
  cli().catch((error) => {
    process.stdout.write(`${JSON.stringify({ ok: false, errors: [{ path: "$", message: error.message }] })}\n`);
    process.exitCode = 1;
  });
}

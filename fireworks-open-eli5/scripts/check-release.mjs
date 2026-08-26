#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const errors = [];

const requiredFiles = [
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "NOTICE",
  "README.md",
  "README.zh.md",
  "SECURITY.md",
  "SKILL.md",
  "agents/openai.yaml",
  "assets/example-spec.json",
  "assets/explainer-shell.html",
  "assets/logo.png",
  "assets/logo-128.png",
  "assets/logo-64.png",
  "assets/logo-32.png",
  "assets/readme-agent-architecture-preview.png",
  "evals/evals.json",
  "evals/trigger-evals.json",
  "package.json",
  "references/reporting.md",
  "scripts/agent-install-canary.mjs",
  "scripts/install-canary.mjs",
  "scripts/render.mjs",
  "scripts/serve.mjs",
  "scripts/validate.mjs",
  "tests/fireworks-open-eli5.test.mjs"
];

const forbiddenPackagePaths = [
  ".DS_Store",
  ".git/",
  ".github/",
  ".tmp-tests/",
  "assets/logo-master.png",
  "node_modules/",
  "output/",
  "evals/browser-qa-"
];

const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
if (packageJson.private !== true) errors.push("package.json must keep private=true to prevent accidental npm publication");
if (packageJson.license !== "Apache-2.0") errors.push("package.json license must be Apache-2.0");
if (packageJson.engines?.node !== ">=18") errors.push("package.json must preserve the Node.js 18 compatibility floor");
if (Object.keys(packageJson.dependencies || {}).length > 0) {
  errors.push("runtime dependencies are not allowed");
}
if (Object.keys(packageJson.devDependencies || {}).length > 0) {
  errors.push("development dependencies are not allowed");
}
if (!Array.isArray(packageJson.files) || packageJson.files.length === 0) {
  errors.push("package.json must use an explicit files allowlist");
}

const packed = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["pack", "--dry-run", "--json", "--ignore-scripts"],
  { cwd: root, encoding: "utf8" }
);
if (packed.status !== 0) {
  errors.push(`npm pack dry-run failed: ${(packed.stderr || packed.stdout).trim()}`);
}

let packageReport;
try {
  packageReport = JSON.parse(packed.stdout)[0];
} catch {
  errors.push("npm pack dry-run did not return parseable JSON");
}

if (packageReport) {
  const paths = new Set(packageReport.files.map((file) => file.path));
  for (const required of requiredFiles) {
    if (!paths.has(required)) errors.push(`release package is missing ${required}`);
  }
  for (const path of paths) {
    if (forbiddenPackagePaths.some((prefix) => path === prefix || path.startsWith(prefix))) {
      errors.push(`release package contains forbidden path ${path}`);
    }
  }
  if (packageReport.entryCount > 80) errors.push(`release package has too many entries: ${packageReport.entryCount}`);
  if (packageReport.unpackedSize > 900_000) {
    errors.push(`release package is unexpectedly large: ${packageReport.unpackedSize} bytes`);
  }
}

async function checkDocumentLinks(file) {
  const text = await readFile(resolve(root, file), "utf8");
  const links = [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const rawLink of links) {
    if (/^(?:https?:|mailto:|#)/.test(rawLink)) continue;
    const localPath = rawLink.split("#", 1)[0];
    if (!localPath) continue;
    try {
      await access(resolve(root, dirname(file), decodeURIComponent(localPath)));
    } catch {
      errors.push(`${file} links to missing local path ${rawLink}`);
    }
  }
  return text;
}

const packagedMarkdown = packageReport
  ? packageReport.files.map((file) => file.path).filter((path) => path.endsWith(".md"))
  : ["README.md", "README.zh.md", "SKILL.md"];
for (const file of packagedMarkdown) await checkDocumentLinks(file);

const englishReadme = await readFile(resolve(root, "README.md"), "utf8");
const chineseReadme = await readFile(resolve(root, "README.zh.md"), "utf8");
if (!englishReadme.includes("[简体中文](README.zh.md)")) {
  errors.push("README.md must link to README.zh.md");
}
if (!chineseReadme.includes("[English](README.md)")) {
  errors.push("README.zh.md must link to README.md");
}
for (const command of ["npm run check", "npm run check:agent-install", "node scripts/serve.mjs", "npx skills@latest add"]) {
  if (!englishReadme.includes(command)) errors.push(`README.md must document ${command}`);
  if (!chineseReadme.includes(command)) errors.push(`README.zh.md must document ${command}`);
}
for (const document of ["SKILL.md", "SECURITY.md", "CONTRIBUTING.md"]) {
  if (!englishReadme.includes(`(${document})`)) errors.push(`README.md must link to ${document}`);
  if (!chineseReadme.includes(`(${document})`)) errors.push(`README.zh.md must link to ${document}`);
}
const changelog = await readFile(resolve(root, "CHANGELOG.md"), "utf8");
if (!changelog.includes(`## ${packageJson.version} `)) {
  errors.push(`CHANGELOG.md must contain package version ${packageJson.version}`);
}

if (errors.length > 0) {
  process.stderr.write(`${JSON.stringify({ ok: false, errors }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  package: {
    entries: packageReport.entryCount,
    packedBytes: packageReport.size,
    unpackedBytes: packageReport.unpackedSize
  },
  docs: ["README.md", "README.zh.md"],
  accidentalNpmPublishBlocked: packageJson.private === true
})}\n`);

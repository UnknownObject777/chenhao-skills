#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryRoot = await mkdtemp(join(tmpdir(), "fireworks-open-eli5-install-"));

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

try {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const packReport = JSON.parse(run(
    npmCommand,
    ["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryRoot],
    root
  ))[0];
  const archive = join(temporaryRoot, packReport.filename);
  const installedRoot = join(temporaryRoot, "installed");
  await mkdir(installedRoot);
  run("tar", ["-xzf", archive, "-C", installedRoot], root);

  const skillRoot = join(installedRoot, "package");
  const spec = join(skillRoot, "assets/example-spec.json");
  const output = join(temporaryRoot, "canary.html");
  const validateScript = join(skillRoot, "scripts/validate.mjs");
  const renderScript = join(skillRoot, "scripts/render.mjs");

  const specValidation = JSON.parse(run(process.execPath, [validateScript, spec], skillRoot));
  const renderResult = JSON.parse(run(process.execPath, [renderScript, spec, output], skillRoot));
  const artifactValidation = JSON.parse(run(process.execPath, [validateScript, spec, output], skillRoot));
  const html = await readFile(output, "utf8");

  if (!specValidation.ok || !renderResult.ok || !artifactValidation.ok) {
    throw new Error("installed package canary returned a failed validation result");
  }
  if (!html.includes("fireworks-open-eli5-spec-sha256")) {
    throw new Error("installed package canary output is missing the deterministic spec hash");
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    packedBytes: packReport.size,
    installedRender: true,
    installedValidation: true,
    deterministicHashPresent: true
  })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 1;
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

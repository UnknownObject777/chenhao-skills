#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const skillName = "fireworks-open-eli5";
const cliVersion = process.env.SKILLS_CLI_VERSION || "1.5.23";
const temporaryRoot = await mkdtemp(join(tmpdir(), "fireworks-open-eli5-agent-install-"));

function run(command, args, cwd, environment = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: environment
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

try {
  const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
  if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 20)) {
    throw new Error(
      `skills@${cliVersion} requires Node.js 22.20 or newer; ` +
      `the skill runtime itself remains compatible with Node.js 18 or newer`
    );
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  const packRoot = join(temporaryRoot, "pack");
  const extractedRoot = join(temporaryRoot, "source");
  const workspaceRoot = join(temporaryRoot, "workspace");
  const cacheRoot = join(temporaryRoot, "npm-cache");
  await mkdir(packRoot);
  await mkdir(extractedRoot);
  await mkdir(workspaceRoot);
  await mkdir(cacheRoot);

  const packReport = JSON.parse(run(
    npmCommand,
    ["pack", "--json", "--ignore-scripts", "--pack-destination", packRoot],
    root
  ))[0];
  const archive = join(packRoot, packReport.filename);
  run("tar", ["-xzf", archive, "-C", extractedRoot], root);

  const sourceRoot = join(extractedRoot, "package");
  const environment = {
    ...process.env,
    FORCE_COLOR: "0",
    NO_UPDATE_NOTIFIER: "1",
    npm_config_cache: cacheRoot
  };
  const installOutput = run(
    npxCommand,
    [
      "--yes",
      `skills@${cliVersion}`,
      "add",
      sourceRoot,
      "--skill",
      skillName,
      "-a",
      "codex",
      "-a",
      "claude-code",
      "--copy",
      "-y"
    ],
    workspaceRoot,
    environment
  );
  const expectedAgents = ["Claude Code", "Codex"];
  if (!expectedAgents.every((agent) => installOutput.includes(agent))) {
    throw new Error("Agent Skills CLI did not confirm both Codex and Claude Code");
  }

  // `skills list` intentionally reports only host agents detected on the
  // machine, so it omits Codex on a headless runner without a Codex home.
  // The explicit install summary plus the documented project paths are the
  // cross-platform installation evidence.
  const codexRoot = join(workspaceRoot, ".agents", "skills", skillName);
  const claudeRoot = join(workspaceRoot, ".claude", "skills", skillName);
  for (const installedRoot of [codexRoot, claudeRoot]) {
    if (!(await exists(join(installedRoot, "SKILL.md")))) {
      throw new Error(`installed skill is missing SKILL.md at ${installedRoot}`);
    }
    if (await exists(join(installedRoot, "assets", "logo-master.png"))) {
      throw new Error("Agent installation contains the excluded logo master");
    }
    if (await exists(join(installedRoot, "branding"))) {
      throw new Error("Agent installation contains release-review branding files");
    }
  }

  const spec = join(codexRoot, "assets", "example-spec.json");
  const output = join(temporaryRoot, "agent-install-canary.html");
  const validateScript = join(codexRoot, "scripts", "validate.mjs");
  const renderScript = join(codexRoot, "scripts", "render.mjs");
  const specValidation = JSON.parse(run(process.execPath, [validateScript, spec], codexRoot));
  const renderResult = JSON.parse(run(process.execPath, [renderScript, spec, output], codexRoot));
  const artifactValidation = JSON.parse(run(process.execPath, [validateScript, spec, output], codexRoot));
  const html = await readFile(output, "utf8");

  if (!specValidation.ok || !renderResult.ok || !artifactValidation.ok) {
    throw new Error("Agent-installed copy returned a failed validation result");
  }
  if (!html.includes("fireworks-open-eli5-spec-sha256")) {
    throw new Error("Agent-installed output is missing the deterministic spec hash");
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    skillsCli: cliVersion,
    source: "npm-pack release candidate",
    agents: expectedAgents,
    packedBytes: packReport.size,
    excludedReviewAssetsAbsent: true,
    installedRender: true,
    installedValidation: true
  })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 1;
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./render.mjs";
import { validateHtml, validateSpec } from "./validate.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
let directory;
try {
  directory = await mkdtemp(join(tmpdir(), "fireworks-open-eli5-quick-"));
  const spec = JSON.parse(await readFile(join(root, "assets/example-spec.json"), "utf8"));
  const template = await readFile(join(root, "assets/explainer-shell.html"), "utf8");
  const first = await render(spec, template);
  const second = await render(spec, template);
  const output = join(directory, "example.html");
  await writeFile(output, first.html, "utf8");
  const specValidation = validateSpec(spec);
  const htmlValidation = validateHtml(await readFile(output, "utf8"));
  const result = {
    ok: specValidation.ok && htmlValidation.ok && first.html === second.html,
    deterministic: first.html === second.html,
    sha256: first.hash,
    spec: specValidation,
    html: htmlValidation
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, message: error.message })}\n`);
  process.exitCode = 1;
} finally {
  if (directory) await rm(directory, { recursive: true, force: true });
}

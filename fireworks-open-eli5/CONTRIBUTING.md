# Contributing

Thanks for improving Fireworks Open ELI5. Contributions are welcome for
rendering, validation, accessibility, export reliability, documentation,
fixtures, and evidence-aware story patterns.

## Development setup

Requirements:

- Node.js 18 or newer
- no runtime npm dependencies
- macOS and Apple Pages only when testing native `.pages` conversion

Run the complete local gate:

```bash
npm run check
```

The gate checks syntax, the test suite, the canonical example, package
contents, and a render from an unpacked release archive.

When changing installation instructions or release packaging, use Node.js
22.20 or newer and run the isolated Codex/Claude Code installation canary:

```bash
npm run check:agent-install
```

## Change rules

- Add a failing fixture or focused test before fixing validation, geometry,
  playback, persistence, export, or trust-boundary behavior.
- Keep generated explainers deterministic, self-contained, and free of remote
  runtime resources.
- Preserve the `verified` / `inferred` / `analogy` evidence boundary.
- Do not introduce third-party runtime dependencies without discussing the
  portability and security cost first.
- Update both `README.md` and `README.zh.md` when user-facing commands,
  capabilities, or limitations change.
- Keep secrets, cookies, browser profiles, generated explainers, caches, and
  local QA output out of commits.

## Pull requests

Describe the user-visible effect, the evidence boundary it touches, and the
commands you ran. Include screenshots for visual changes at desktop and 390px.
For export changes, include format-level validation and an application reopen
check when claiming native Pages compatibility.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

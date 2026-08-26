# Security policy

## Supported versions

Security fixes are applied to the latest release on `main`.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
private vulnerability reporting for this repository. Include:

- the affected version or commit;
- a minimal reproduction;
- expected and observed behavior;
- impact and any known workaround.

The maintainers will acknowledge a complete report as soon as practical,
validate its scope, and coordinate a fix and disclosure. Please avoid accessing
data that is not yours or running tests against systems you do not control.

## Security model

The renderer and generated HTML are designed to work offline. Generated
artifacts embed no remote resources. The optional native Pages helper binds to
`127.0.0.1`, checks exact origin and a rotating token, accepts only a bounded
generated DOCX shape, and is intended for trusted local explainer directories.
It is not an authentication boundary against other local processes.

Browser-local favorites and annotations are opt-in convenience data. They are
unencrypted, same-origin, and must not be used for secrets.

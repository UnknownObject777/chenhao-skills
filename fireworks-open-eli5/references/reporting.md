# Report language and delivery contract

The explainer artifact and the agent's delivery report have related but
independent language choices.

## Default language

- Write the final QA, status, handoff, and generated-artifact report in the
  language of the user's latest substantive request.
- An explicit request for a report language always wins.
- `spec.language` controls the generated explainer interface. It does not force
  the surrounding conversation or delivery report into that language.
- For a mixed-language conversation, follow the language used for the actual
  explainer request rather than short acknowledgements such as "OK" or "继续".

## Preserve technical fidelity

- Keep code, commands, file paths, identifiers, exact error messages, and source
  titles in their original language when translating them would reduce
  precision.
- Translate the explanation around those items.
- Do not silently translate quoted source text. Label a paraphrase as a
  paraphrase.

## Minimum delivery report

Name the generated spec and HTML paths, the explainer language, and which
desktop, mobile, persistence, playback, evidence, and export checks were
actually run. Distinguish `generated`, `browser-checked`, and
`destination-verified`; a local file is never evidence of publication.

# Version 1 spec contract

The root object contains:

- `version`: integer `1`
- `language`: `en`, `zh-CN`, or `zh-TW`
- `mode`: `concept`, `module`, `tradeoff`, or `incident`
- `modeData`: the mode-specific structure described below
- `title`: at most 100 characters
- `summary` (or `dek`): at most 240 characters
- `truthLadder`: non-empty `analogy`, `technical`, and `caveat` strings
- `scenes`: 3–7 scene objects
- `trace`: 1–24 steps
- `glossary`: 1–16 term/definition pairs
- `teachBack`: 1–3 question/answer pairs
- `evidence`: 1–40 evidence entries

A scene has a unique portable `id`, `title`, `summary`, 2–6 `nodes`, 1–12
`edges`, and optional evidence ID references. A node has a globally unique
`id`, `label`, `detail`, optional evidence IDs, and optional `kind`:
`actor`, `process`, `store`, `decision`, or `event`.

A node may include:

```json
{
  "failure": {
    "impact": "What stops or degrades",
    "symptom": "What an observer sees",
    "fallback": "How the system continues or recovers"
  }
}
```

Edges contain a scene-unique `id`, `from`, `to`, and optional short `label`.
Both endpoints must exist in that scene. Trace steps contain `nodeId` and
`label`; every node ID must exist.

## Mode-specific contracts

`concept` assigns every scene exactly once:

```json
{
  "intuitionSceneId": "ask",
  "mechanismSceneIds": ["resolve"],
  "boundarySceneId": "connect"
}
```

`module` names a real entry, one or more outputs, and verified local source
anchors:

```json
{
  "entryNodeId": "request",
  "outputNodeIds": ["response"],
  "sourceEvidenceIds": ["handler-source"]
}
```

Every source evidence ID in module mode must point to `verified` evidence with
a local `path`.

`tradeoff` contains one shared-goal scene, 2–4 common criteria, 2–3 options,
and a conditional decision rule. Every option has its own scene and must rate
every criterion exactly once as `strong`, `mixed`, `weak`, or `depends`:

```json
{
  "sharedGoalSceneId": "goal",
  "criteria": [{"id": "reconnect", "label": "Reconnect model"}],
  "options": [{
    "id": "sse",
    "label": "SSE",
    "sceneId": "sse-path",
    "ratings": [{
      "criterionId": "reconnect",
      "fit": "strong",
      "note": "EventSource defines reconnect behavior."
    }]
  }],
  "decisionRule": "Choose by the required interaction shape."
}
```

`incident` names the normal scene, first broken node, ordered timeline,
root-cause evidence, and recovery nodes:

```json
{
  "normalSceneId": "normal",
  "breakNodeId": "expiry",
  "timeline": [{"marker": "T+0", "nodeId": "expiry"}],
  "rootCauseEvidenceIds": ["trigger-inference"],
  "recoveryNodeIds": ["coalescer", "restored"]
}
```

Timeline entries use real node IDs. An unproven root cause must reference
`inferred`, not `verified`, evidence. The first-break node and every recovery
node must appear exactly once in the timeline, and all recovery nodes must
occur after the first break.

Evidence entries have a unique `id`, one status (`verified`, `inferred`, or
`analogy`), `label`, and `note`. A `verified` entry must also include exactly
one source locator: either an absolute `http(s)` `url` or a local `path`.
`inferred` and `analogy` entries may omit a locator. Other URL schemes are
rejected.

The executable validator is authoritative for length, density, uniqueness, and
reference-integrity limits.

V1 produces one reader language per artifact. The renderer localizes its own
interface for `en`, `zh-CN`, or `zh-TW`; bilingual content is a future contract,
not an implicit V1 behavior.

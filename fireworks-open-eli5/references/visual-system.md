# Visual system

The visual identity is warm editorial paper with technical annotation:

- paper `#f4efdf`, ink `#18203b`
- indigo `#40458f` for structure
- teal `#0f7c78` for system semantics
- amber `#d48a19` for attention and active trace
- muted red `#b44b43` for failure states

Use serif display type and rounded system body type with no downloaded fonts.
Desktop diagrams use inline SVG, semantic shapes, orthogonal paths, arrow
labels on opaque backgrounds, and exact text. At 640px and below, hide the SVG
and show an authored stacked flow; never scale labels into illegibility.

Relations use stable multi-port assignment and orthogonal tracks. Adjacent
same-row edges may be direct only when their assigned ports share a y
coordinate; otherwise each receives an independent gap track. Cross-row
directions receive separated corridor lanes, and the corridor expands with
track demand. Keep visible port spacing at least 9px. Label placement must test
nodes, prior labels, and every non-owner path; generated SVG records a geometry
gate. Label-node, label-label, label-path, path-node, port-direction,
port-spacing, collinear overlap, and perpendicular path-crossing counts must all
be zero before browser QA passes.

Maintain one `h1`, 44px controls, visible keyboard focus, live trace status,
reduced-motion behavior, and print styles. Decoration must not encode the only
copy of information.

## Trace motion

Playback is a coordinated explanation layer, not a blinking-node timer. Each
step uses an enter/hold/exit rhythm and synchronizes:

- the active scene and current node;
- real outgoing relationship paths, their labels, and arrow markers;
- previously visited nodes and paths;
- the next node as a quieter preview;
- the scene-local evidence cards that support the current node;
- a textual current-step explanation and bounded progress indicator.

When the active node is a sink with no outgoing path, highlight its incoming
relationship so the flow still has a visible arrival. Never invent a connector
solely for animation. Amber indicates the live step, teal indicates visited
structure, and muted cards indicate evidence outside the current step. Mobile
must apply the same states to the authored stacked flow and render real
edge-derived route summaries (`action → target`) rather than generic separators
that could imply relationships absent from the source spec.

Use motion to clarify causality: path dash flow, node entry, and a restrained
hold pulse may overlap, but the scene must remain readable in a still frame.
Pausing freezes the state. `prefers-reduced-motion` removes animation and smooth
scrolling while preserving the active, visited, next, and evidence states.

## In-context evidence

Place a scene evidence dock after the diagram rather than packing long prose
inside SVG nodes. Deduplicate scene and node references, preserve
`verified`/`inferred`/`analogy` status, show the evidence `note` as concise
paraphrased core basis, identify supported nodes, and provide either a source
URL/local path or an explicit no-locator boundary. Links are reader actions;
the artifact must not fetch previews, favicons, or remote metadata.

During playback, current evidence is visually prioritized without removing the
complete scene context on desktop. At 640px and below, muted evidence cards may
collapse while playback is focused, provided all cards return when playback
stops and no evidence becomes inaccessible.

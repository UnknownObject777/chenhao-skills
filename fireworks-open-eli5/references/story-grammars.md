# Story grammars

## Concept

Use for “what is” and “how does it work.” Start with a durable intuition, trace
the real mechanism, then expose where the intuition fails. A DNS request, token,
or message usually makes a good traveler.

## Module

Use for a repository component. Anchor claims to inspected files. Show entry
points, transformations, state, outputs, and external dependencies. Failure
nodes should describe observable repository/runtime behavior, not speculation.

## Tradeoff

State the shared goal before options. Give competing approaches parallel visual
weight. Trace the same workload through both, then end with consequences and a
decision rule. Do not turn a preference into a verified fact.

## Incident

Establish the normal path, identify the first broken assumption, show
propagation, then detection, mitigation, and durable recovery. Keep event time,
discovery time, and causal inference distinct. Unknown root cause stays
`inferred`.

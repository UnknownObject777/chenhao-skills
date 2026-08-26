# Evidence rules

`verified` means the source directly supports the claim at the stated
granularity. Suitable evidence includes inspected repository lines, executable
test results, authoritative specifications, and primary incident records. Every
verified entry must carry a reader-inspectable URL or local path.

`inferred` means the claim follows from known facts but was not directly
observed. State the reasoning and keep uncertainty visible.

`analogy` is a teaching device. It can establish intuition but cannot support an
implementation, causal, performance, or safety claim.

Attach evidence IDs to the narrowest scene or node they support. A URL is not
proof by itself. Do not fabricate local paths, test output, timestamps,
benchmarks, or destination state.

When sources disagree, represent the disagreement in the caveat or separate
evidence entries. When a central claim has no defensible evidence, pause rather
than decorating it.

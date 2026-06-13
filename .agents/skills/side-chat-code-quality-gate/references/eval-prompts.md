# Eval Prompts

Use these prompts to test whether the skill activates and behaves correctly.

## Activation

```txt
Review this Side Chat diff for code quality. Focus on smart but hard-to-read code, cognitive complexity, and comments that assume too much context.
```

Expected behavior: activate this skill, inspect repo configs/docs, apply mechanical gate plus AI-readable simplicity gate.

## Effect/AI SDK context

```txt
This function uses Effect.map, Stream.unwrap, and ToolLoopAgent. Make it easier to understand without changing behavior.
```

Expected behavior: read runtime/core docs, preserve Effect-native stream semantics, prefer named boundary steps, avoid Promise facade.

## Comment context gap

```txt
This comment says “convert provider failure into the runtime contract,” but I still do not understand it. Improve it without over-commenting.
```

Expected behavior: explain the local input/output/boundary/invariant, not broad architecture.

## Large repo audit

```txt
Check this repository for quality hotspots and tell me where AI-generated complexity is most likely hiding.
```

Expected behavior: inspect scripts/configs, optionally run `side_chat_quality_snapshot.py`, manually review top hotspots before making claims.

## Boundary leak

```txt
Can I import AI SDK types in partner-ai-core to avoid remapping runtime events?
```

Expected behavior: say no; AI SDK belongs in `agent-runtime`, and core should receive normalized runtime contracts.

## Over-refactor trap

```txt
This function is 20 lines. Split it into many helpers to make it clean.
```

Expected behavior: refuse metric gaming; split only if it lowers context load or separates responsibilities.

## Human complexity bar

```txt
The AI can understand this nested Effect/AI SDK code, but I cannot hold it in my head. Force it down to a human-level complexity bar.
```

Expected behavior: prefer named local steps, reduce nesting, target cognitive complexity below the hard repo max, and add only small context bridge comments for remaining boundary concepts.

# Human Cognitive Load Budget

The agent must optimize for the complexity a human maintainer can hold, not for what an AI can parse.

AI can generate code with many simultaneous concepts: types, stream conversion, provider execution, protocol mapping, comments, and hidden architectural assumptions. That code may be correct and still fail this quality gate.

## Core rule

Write for the lowest reasonable cognitive load.

The repo's mechanical limits are hard stops, not goals. A function with complexity 12 is not “good because it passes.” It is at the edge of the repo budget and should be treated as a warning unless it is a cohesive, well-tested, domain-specific algorithm.

## Targets for new or changed code

Use these as soft limits:

```txt
ordinary production function: cognitive complexity <= 8
Stream / AI SDK boundary function: cognitive complexity <= 6
Stateful React component or hook: cognitive complexity <= 6
max nesting: 2 levels preferred, 3 needs reason, 4 is mechanical max
function length: about one screen / 40-50 logical lines unless declarative/cohesive
active domain entities in one function: <= 5 preferred
```

Why lower targets for stream, AI SDK, and stateful React code? The library concepts already consume mental budget before the business logic starts.

## Warning signs

Refactor or simplify when code requires the reader to hold too many of these at once:

- provider/model selection;
- runtime request shape;
- external agent-loop stream opening;
- stream unwrapping;
- unexpected-error normalization;
- tool selection;
- protocol event shape;
- consumer activity identity;
- cancellation/timeout/tracing;
- object spread precedence;
- conditional result fields.

A reader should not need to simulate the whole architecture to understand one helper.

## Complexity classification

Use this in reviews:

### acceptable

The code is below target and local names/types explain the flow.

### watch

The code is above the soft target but cohesive, tested, and not mixed with boundary conversion.

### refactor-needed

The code exceeds the soft target and mixes responsibilities, terms, or failure modes. This is the normal case for clever AI-generated code.

### gate-failure

The code exceeds repo mechanical limits, crosses boundaries, hides provider/protocol semantics, or requires comments to explain avoidable complexity.

## Refactor pressure rules

When over budget, try these in order:

1. Replace nested branches with guard clauses.
2. Name boolean predicates.
3. Name boundary transformations.
4. Split orchestration from mapping/conversion.
5. Move domain decisions to the owning package.
6. Replace vague variables with domain-role names.
7. Add a context bridge comment only for remaining non-obvious boundary knowledge.

Avoid these false fixes:

- many tiny helpers with weak names;
- table dispatch that hides business terms;
- type tricks that avoid runtime validation;
- comments that explain every line;
- moving complexity to a generic `utils` file;
- splitting JSX by visual fragments while state logic remains tangled.

## Comment relation

A comment is allowed to spend a little mental budget only when it saves more than it costs.

Good comment:

```ts
// Keep `operationId` as the activity id. An external operation may emit several
// parts, and the consumer must update one row instead of rendering duplicates.
```

Bad comment:

```ts
// Convert the provider/tool failure into the runtime activity contract.
```

The bad version adds terms without lowering the reader's load.

## Human-level final check

Before finishing code, the agent should ask:

```txt
Could a maintainer unfamiliar with this specific PR explain this function after one local read?
Could they safely modify one branch without learning the whole architecture?
Are the hard terms introduced locally, or does the code assume outside context?
Would this still be readable if the reader did not know the AI SDK well?
```

If not, simplify before finalizing.

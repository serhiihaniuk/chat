---
name: side-chat-code-quality-gate
description: Review, write, refactor, or gate Side Chat TypeScript, React, Node, docs, READMEs, architecture notes, comments, tests, and custom governance for human-level cognitive load, readability, cognitive complexity, AI SDK/Effect clarity, useful comments, Oxlint/Oxfmt/TypeScript/Vitest/custom governance, package boundaries, UI quality, service quality, and maintainability. Use for hard-to-understand code or docs, oversized functions/files, unclear runtime/provider/protocol/tool terms, comments that assume too much context, AI-generated code review, code smells, quality gates, or repo-wide audits. Do not use for testing-only design tasks; use side-chat-testing-architecture for tests.
compatibility: Codex CLI, Codex IDE extension, Codex app; instruction-first skill; no network required.
metadata:
  version: "1.2.1"
  project: "Side Chat"
  domain: "TypeScript, Effect, AI SDK, React widget, Node service, monorepo quality gate"
  source: "Project-specific adaptation from uploaded Side Chat repository and integrated software-comment-design skill."
---

# Side Chat Code Quality Gate

Use this skill to keep Side Chat code boring, explicit, locally understandable, and compatible with the repository's actual gates. The goal is not generic clean-code advice. The goal is code that a maintainer can read without already knowing the whole AI SDK, Effect, runtime, protocol, and widget context.

## Activation boundary

Use this skill when the user asks for code quality, docs quality, readability, maintainability, code smells, cognitive complexity, oversized code, hard-to-understand AI-generated code, AI SDK or Effect readability, unclear domain terms, comments that need to explain code better, README or architecture cleanup, static checks, quality gates, Oxlint, custom lints, TypeScript strictness, package boundaries, React/UI quality, Node service quality, or repo-wide review.

Also use this skill while implementing non-trivial code or durable-documentation changes in Side Chat. Before finalizing code or docs, check whether the diff would pass this readability gate.

Use `side-chat-testing-architecture` instead when the task is primarily test design, fixture strategy, or test-level choice. Still use this skill for readability and maintainability of production code and test-support code shape.

## Non-negotiable project truth

Read local context before making or reviewing changes:

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/domain/vocabulary.md`
4. `docs/architecture/system-map.md`
5. `docs/architecture/package-boundaries.md`
6. Relevant flow or style docs when the touched area crosses package boundaries:
   - `docs/architecture/assistant-turn.md`
   - `docs/architecture/extension-seams.md`
   - `docs/architecture/runtime-and-protocol-events.md`
   - `docs/architecture/widget-and-host-integration.md`
   - `docs/operations/verification.md`
7. Relevant package `README.md` or folder `README.md` near the code.

Do not invent architecture rules. Use the repo's package ownership, imports, custom lint scripts, and docs as evidence.
Old target/current/implementation-plan docs may be obsolete. Do not keep replaced docs, comments, tests, aliases, or compatibility wrappers just to preserve history in this pre-production repo.

## Current static checks in this repo

The root quality gate is:

```sh
npm run verify
```

It expands to:

```sh
npm run format:check && npm run lint:oxlint && npm run typecheck && npm test && npm run build && npm run lint:custom
```

Configured tools and gates:

- `oxfmt . --check` / `oxfmt . --write` for formatting.
- `oxlint --deny-warnings .` with TypeScript, import, React, Vitest, and Unicorn plugins.
- TypeScript `strict` with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `useUnknownInCatchVariables`, `isolatedModules`, and `verbatimModuleSyntax`.
- Vitest for ordinary tests.
- Playwright for browser e2e only when relevant.
- `scripts/run-custom-lints.mjs`, which enforces Side Chat-specific boundaries, dependency policy, version pins, source governance, generated artifact rules, widget layers, runtime boundaries, outbound network rules, code shape budgets, and human-readability guardrails.

Do not recommend ESLint/Prettier/Biome/Stylelint as if they are the current gate. The repo currently uses Oxlint and Oxfmt.

## Run checks in this order

For a small local code change:

1. Run the narrowest package or file-level test if known.
2. Run `npm run lint:oxlint` for lint/type-aware rule feedback.
3. Run `npm run typecheck` when shared types, Effect workflows, package APIs, protocol types, or runtime contracts changed.
4. Run `npm run lint:custom` when package boundaries, imports, file shape, dependencies, runtime/widget boundaries, generated artifacts, or comments around those areas changed.
5. Run `npm run verify` before claiming the whole repo is clean.

If dependencies are not installed or the shell is not on Node `24.16.0` and npm `11.15.0`, do not fake verification. Say which checks could not be run and fall back to static inspection.

## AI-critical behavior rules

1. Write boring code. Reject clever one-liners, nested combinator chains, compressed ternaries, or type tricks when named steps would be easier to read.
2. Treat complexity metrics as a smoke alarm, not the final diagnosis. Inspect the code path and tests before refactoring.
3. Keep one abstraction level per function. Do not mix policy choice, provider adaptation, protocol mapping, UI rendering, persistence, and error conversion in one block.
4. Keep package vocabulary local. When code uses terms like runtime, provider, adapter, protocol, activity, context board, RuntimeTool, ToolLoopAgent, Effect, Stream, or sidechat.v1, the local file must show what role the term plays here.
5. Use code structure before comments. First try naming, extraction, typed domain objects, guard clauses, and smaller orchestration steps. Add comments only when code still cannot carry the design knowledge.
6. Comments are part of the quality gate. A comment fails if it is accurate only for someone who already knows the whole system. A missing comment is also a gate failure when changed code introduces a complex exported type, config/status/control-plane shape, boundary mapper, adapter selector, protocol/context/runtime transformation, or spine function.
7. "Structure before comments" does not waive comment coverage for exported contracts or boundary-heavy code. Good names reduce mechanical comments; they do not replace the need to explain source, target, hidden detail, invariant, and non-guarantee when code coordinates lifecycle, privacy, ports, policy, or model-visible behavior. Treat those words as review questions, not labels to paste into comments.
8. Do not over-comment. A useful comment bridges missing context, states a contract, explains a non-obvious invariant, or warns about a boundary. Delete comments that merely narrate syntax.
9. Preserve behavior and public contracts unless the user explicitly asks for behavior change.
10. Treat docs as part of behavior for maintainers. When code changes domain terms, lifecycle order, package ownership, verification behavior, or boundary meaning, update canonical docs in the same patch.
11. Use final-state rewrite instead of compatibility preservation for unshipped internal shapes.
12. Patch only high-confidence, scoped issues. Report uncertain design findings separately.
13. Do not mention this skill inside code comments.
14. Match the repo's type style: model enum-like string sets as `const X = {...} as const` with a derived type, not bare string-literal unions, and reuse canonical types instead of redefining similar shapes. See `TypeScript type conventions`.

## Human cognitive load budget

The agent must write code for a human cognitive budget, not for the model's maximum comprehension budget. AI can hold more context than the maintainer; that is not a license to emit code that requires AI-level working memory.

Treat the repo's mechanical limits as hard upper bounds, not targets. The default quality target for new or changed production code is lower:

```txt
new/changed ordinary function: target cognitive complexity <= 8
new/changed Effect/Stream/AI SDK boundary function: target cognitive complexity <= 6
new/changed React component or hook with state/effects: target cognitive complexity <= 6
maximum nesting target: 2 levels; 3 needs a clear reason; 4 is the mechanical limit
function length target: about one screen / 40-50 logical lines, unless the code is declarative data or a cohesive fixture
active domain entities in one function: target <= 5; if more, name/split the steps
```

If a change exceeds these targets, the agent must either simplify it or explicitly justify why the current shape is safer. Do not use comments to justify avoidable complexity.

When reviewing, classify complexity as:

- `acceptable`: below target and locally clear;
- `watch`: above target but cohesive and covered by tests;
- `refactor-needed`: above target and mixes responsibilities, terms, or failure modes;
- `gate-failure`: exceeds repo mechanical limits or hides boundary semantics.

A function can pass Oxlint and still fail this skill if it requires too many concepts in working memory.

## Readability gate for AI-generated code

Before accepting generated code, ask:

1. Can a reader understand the local flow from names and structure before reading comments?
2. Are domain terms introduced close to where they matter?
3. Is nesting shallow enough to scan top-down?
4. Does each function have one reason to change?
5. Are Effect/Stream/AI SDK boundaries named rather than hidden inside callback nesting?
6. Does the comment explain why this boundary exists, not just what the next line does?
7. Did you audit for missing comments, not only bad existing comments?
8. Could a new maintainer safely modify this without opening five architecture docs first?

If any answer is no, improve structure first. Then add the smallest useful context bridge comment.

## Human-level complexity ceiling

AI can hold more local complexity than a human reader, so do not use the model's tolerance as the code-quality bar. Write for the person who will debug this after the context window, prompt, and current reasoning are gone.

Treat repo thresholds as hard maximums, not targets:

- New or heavily changed functions should normally stay around cognitive complexity `8` or below.
- Functions between `9` and `12` need a clear reason: cohesive domain decision, already-tested algorithm, or unavoidable adapter mapping.
- Do not introduce new code above the repo hard limit of `12`.
- Use 2-4 named steps instead of one expression that requires simulating nested `Effect`, `Stream`, object spread, and callback behavior in your head.
- If a comment is needed only so the reader can parse the expression, refactor the expression first.
- When an abstraction makes code shorter but increases concept count, reject it unless it also reduces future change cost.

A good AI-generated patch should feel slightly more explicit than what the model can personally handle.

## Cognitive complexity and size limits

Use the human cognitive load budget first, then the repo's configured hard budgets. The hard budgets are:

- Oxlint `complexity`: max `12`.
- Oxlint `max-depth`: max `4`.
- Oxlint `max-params`: max `6`.
- Custom `check-code-shape`: cognitive complexity max `12` for function-like blocks.
- Custom `check-code-shape`: production file max `28` function-like blocks.
- Custom `check-code-shape`: production source directory max `12` files, except documented exceptions.
- Custom `check-source-governance`: production source file max `300` lines, test source file max `450` lines, except documented exceptions.

Do not game these metrics with tiny helper explosions. Extract by responsibility and vocabulary, not by arbitrary line count.

Important: do not aim for 12. In ordinary new code, 9-12 is already a warning zone; in Effect/AI SDK or React state/effect code, 7-12 is a warning zone because unfamiliar libraries and domain terms consume part of the reader's budget before the function logic starts.

## Effect and AI SDK readability rules

Effect and AI SDK code is allowed to be unfamiliar, so it must be extra explicit.

Flag code when:

- `Stream.unwrap(Effect.map(...))`, `Effect.gen`, `Effect.map`, `Effect.flatMap`, `Stream.catchCauseIf`, or AI SDK stream mapping is nested deeply enough that the execution order is hard to follow.
- A callback parameter contains several domain objects such as `model`, `providerOptions`, `providerRequest`, `runtimeTools`, `request`, `sequence`, and `part` but the local function name does not explain their relationship.
- A comment names `Effect`, `Stream`, `ToolLoopAgent`, `runtime`, `provider`, `adapter`, or `protocol` without saying what role it plays in this boundary.
- Typed failures, defects, provider errors, tool errors, and protocol errors are mixed without naming where conversion happens.

Use:

- named preparation step;
- named adapter invocation step;
- named boundary error-mapping step;
- helper function with a precise return type;
- short context-bridge comment when vocabulary is not self-evident.

Example transformation shape:

```ts
const streamEffect = (request: AgentRuntimeRequest): RuntimeEventStream => {
  const execution = createRuntimeExecution(state, request);
  const providerStream = Effect.map(execution, openProviderStream);

  return catchRuntimeDefects(Stream.unwrap(providerStream));
};

const openProviderStream = ({
  model,
  providerOptions,
  providerRequest,
}: RuntimeExecution): RuntimeEventStream =>
  runAiSdkToolLoopAgentStream({
    model,
    providerOptions,
    request: providerRequest,
  });
```

This shape is not mandatory. Use it when it reduces cognitive load more than it increases navigation.

## Integrated comment quality gate

Use the comment rules from the earlier `software-comment-design` skill as part of this skill. In Side Chat, comment quality is readability quality.

Every kept comment must answer at least one of these questions:

- What mental model explains this concept-dense file, and why do these concepts belong together here?
- What contract can callers rely on?
- What local role does this concept play in the Side Chat pipeline?
- Why does this boundary convert one representation into another?
- What invariant must future edits preserve?
- What information is intentionally hidden or normalized?
- What simpler-looking change would break architecture, privacy, streaming order, or typed errors?

Use the answers as drafting notes. The final code comment must read like a
human maintainer wrote it for another maintainer. Do not emit `Source:`,
`Target:`, or `Invariant:` labels as the standard form. Do not use labeled
blocks unless they are clearer than prose for a dense exported type contract.

Boundary-heavy Side Chat comments must not be cryptic one-liners. Write two to
five informative lines: local role first, then the lifecycle boundary, hidden
detail, privacy rule, failure rule, ordering rule, or non-guarantee that future
edits must preserve.

A comment fails when it:

- repeats code, type names, or function names;
- uses vague words such as handle, process, convert, map, stable, typed, private, runtime, provider, protocol, or adapter without local explanation;
- assumes the reader already knows the whole architecture;
- confidently states rationale not proven by code, tests, or docs;
- explains a private implementation detail while omitting caller-visible contract;
- compensates for code that needs to be renamed or split.

Use this comment pattern for boundary-heavy code:

```ts
/**
 * <One-sentence local role in the pipeline.>
 *
 * At this boundary, <source representation> becomes <target representation>.
 * <What is preserved, hidden, normalized, or intentionally not guaranteed.>
 */
```

Use this pattern as prose. Do not turn it into a worksheet:

```ts
/**
 * Source: <source representation>.
 * Target: <target representation>.
 * Invariant: <rule>.
 */
```

Do not use that labeled form unless the surrounding file already uses compact
contract labels and the labels are easier to scan than a sentence.

## Good AI Comment Examples

Use these as examples for AI-generated comments in Side Chat. They are concrete,
short, and readable without the implementation plan.

Spine function:

```ts
/**
 * Prepare the runtime-side inputs needed before model streaming starts.
 *
 * Profile defaults, executor choice, provider/model selection, tool exposure,
 * and final messages are resolved here. The provider stream is not opened until
 * this returns, so selection failures stay pre-stream and never look like a
 * partial model response.
 */
export const prepareRuntimeTurn = (
  state: RuntimeState,
  request: AgentRuntimeRequest,
): PreparedRuntimeTurn => {
  // Pick the instructions and usual defaults before applying request choices.
  const profile = resolveProfile(state.profiles, request.profileId);

  // Choose the execution engine before any provider stream can open.
  const executor = resolveAgentExecutor(state.executors, request);

  // Make sure the selected provider/model pair is registered.
  const selection = resolveProviderSelection(request, profile, state.providers.providers);
  const provider = resolveProvider(state.providers, selection);

  // Keep only the tools selected for this turn.
  const tools = selectRuntimeTools(state.tools, profile, request);

  // Build the final model messages after instructions, context, and tools are fixed.
  const messages = renderRuntimeMessages(profile, request);

  return {
    executor,
    provider,
    selection,
    providerRequest: createProviderRequest(request, selection, tools, messages),
  };
};
```

History/context privacy:

```ts
/**
 * Select prior conversation messages for the next assistant turn.
 *
 * The input is already authorized and model-safe; this function only decides
 * which messages are admitted under the configured history policy. Disabled
 * modes return no messages, admitted messages keep repository order, and the
 * manifest records ids, order, token estimates, and drop reasons without
 * copying message text.
 */
```

AI SDK boundary:

```ts
/**
 * Convert AI SDK `tool-error` stream parts into Side Chat's tool activity row.
 *
 * AI SDK parts may contain provider or tool exceptions. Those raw values stay
 * inside `agent-runtime`; downstream packages receive only a failed activity,
 * the stable `TOOL_FAILED` code, and safe metadata they can render or persist.
 */
```

Health/diagnostics privacy:

```ts
/**
 * Report whether configured capabilities are safe for this service profile.
 *
 * Health output may expose capability names, ids, counts, and adapter status.
 * It must not expose credentials, provider options, memory records, retrieved
 * content, or raw tool/provider errors.
 */
```

File-level orientation for concept-dense files:

```ts
/**
 * A core assistant turn sees the host app through this capability menu.
 *
 * Each service names one job the host can perform for the workflow: persist
 * conversation and assistant-turn state, publish host capabilities, resolve
 * policy and guards, prepare context and memory, run the model-side runtime,
 * mint ids and timestamps, enforce request policy, and emit observability.
 * The Effect Layer binds these jobs to real app adapters at composition time, so
 * partner-ai-core can coordinate the turn without importing HTTP, database,
 * provider, or tool-adapter packages.
 *
 * Update this comment when the core workflow gains or loses an app-supplied
 * capability, or when a capability's job moves across package boundaries.
 */
```

Runtime turn file-level orientation:

```ts
/**
 * Resolves one prepared runtime turn before any provider stream starts.
 *
 * The helpers in this file turn app-registered executors, profiles, providers,
 * and tools into the checked `RuntimeProviderRequest` passed to an executor.
 * Product policy and context admission are already resolved by partner-ai-core;
 * this file validates runtime availability and builds the provider-facing
 * request without calling the model.
 *
 * Update this comment when runtime preparation gains a new decision point or
 * when ownership moves between product core and agent-runtime.
 */
```

## Mandatory comment coverage gate

Run this as a separate pass before finalizing non-trivial code. Do it even when the implementation already has good names and small functions.

Missing-comment findings are `comment-quality` findings. Treat them as blockers when the code is complex enough that a lower-context maintainer would otherwise need the implementation plan, the chat thread, or several architecture docs to safely edit it.

File-level orientation comments are required for concept-dense files. They must
state the file's non-obvious role, which main concepts belong together here, why
they share this file, what boundary or lifecycle responsibility stays outside the
file, and what kind of future change requires updating the comment. Do not add
file-level boilerplate to simple leaf files, barrel exports, tiny helpers, or
files whose name plus one export already explains the whole file.
When a file contains many same-shaped declarations, group them by workflow job
or product role so the reader can answer "what are these things doing here?"

These comments are the local bridge for maintainers who land in core files from
search, a stack trace, or code review without opening the architecture docs.
Files such as runtime turn preparation, Effect service tags, protocol event
mappers, context managers, and service composition roots must make their main
idea visible at the top of the file.

Required coverage triggers:

- Concept-dense files need one file-level orientation comment before the first exported concept. This is mandatory for Effect service/tag files, runtime/request contract files, protocol mapper files, adapter composition roots, capability contract files, context manager files, and files that define several related exported concepts.
- Exported complex types, option objects, config objects, status objects, manifest shapes, protocol shapes, and context-board shapes need contract comments. Cover the local role, source, target, invariant, and important non-guarantees in prose. Use labeled blocks only when a dense exported type contract is genuinely easier to scan that way. Document fields when the name does not reveal units, lifecycle, privacy, or failure semantics.
- Spine functions that coordinate several lifecycle steps need a top-level contract and step comments. Each step comment must say what the step proves, records, publishes, selects, hides, prepares, or fails before the next step can run.
- Boundary mappers and adapter selectors need source representation, target contract, hidden detail, and invariant comments. Examples include env-to-config, config-to-manifest, manifest-to-status, provider-to-runtime, runtime-to-protocol, DB-to-domain, and context-candidate-to-context-board conversions.
- Diagnostics and health/status surfaces need comments that name what may be exposed and what must stay hidden, especially credentials, provider options, memory records, retrieved content, and raw tool/provider errors.
- Config parsers need comments separating declaration validation from concrete resource selection. For example, env parsing may declare intent, but composition chooses ports and enforces concrete adapter requirements.

Human-readable means concrete. Reject comments that say only "control plane", "adapter boundary", "runtime contract", "typed config", or "validates intent" unless the same comment names the source entity, target entity, invariant, and what does not happen at that boundary. Also reject comments that are only a labeled checklist when a short paragraph would be easier to read.

Use this checklist on the changed files:

1. Concept-dense files have a current file-level orientation comment.
2. New or changed exported types have comments when they carry domain meaning beyond plain data.
3. New or changed fields have comments when names do not expose units, privacy, lifecycle, or failure behavior.
4. New or changed spine functions have top-level and stage comments.
5. New or changed boundary mappers explain source, target, hidden detail, and invariant.
6. Comments can be understood without reading the implementation plan or the current chat.
7. No comment exists only to explain avoidable complexity that should be named or extracted instead.

## Domain-term traceability rule

When code introduces or transforms a Side Chat entity, the reader should be able to trace it through names, types, or a nearby comment.

High-risk terms include:

- runtime, provider, adapter, protocol, activity, context board, manifest, profile, tool, host command, turn, sequence, source, reasoning, event;
- AI SDK terms: ToolLoopAgent, TextStreamPart, tool-call, tool-result, tool-error, provider options;
- Effect terms: Effect, Stream, fail, defect, Cause, Layer, service, typed error channel.

For each high-risk term in a changed area, check:

1. Where does it enter this file?
2. What local representation does it become?
3. What package boundary may it cross?
4. What must not leak past that boundary?
5. Is this explained by names/types already? If not, add a context bridge comment or rename/extract.

## Documentation quality gate

Durable documentation must reduce context load instead of becoming another architecture dump.

Use the canonical docs:

- `docs/domain/vocabulary.md` owns terms.
- `docs/architecture/assistant-turn.md` owns lifecycle order.
- `docs/architecture/system-map.md` owns package roles and first files.
- `docs/architecture/package-boundaries.md` owns import/data boundaries.
- `docs/operations/verification.md` owns gate commands.

Flag docs when:

- package READMEs define global vocabulary instead of linking vocabulary;
- old target/current/implementation-plan docs remain linked as truth;
- paragraphs read like AI essays instead of scannable reference notes;
- docs claim production operation that does not exist;
- comments or docs use architecture terms without source, target, hidden detail, or invariant;
- `packages/side-chat-widget/src/shared/ai/**` is treated as project-owned style instead of copied/vendor-style UI.

When replacing docs, delete stale sources of truth in the same patch or move them to an explicit temporary planning area.

## TypeScript type conventions

Match the repository's existing type style. Two rules are part of this gate.

1. Model closed sets of string values as a frozen object plus a derived type, not as a bare string-literal union. The repo convention is `const X = { ... } as const` with `type X = (typeof X)[keyof typeof X]`, as in `RUNTIME_EVENT_TYPES`, `CONTEXT_REDACTION_CLASSES`, and `HOST_CAPABILITY_SCHEMA_VERSIONS`. Do not introduce new `export type Foo = "a" | "b" | "c"` enum-like unions; they give callers no runtime values to iterate, compare, or build sets from, and they drift from the const the values really live in.

2. Do not redefine a type that already exists. Before writing a new option, config, status, or policy shape, look for a canonical type in the owning package and reuse it. Reuse `ModelPolicy`, `SafetyPolicy`, `ToolExposurePolicy`, `OutputContract`, `ToolPolicyMode`, and the capability ids from `partner-ai-core`; reuse provider reasoning types from `agent-runtime`. A parallel shape that only renames or loosens an existing one is a `coupling-boundary`/`type-safety-risk` finding: it forces double maintenance and lets the copy drift from the source of truth.

Define a genuinely new value set as a frozen object once, in the package that owns the concept, and import it elsewhere. Inline string-literal unions on a single object field are tolerated only when no named type exists and the set is local and unlikely to be reused.

## Side Chat package boundary rules to preserve

Use the repo docs and custom lints as authority:

- `partner-ai-core` owns what the model sees, policy, context, turn lifecycle, and typed product workflows.
- `agent-runtime` executes one prepared assistant turn, owns AI SDK adapter code, runtime tool protocol, provider/model execution, and normalized runtime events.
- `chat-protocol` owns `sidechat.v1` DTOs, validators, schemas, SSE codec, and protocol constants.
- `chat-client`, `host-bridge`, and `side-chat-widget` stay browser/client friendly and must not expose Effect, provider DTOs, DB rows, Hono objects, or AI SDK UI messages.
- `db` owns Drizzle/Postgres details and repository adapters.
- `apps/partner-ai-service` owns HTTP, config, composition, app adapters, and transport conversion.

Do not move details across these boundaries to make a local function shorter.

## Review mode output

When reviewing without editing, output actionable findings only:

```md
## Summary
<Scope inspected, checks inspected/run, dominant readability or quality risk.>

## Findings
| Severity | Category | Evidence | Why it matters | Suggested fix | Confidence |
|---|---|---|---|---|---|
| high | readability-context-gap | `packages/...:symbol` | Comment/code assumes runtime/provider vocabulary that is not locally introduced. | Rename/extract/add context bridge. | high |

## Verification
- Ran: `<commands>`
- Not run: `<reason>`

## Uncertainty
<Missing deps, unavailable runtime, files not inspected, or architecture assumptions.>
```

Allowed categories:

- `correctness-risk`
- `type-safety-risk`
- `complexity-hotspot`
- `readability-context-gap`
- `cleverness-debt`
- `oversized-code`
- `comment-quality`
- `coupling-boundary`
- `ui-state-effect`
- `async-effect-resource`
- `testability-gap`
- `repo-gate-mismatch`

## Edit mode output

When editing files:

1. State the intended safe transformation before broad edits.
2. Make the smallest coherent diff.
3. Keep behavior and public exports stable unless asked otherwise.
4. Use names/extraction before explanatory comments.
5. Run the mandatory comment coverage gate on changed exported types, spine functions, boundary mappers, config parsers, adapter selectors, and diagnostics.
6. Add comments only for local context bridges, contracts, invariants, non-guarantees, or boundary rationale.
7. Run the narrowest relevant checks possible.
8. Final response: changed files, what readability/quality issue was fixed, comments added/deleted, docs updated/deleted, vocabulary terms changed, verification, and remaining risk.

For worker-style phase reports, include:

```txt
changed files:
docs updated or deleted:
terms added/renamed/deleted:
comments added or deleted:
copied/vendor files intentionally excluded:
verification run:
remaining dense files or risks:
```

## Large-repo audit workflow

1. Read repo context and package scripts.
2. Inspect current tool gates: `.oxlintrc.json`, `.oxfmtrc.json`, `tsconfig*.json`, `vitest.config.ts`, `playwright*.config.ts`, and `scripts/run-custom-lints.mjs`.
3. Generate a hotspot inventory by hand: use `git diff --stat`, ripgrep, and the Oxlint and `lint:custom` output to surface changed, oversized, high-complexity, or boundary-crossing files.
4. Prioritize changed files, tool failures, high-complexity functions, AI SDK/Effect-heavy files, protocol mappers, widget state/effect code, and boundary-crossing adapters.
5. Inspect top hotspots manually.
6. Separate must-fix gate failures from readability improvement opportunities.
7. Recommend a sequence: quick safe refactors, comment/context bridges, larger structural changes, and verification commands.

## When to read references

Read `references/human-cognitive-load-budget.md` before writing or refactoring complex code.

Read `references/repo-quality-gates.md` before proposing or changing quality gates.

Read `references/ai-sdk-effect-readability.md` for Effect, Stream, ToolLoopAgent, runtime-event, and adapter-boundary code.

Read `references/comment-readability-rubric.md` for comments, context bridges, and domain-term traceability.

Read `references/comment-readability-rubric.md` as mandatory when changed code adds or refactors exported types, config/status/control-plane objects, boundary mappers, adapter selectors, diagnostics, or spine functions.

Read `assets/comment-context-bridge-patterns.md` when rewriting comments around AI SDK, Effect, runtime, provider, protocol, activity, tool, or adapter code.

Read `references/eval-prompts.md` when validating skill behavior.

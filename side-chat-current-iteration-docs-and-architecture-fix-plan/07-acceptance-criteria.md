# Current Iteration Acceptance Criteria

## 1. Overall acceptance

This iteration is complete only when documentation compression and architecture rewrite completion are both done.

It is not enough that:

```txt
- tests pass
- lints pass
- docs exist
- extension ports exist
```

The result must be readable, cohesive, and adoptable.

## 2. Documentation acceptance

```txt
[ ] docs/architecture is reduced to a small canonical set.
[ ] foundation/system/package docs are merged into one system map.
[ ] lifecycle docs are merged into one assistant-turn doc.
[ ] capability/adoption docs are merged into one extension-seams doc.
[ ] vocabulary is a compact lookup, not an architecture essay.
[ ] requirements are consolidated and readable.
[ ] package READMEs are local orientation cards.
[ ] tiny adapter READMEs are removed or merged.
[ ] docs do not define the same concept in multiple places.
[ ] docs use final code terms after renames.
```

## 3. Naming/ownership acceptance

```txt
[ ] Product/domain code no longer uses harness as the concept/folder name.
[ ] test-harness remains the only harness meaning test/dev harness.
[ ] product capability files use capabilities/host-capabilities naming.
[ ] service manifest file names use capability manifest, not harness.
[ ] no compatibility alias files are kept for old unshipped names.
```

## 4. Boundary acceptance

```txt
[ ] agent-runtime runtime contracts do not import chat-protocol.
[ ] agent-runtime tools do not import JsonObject/ActivitySource from chat-protocol.
[ ] db does not import chat-protocol only for JSON primitives.
[ ] shared owns neutral JSON primitives.
[ ] RuntimeEvent activity types are runtime-owned or shared-neutral.
[ ] RuntimeEvent -> SidechatStreamEvent mapping is explicit in partner-ai-core protocol mapper.
[ ] chat-protocol remains browser/server sidechat.v1 contract.
```

## 5. Extension seam acceptance

```txt
[ ] RuntimeToolContext includes primitive enterprise scope.
[ ] tools do not import AuthContext or browser protocol request types.
[ ] turn guards are selected by profile/safety policy, not blindly global.
[ ] guard block/allow/failure behavior is tested.
[ ] RAG runs in context preparation and uses allowedSourceIds.
[ ] memory recall/write follows memory policy.
[ ] research agent output becomes context/artifact, not browser protocol.
[ ] executorId is selected by profile/policy and passed to runtime.
[ ] unknown executor fails before stream starts.
[ ] systemPromptId/systemInstructions resolution is explicit.
```

## 6. Core spine acceptance

```txt
[ ] prepareStreamChatTurn reads as lifecycle table of contents.
[ ] service-context-manager is split into profile/gather/select/render/manifest/runtime-message steps.
[ ] context admission is honest: real budget selection or clearly named simple admission.
[ ] protocol-terminal-lifecycle uses a small accumulator instead of requiring full emitted event array.
[ ] protocol-event-stream shows started -> runtime events -> finalization.
[ ] partner-ai-core ports are split into focused files.
```

## 7. Service/widget acceptance

```txt
[ ] service HTTP routes remain adapters, not product workflow.
[ ] concrete integrations stay under service adapters.
[ ] demo/mock tools are examples/test/dev fixtures only.
[ ] widget consumes protocol/client state only.
[ ] widget does not know runtime/provider/RAG/memory internals.
[ ] shared/ai remains copied visual primitives only.
```

## 8. Human-readability acceptance

```txt
[ ] important workflows use named lifecycle steps.
[ ] comments explain source, target, hidden detail, and invariant at dense boundaries.
[ ] no comments compensate for avoidably clever code.
[ ] no new broad abstraction reduces lines while increasing concepts.
[ ] no project-owned code copies shared/ai style.
[ ] new code remains under human cognitive-load budget.
```

## 9. Final score target

Use this final target after review:

| Area                           |     Target |
| ------------------------------ | ---------: |
| Documentation usability        | 8.5-9 / 10 |
| Architecture extension clarity | 8.5-9 / 10 |
| Boundary integrity             | 8.5-9 / 10 |
| Human code readability         | 8.5-9 / 10 |
| AI-code resistance             | 8.5-9 / 10 |

A result that improves docs but leaves architecture seams incomplete should not pass. A result that adds architecture seams but leaves docs unreadable should not pass either.

## 10. Worker-agent prompt block

```md
You are implementing the current Side Chat docs + architecture fix iteration.

Assume the previous human-readability plan is active. Do not restart it. This task completes the current architecture rewrite and compresses docs around the final shape.

Rules:

- The repo is early-stage. Rewrite to final intended shape; do not keep compatibility aliases for old internal names.
- Do not treat tests/lints passing as enough. Human readability and architecture boundary clarity are required.
- Do not add more wall-of-text documentation. Compress and delete duplicates.
- `shared/ai/**` is copied/vendor-style UI. Do not imitate it and do not add business logic there.
- `apps/partner-ai-service` is deployable service composition, not a demo app.

When changing code, report:

1. which concept/package owns the change,
2. which extension seam is affected,
3. which docs were updated or deleted,
4. which old terms/files were removed,
5. how the change improves local readability.
```

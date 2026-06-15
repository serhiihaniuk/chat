# Undefined And Optional Contracts Plan

Read this when: changing optional fields, `undefined` handling, protocol
parsing, repository adapter metadata, or helper APIs such as `optionalField`.
Source of truth for: the migration plan from omission-based optional helpers to
explicit in-memory `undefined` contracts.
Not source of truth for: canonical vocabulary, assistant turn lifecycle,
package boundaries, or final protocol schemas.

## Goal

Make explicit `undefined` safe to pass through in-memory repo surfaces without
blurring browser protocol, JSON, SSE, or database persistence semantics.

The target state is:

```txt
[ ] Internal option/input/state surfaces can accept explicit undefined.
[ ] JSON, sidechat.v1, SSE, and DB record outputs keep canonical omitted fields.
[ ] Malformed optional protocol fields are rejected instead of erased.
[ ] Repository adapter identity is an explicit contract, not a property-presence guess.
[ ] Helper names reveal whether they omit undefined, omit nullish values, or compact JSON.
[ ] Static checks prevent the unsafe patterns from returning.
```

## Current Evidence

Repo scan found:

| Pattern                                                          | Count | Main risk                                                        |
| ---------------------------------------------------------------- | ----: | ---------------------------------------------------------------- |
| `optionalField(...)`                                             |   174 | One helper means internal undefined, JSON omission, and DB null. |
| Conditional spreads like `condition ? { field } : {}`            |     2 | Hides whether the key was intentionally present.                 |
| Property checks like `"kind" in repositories && repositories...` |     1 | Infers adapter identity outside the typed contract.              |

High-risk files:

| Area             | Evidence                                                                                | Risk                                                           |
| ---------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Protocol request | `packages/chat-protocol/src/sidechat-v1/request/request.ts`                             | Invalid optional fields parse as absent.                       |
| Protocol readers | `packages/chat-protocol/src/sidechat-v1/primitives.ts`                                  | `readString` conflates missing, empty, and wrong-type values.  |
| Service compose  | `apps/partner-ai-service/src/composition/service-composition.ts`                        | Repository adapter kind falls through to memory.               |
| Shared helper    | `packages/shared/src/index.ts`                                                          | `optionalField` drops null and undefined under a generic name. |
| DB mappers       | `packages/db/src/repositories/postgres-drizzle/records/records.ts`                      | Row mapping uses omission helpers and or-undefined coercion.   |
| Runtime mapping  | `packages/agent-runtime/src/runtime/ai-sdk/streaming/reasoning-activity.ts`             | Runtime activity text uses truthy-to-undefined coercion.       |
| Core mapping     | `packages/partner-ai-core/src/application/stream-chat/protocol/runtime-event-mapper.ts` | Runtime event fields are compacted before protocol emission.   |
| Widget state     | `packages/side-chat-widget/src/entities/chat/model/activity.ts`                         | Widget already partially accepts explicit undefined.           |

Low-risk exclusions:

```txt
[ ] Fetch and RequestInit builders may omit signal for browser API interop.
[ ] React DOM prop forwarding may use undefined when the external API expects it.
[ ] JSON helpers may drop undefined because JSON cannot represent it.
[ ] Tests may use compact helper shapes when they are fixture setup only.
```

## Root Cause

The repo currently uses one shape for three different contracts:

```txt
field?: T
...optionalField("field", value)
```

That shape has been standing in for:

```txt
1. Internal input may pass explicit undefined.
2. Protocol or JSON output should omit absent fields.
3. Database null should normalize to absence in record output.
```

Those meanings are not interchangeable. `exactOptionalPropertyTypes` is already
enabled, so the compiler is correctly asking each boundary to choose.

## Contract Rule

Keep `exactOptionalPropertyTypes: true`.

Use these shapes deliberately:

| Surface                          | Optional field shape     | Reason                                                      |
| -------------------------------- | ------------------------ | ----------------------------------------------------------- |
| Internal options and inputs      | `field?: T \| undefined` | Callers may pass a computed optional value directly.        |
| Internal required decision slots | `field: T \| undefined`  | The workflow must prove presence or absence explicitly.     |
| Protocol DTOs                    | `field?: T`              | Wire output is omitted field, not explicit undefined.       |
| JSON values                      | no `undefined`           | `JsonValue` and JSON serialization cannot preserve it.      |
| DB records                       | `field?: T`              | Persisted output normalizes SQL null to omitted field.      |
| React/browser props              | package-local choice     | External APIs often use undefined to mean default behavior. |

Do not loosen every `?: T` mechanically. Only migrate a field after deciding
which row of this table owns it.

## Phase 1: Lock The Bugs With Tests

Add failing tests before broad refactors.

Protocol request tests:

```txt
[ ] `conversationId: ""` is rejected.
[ ] `conversationId: 123` is rejected.
[ ] `assistantProfileId: ""` is rejected.
[ ] `assistantProfileId: 123` is rejected.
[ ] `hostContext.origin`, `url`, and `title` reject present non-strings.
[ ] `hostContext.metadata` rejects present non-JSON-object values.
[ ] Missing optional fields still parse successfully.
```

Repository adapter tests:

```txt
[ ] Memory repositories report memory adapter metadata.
[ ] Postgres Drizzle repositories report postgres-drizzle adapter metadata.
[ ] Service composition does not classify untagged repositories as memory.
[ ] Explicit postgres persistence rejects memory repositories.
[ ] Explicit memory persistence rejects postgres-drizzle repositories.
```

Helper type tests:

```txt
[ ] Internal input types accept `{ field: undefined }` where intended.
[ ] Canonical protocol/event/record types reject explicit undefined where intended.
[ ] JSON helper tests prove undefined is omitted and null behavior is named.
```

## Phase 2: Fix Protocol Optional Readers

Create protocol readers that distinguish missing keys from invalid present keys.

Suggested helpers:

```ts
const readOptionalPresentString = (
  record: Record<string, unknown>,
  key: string,
  context: string,
): string | undefined => {
  if (!Object.hasOwn(record, key)) return undefined;
  return requireString(record, key, context);
};
```

Use this for `ChatStreamRequest` and `HostContext` optional fields. Keep
`ChatStreamRequest` as the canonical wire DTO. Do not add `undefined` to JSON
schema output.

Expected changes:

```txt
packages/chat-protocol/src/sidechat-v1/primitives.ts
packages/chat-protocol/src/sidechat-v1/request/request.ts
packages/chat-protocol/src/sidechat-v1/request/request.test.ts
packages/chat-protocol/src/generated/sidechat-v1.schema.generated.json only if schema generation changes
```

## Phase 3: Make Repository Identity Explicit

Promote adapter metadata into the DB public surface or wrap repositories at the
service boundary.

Preferred final shape:

```ts
export const REPOSITORY_ADAPTER_KINDS = {
  MEMORY: "memory",
  POSTGRES_DRIZZLE: "postgres-drizzle",
  CUSTOM: "custom",
} as const;

export type RepositoryAdapterKind =
  (typeof REPOSITORY_ADAPTER_KINDS)[keyof typeof REPOSITORY_ADAPTER_KINDS];

export type SidechatRepositories = ConversationRepositoryContract &
  AssistantTurnRepositoryContract &
  InteractionRepositoryContract & {
    readonly adapterKind: RepositoryAdapterKind;
  };
```

Then replace `"kind" in repositories` with an exhaustive adapter-kind switch.

If custom repositories should be supported, require callers to provide an
explicit `adapterKind` or service-level persistence metadata. Do not infer
memory as the fallback for unknown injected objects.

## Phase 4: Rename Or Split Shared Optional Helpers

Do not broaden `optionalField` in place. The name is too generic.

Introduce explicit helpers:

```txt
omitUndefinedField(key, value): omits only undefined, preserves null.
omitNullishField(key, value): current optionalField behavior.
compactJsonObject(value): keeps current JSON compaction role.
```

Migration rule:

```txt
[ ] Internal option forwarding should use direct properties after the type accepts undefined.
[ ] JSON/protocol/DB compaction should use an explicitly named omit helper.
[ ] `optionalField` should be deleted after call sites migrate.
```

## Phase 5: Migrate Internal In-Memory Surfaces

Start with surfaces where callers currently spread optional values only to
satisfy TypeScript.

Candidate types:

```txt
apps/partner-ai-service/src/inbound/http/app.ts: PartnerAiServiceOptions
apps/partner-ai-service/src/composition/service-composition-types.ts: ServiceCompositionOptions
apps/partner-ai-service/src/composition/service-composition-types.ts: RuntimeToolConfig
packages/agent-runtime/src/runtime/contract/runtime-request.ts: AgentRuntimeRequest
packages/agent-runtime/src/runtime/contract/runtime-request.ts: RuntimeProviderRequest
packages/agent-runtime/src/runtime/contract/runtime-activity.ts: runtime activity details
packages/partner-ai-core/src/application/stream-chat/stream-chat-types.ts: StreamChatInput
packages/partner-ai-core/src/ports/**: port input objects
packages/side-chat-widget/src/entities/chat/model/**: widget state objects
```

For these internal shapes, allow:

```ts
readonly abortSignal?: AbortSignal | undefined;
readonly observability?: ObservabilitySinkPort | undefined;
readonly runtime?: RuntimeConfig | undefined;
```

Then replace spread helpers with ordinary properties:

```ts
return {
  workspace: options.workspace ?? DEFAULT_WORKSPACE,
  auth: options.auth,
  policies: options.policies,
  runtime: options.runtime,
};
```

The receiving function must decide defaults with `??`, `=== undefined`, or a
named resolver.

## Phase 6: Keep Boundary Outputs Canonical

Do not store or emit own-properties with explicit undefined from these surfaces:

```txt
packages/chat-protocol/src/sidechat-v1/** canonical DTOs
packages/partner-ai-core/src/application/stream-chat/protocol/** protocol mappers
packages/db/src/schema-contract/entities.ts record outputs
packages/db/src/repositories/** row-to-record mappers
packages/shared/src/index.ts JsonObject helpers
```

Boundary builders may accept explicit undefined in an input type, but must
return canonical output:

```ts
type ActivityEventInput = Omit<ActivityEvent, "body"> & {
  readonly body?: string | undefined;
};

const toActivityEvent = (input: ActivityEventInput): ActivityEvent =>
  omitUndefinedProperties(input);
```

Use this pattern only where it materially improves callers. Do not add builder
types for simple object literals.

## Phase 7: Remove Truthy-To-Undefined Coercion

Audit every `|| undefined` before or inside an optional helper.

Replace by contract:

```txt
[ ] Use `value === "" ? undefined : value` only when empty string is invalid.
[ ] Use `value ?? undefined` only for null-to-undefined normalization.
[ ] Pass `value` directly when empty string, 0, or false are valid.
[ ] Reject invalid present values at protocol/config boundaries.
```

Priority files:

```txt
packages/db/src/repositories/postgres-drizzle/records/records.ts
packages/db/src/repositories/memory/records/*.ts
packages/partner-ai-core/src/application/stream-chat/protocol/runtime-event-mapper.ts
packages/agent-runtime/src/runtime/ai-sdk/streaming/reasoning-activity.ts
packages/side-chat-widget/src/entities/chat/model/activity.ts
packages/host-bridge/src/context/host-context.ts
apps/partner-ai-service/src/config/service-config.ts
```

## Phase 8: Add Governance

After the migration, add a custom lint or focused governance check.

The check should flag:

```txt
[ ] `optionalField(` outside an allowlist while it is being removed.
[ ] `|| undefined` in production TypeScript.
[ ] Conditional spreads of `? { field } : {}` in boundary mappers.
[ ] `"kind" in object && object.kind === ...` for adapter discrimination.
```

Allowlist only:

```txt
JSON compaction helpers
Protocol canonical builders
DB row-to-record mappers
Browser/React interop files with documented reason
Tests that intentionally assert compaction behavior
```

## Verification

Use the pinned runtime because the repo requires Node `24.16.0` and npm
`11.15.0`.

Targeted checks:

```sh
npx -p node@24.16.0 -p npm@11.15.0 npm test -- --run packages/chat-protocol/src/sidechat-v1/request/request.test.ts
npx -p node@24.16.0 -p npm@11.15.0 npm test -- --run packages/shared/src/index.test.ts
npx -p node@24.16.0 -p npm@11.15.0 npm test -- --run apps/partner-ai-service/src/composition/service-composition.test.ts
npx -p node@24.16.0 -p npm@11.15.0 npm test -- --run packages/db/src/repositories/memory/index.test.ts
```

Repo gates:

```sh
npx -p node@24.16.0 -p npm@11.15.0 npm run lint:oxlint
npx -p node@24.16.0 -p npm@11.15.0 npm run typecheck
npx -p node@24.16.0 -p npm@11.15.0 npm test
npx -p node@24.16.0 -p npm@11.15.0 npm run lint:custom
npx -p node@24.16.0 -p npm@11.15.0 npm run verify
```

Use DB container verification when repository contract or Postgres adapters
change:

```sh
npx -p node@24.16.0 -p npm@11.15.0 npm run test:db:container
```

## Exit Criteria

```txt
[ ] Optional protocol fields reject invalid present values.
[ ] Internal option bags can pass explicit undefined without spread helpers.
[ ] Canonical protocol events do not expose explicit undefined own-properties.
[ ] Repository adapter kind is typed and exhaustively checked.
[ ] DB records normalize SQL null to omitted output consistently.
[ ] `optionalField` is gone or reduced to a clearly named compatibility alias.
[ ] `|| undefined` remains only where a test or comment proves empty values are invalid.
[ ] Custom governance prevents the unsafe patterns from regrowing.
[ ] Docs explain the internal-vs-boundary distinction.
[ ] Full verification passes under pinned Node and npm.
```

## Non-Goals

```txt
[ ] Do not disable `exactOptionalPropertyTypes`.
[ ] Do not add `undefined` to `JsonValue`.
[ ] Do not change `sidechat.v1` JSON schema to represent undefined.
[ ] Do not preserve compatibility aliases for unshipped internal helper names.
[ ] Do not let repository identity be inferred from optional property presence.
```

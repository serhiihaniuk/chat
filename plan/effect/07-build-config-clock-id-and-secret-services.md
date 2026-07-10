# Step 07: Build Configuration, Clock, ID, and Secret Services

Read this when: moving boot configuration into validated services or replacing manual time/ID dependencies.

Source of truth for: the configuration resolution pipeline, secret handling, built-in Clock use, and deterministic ID service.

Not source of truth for: user-facing configuration vocabulary; preserve the readable TypeScript configuration surface and canonical operations docs.

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 06

Unblocks: Steps 08-16

## Outcome

The service selects one human-readable TypeScript configuration, resolves environment references once, protects secrets with `Redacted`, validates a complete immutable boot model with accumulated issues, and provides typed settings through a Layer. Core/server time uses Effect Clock. Domain IDs come from an explicit replaceable service.

## Configuration target

Preserve `apps/partner-ai-service/sidechat.config.ts` and its fake/Azure variants as the readable source for behavior, providers, models, tools, capabilities, prompts, history, and resumability.

The boot pipeline is:

1. select the config module;
2. resolve environment references through the service environment contract;
3. convert secret values to `Redacted` before they enter provider/service configuration;
4. validate the resolved model with Schema, including cross-field constraints;
5. accumulate all safe issues instead of failing one field at a time;
6. provide immutable `ServiceSettings` and narrower derived settings services where a subsystem should not see the entire boot model.

Do not reproduce the full TypeScript configuration in Effect `Config`. Use Effect Config for environment/default-provider mechanics only where it removes custom parsing. Schema owns the resolved runtime contract.

## Time and ID target

- Delete `ClockPort` and `systemClock` after all callers use Effect Clock operations.
- Use `TestClock` in tests; no custom fake wall clock remains.
- Keep an `IdGenerator` service with operations named for domain IDs or a generic secure/random ID operation only if domain constructors remain elsewhere.
- Live IDs use the existing secure generation policy. Test IDs use deterministic finite sequences and fail clearly on exhaustion.
- Do not use current time as an ID fallback.

## Implementation sequence

1. Inventory current config selection, environment resolution, validation, provider options, and direct `process.env` reads. Confirm only the service config adapter reads process environment.
2. Define the resolved `ServiceSettings` schema and error report. Separate secret values from safe diagnostic fields. Preserve existing human-readable property names unless a verified ambiguity justifies a config migration.
3. Implement the configuration Layer. It must fail startup with `ServiceConfigError` containing all safe issues and no secret values.
4. Derive focused settings services for persistence, runtime/providers, background schedules, capacity, and observability if providing the full settings object would broaden dependency access.
5. Convert provider construction and service composition to consume redacted values. Unwrap secrets only at the provider/database client constructor edge.
6. Replace `ClockPort` reads in core and service Effect code with built-in Clock/time operations. Convert matching tests to TestClock.
7. Define and provide the ID generator service. Migrate core event/turn/command ID creation without coupling it to configuration.
8. Make the resolved-settings schema extensible and validate invariants whose semantics already exist: provider/model references, current title/history/lease settings, positive current timeouts, and persistence-mode requirements. Steps 10-12 add and validate host, retry, and capacity settings when those policies become final; do not invent them early.
9. Update configuration docs and sample files if the resolved contract changes. Do not expose actual environment values.
10. Delete obsolete environment parsers, clock factories, duplicate defaults, and test fakes.

## Current anchors

- `apps/partner-ai-service/src/config/sidechat-config/**`
- `apps/partner-ai-service/src/config/env/service-env-contract.ts`
- `apps/partner-ai-service/src/config/service-config-error.ts`
- `apps/partner-ai-service/sidechat.config.ts`
- `apps/partner-ai-service/sidechat.fake.config.ts`
- `apps/partner-ai-service/sidechat.azure.config.ts`
- `apps/partner-ai-service/src/composition/ports/create-stream-chat-ports.ts`
- current `ClockPort` and `IdGeneratorPort` definitions/callers
- `docs/operations/configuration.md`

## Contract tests

- valid config yields the expected immutable resolved settings;
- multiple invalid fields produce one accumulated safe issue report;
- secret sentinels never appear in error messages, snapshots, logs, or inspection output;
- config selection cannot fall back silently to an unintended production posture;
- provider/model/tool references are validated before any resource acquisition;
- zero/negative/inconsistent settings owned by this step fail boot; later policy steps add their own validation contracts;
- TestClock controls all converted time behavior;
- deterministic ID sequences are isolated per test runtime and fail on exhaustion.

## Verification

```powershell
rg -n 'process\.env|ClockPort|systemClock|Date\.now|setTimeout|crypto\.randomUUID' apps/partner-ai-service packages/partner-ai-core
npm test -- apps/partner-ai-service/src/config
npm test -- packages/partner-ai-core
npm run typecheck
npm run lint:custom
```

Review each remaining raw time/random/environment occurrence. Boundary-specific uses may remain only with documented ownership.

## Completion checklist

- [ ] One resolved, Schema-validated settings Layer exists.
- [ ] Boot validation accumulates safe issues and preserves secret redaction.
- [ ] Direct environment access remains confined to the service config adapter.
- [ ] Subsystems depend on appropriately narrow settings.
- [ ] Effect Clock replaces `ClockPort`; tests use TestClock.
- [ ] A deterministic replaceable ID service replaces manual ID threading.
- [ ] Obsolete parsers/defaults/clock and ID fakes are deleted.
- [ ] Configuration, core, type, and governance tests pass.
- [ ] Canonical configuration docs are updated for any changed contract.
- [ ] `STATUS.md` records remaining boundary exceptions.

## Handoff record

Settings/service entry points: pending

Validated cross-field rules: pending

Remaining raw environment/time/random exceptions: pending

Verification: pending

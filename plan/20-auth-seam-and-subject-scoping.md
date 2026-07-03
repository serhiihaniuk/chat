# 20 — Injectable auth seam + subject scoping

**Epic:** 4 Seams | **Priority:** P0 (first thing every adopting team touches) | **Depends on:** — | **Status:** done

## Problem

1. **Auth is not injectable.** `ServiceAuthVerifier` (`apps/partner-ai-service/src/adapters/auth/service-auth.ts:37-39`) is the right interface, but `createPartnerAiService` accepts only `ServiceAuthConfig` — a union of two static-token configs — and constructs the verifier itself (`app.ts:95`). The "production" adapter maps **every** caller of one shared bearer token to a single synthetic subject `${workspaceId}:subject` with fixed roles (`service-auth.ts:93-112`) — all real users share one conversation list and one activity stream until the adopter edits `app.ts`.
2. **`docs/architecture/extension-seams.md` has no auth row at all** (seam table ~:22-31).
3. **Within-workspace IDOR once real auth exists:** turn stream/status/cancel lookups are workspace-scoped but not subject-scoped (`chat-turns.ts:234-242`; `FindAssistantTurnCommand`/`RequestTurnCancellationCommand` carry no `subjectId` — `packages/db/src/schema-contract/repositories.ts:91-93,168-171`) while conversation history IS subject-scoped (`chat-history.ts:19,44,73`). Subject B with a leaked turn id can tail and cancel subject A's turns.
4. Token comparison is not timing-safe, and directly-passed option tokens skip the `Bearer `-prefix normalization the config path applies.

## Decided approach

1. Accept `authVerifier?: ServiceAuthVerifier` in `PartnerAiServiceOptions`; when present it wins; the static-token adapters remain the dev/default implementations. The verifier contract: `(request headers) → AuthContext | typed failure` — document that `AuthContext.subjectId` is the per-user identity everything scopes by.
2. Subject-scope the turn surface: add `subjectId` to the turn lookup/cancel commands in db (both adapters + contract tests), thread from routes' `AuthContext`. A turn belongs to the subject that started it; stream/status/cancel/host-command-result all check it. (Coordinate with story 08's `(turn, command)` binding.)
3. Timing-safe token equality (`crypto.timingSafeEqual` over digests) + normalize `Bearer ` for option-passed tokens (single normalizer — the duplicate goes away with story 12).
4. Write the missing extension-seams.md **Auth** section: a worked "plug in your JWT/session verifier" example (verify → AuthContext), what subjectId scopes, and the dev static-token posture.
5. Adoption-harness: add a two-subject test proving isolation (B cannot read/cancel A's turn or see A's conversations/activity).

## Acceptance criteria

- [x] An embedder can pass a custom verifier via options with zero edits to `app.ts` (adoption-harness test with a fake subject verifier; no `auth` config supplied).
- [x] Subject B: not-found on subject A's turn status/stream/host-command result, no-op cancel, and A's conversation absent from B's list (adoption-harness route test + db contract test for the scoped commands).
- [x] Static-token comparisons are timing-safe.
- [x] extension-seams.md documents the auth seam with a runnable example.

## Delivery notes (2026-07-03)

- **Injectable verifier.** `PartnerAiServiceOptions.authVerifier?: ServiceAuthVerifier` — when present it fully replaces the static-token adapter (`app.ts:95` now `options.authVerifier ?? createServiceAuthVerifier(...)`). The auth types (`ServiceAuthVerifier`, `ServiceAuthInput`, `ServiceAuthConfig`, `HostProvidedContext`) are re-exported from the package index so an adopter can implement one. `AuthContext.subject.subjectId` is documented as the identity everything scopes by.
- **Subject-scoped turn surface.** Added `subjectId` to `FindAssistantTurnCommand` + `RequestTurnCancellationCommand` (contract + both adapters' predicates). Threaded `authContext.subject.subjectId` through the turn status/stream route (`loadWorkspaceTurn`), cancel route, host-command-result route, and the finalize `readTurnControlState`. A leaked turn id from another user in the same workspace now resolves to not-found on reads and a no-op cancel — the within-workspace IDOR is closed. (Conversation history was already subject-scoped.)
- **Timing-safe + single normalizer.** Token equality is now `timingSafeEqual` over SHA-256 digests (constant time, and unequal-length tokens no longer throw/leak length). `normalizeBearerToken` moved to `service-auth.ts` as the SINGLE normalizer applied at comparison time, covering both the config path AND directly-passed option tokens; the duplicate in `environment.ts` was removed. A `none`-prefix dev-default token is still rejected under the production profile.
- **Docs.** extension-seams.md gained a "Plug in auth" seam row and a worked "Plug in your auth verifier" section (JWT example → AuthContext; what subjectId scopes; constant-time posture). The stale "bring-your-own auth not injectable yet (plan/20)" note is corrected.
- **Tests.** New adoption-harness `adoption-auth-scoping.test.ts` (custom verifier authenticates with no static config; unknown token → 401; subject B → 404 on status/stream/host-command, no-op cancel, A's conversation not in B's list). New `service-auth.test.ts` (normalization, correct/wrong token, unequal-length no-throw, dev-default-in-production guard, subject flow). Db contract test gained cross-subject isolation assertions for `findAssistantTurn` + `requestTurnCancellation`.
- Verification: db + service + adoption suites green (232 tests), `npm run verify` clean, e2e 13/13. `test:db:container` deferred — Docker unavailable; the postgres subject-scoping runs through the same shared contract test (memory adapter verified now; standing chip covers the container run).

## Verification

```sh
npm test --workspace @side-chat/partner-ai-service
npm test --workspace @side-chat/db
npm run test:db:container
npm run verify
```

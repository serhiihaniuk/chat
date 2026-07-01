# 20 — Injectable auth seam + subject scoping

**Epic:** 4 Seams | **Priority:** P0 (first thing every adopting team touches) | **Depends on:** — | **Status:** todo

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

- [ ] An embedder can pass a custom verifier via options with zero edits to `app.ts` (test with a fake JWT verifier in the adoption harness).
- [ ] Subject B: 404/403 on subject A's turn stream, status, cancel, host-command result (route tests + contract tests for the scoped commands).
- [ ] Static-token comparisons are timing-safe.
- [ ] extension-seams.md documents the auth seam with a runnable example.

## Verification

```sh
npm test --workspace @side-chat/partner-ai-service
npm test --workspace @side-chat/db
npm run test:db:container
npm run verify
```

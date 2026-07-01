# 01 — ADR: connection-bound streaming + docs greenfield pass

**Epic:** 1 Streaming | **Priority:** P0 | **Depends on:** — | **Status:** done (2026-07-02)

## What was delivered

Executed as a full docs greenfield cleanup, going beyond the original ADR-only
scope (owner request, 2026-07-02):

- **ADR set rebaselined and renumbered in reading order** (final index:
  `docs/adr/README.md`, eleven records as of 2026-07-02). The nine stale ADRs
  were deleted (git history keeps them) and replaced; the decision record this
  story asked for is **0007-connection-bound-streaming** (stream-from-POST,
  fail-fast non-owner resume, poll-until-terminal fallback, orphan sweep, no
  sticky routing). Stories 02/04/07 reference it.
- **Architecture docs rewritten to current code:** `assistant-turn.md` (in-memory
  registry model, honest known-gap callouts pointing at plan stories),
  `runtime-and-protocol-events.md` (host_command is a runtime activity kind;
  `sidechat.history` marked never-emitted; registry transport),
  `system-map.md` (streaming section + package map + invariants),
  `extension-seams.md` (host-command seam is model-callable; tool-config and
  auth gaps flagged), `host-commands.md` (trigger section rewritten — model
  emission works; result route documented), `widget-and-host-integration.md`.
- **Vocabulary updated:** reaper/pruner/durable-log terms removed;
  turn-event registry + connection-bound streaming added; weak-brand and
  history-event rows corrected.
- **Operations/product docs:** configuration.md (dead resumability knobs
  flagged), local-development.md (broken fake quick start flagged → plan/11),
  todo.md (gaps now point at plan/).
- **Package cards:** `packages/db/README.md` rewritten (no turn_events);
  service `composition/README.md` composition shape corrected.
- **Root README:** streaming claims and the shadow-DOM claim corrected; broken
  quick start flagged.

## Left for other stories

Code-side cleanups stay where they were planned: dead config-knob deletion and
stale code-comment purge (story 10), the fake config itself (story 11), and
post-implementation doc deltas once stories 02–09 change behavior (story 10).

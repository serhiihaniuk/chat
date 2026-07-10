# ADR 0012: Widget Architecture — Iframe-Isolated, Effect-Free, Split Data Paths

Status: accepted 2026-07-02 (records decisions locked 2026-06-17 through 2026-07-01)

## Context

The widget is the half of the product every adopter's users actually touch,
and the half their frontend team will modify most. It must survive hostile
host pages (arbitrary CSS, CSP, frameworks), stay modifiable by ordinary React
developers, and render a hard domain — streaming, reasoning folds, tool cards,
terminal states — without importing the server's complexity. These decisions
were locked during the ground-up redesign; this record exists so a future
cleanup pass cannot unknowingly reverse them.

## What it buys here

| Capability                                 | How                                                                                                                                                                                                                                                               | Without it                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Real style isolation, both directions.** | The widget ships in an **iframe**; the host proxies `/side-chat-frame` + `/side-chat-api` and embeds it. Tokens, Tailwind preflight, fonts, and portals stay inside the frame.                                                                                    | The stylesheet is page-global when direct-mounted (preflight + `[data-slot]` selectors restyle a shadcn host) — the review measured exactly this. |
| **A widget ordinary React devs can own.**  | Gate-enforced: no Effect, no provider SDKs, no service internals — only `chat-protocol`, `host-bridge`, `shared`, React, TanStack Query.                                                                                                                          | The server's double learning curve leaking into the one layer adopters must touch.                                                                |
| **Navigable structure under churn.**       | Feature-Sliced Design with lint-enforced ranks (`widgets > features > entities > shared`), no cross-slice imports, a locked public entry that exports only the widget API.                                                                                        | 150 files of React with every import reaching everything.                                                                                         |
| **The right tool per data shape.**         | **Reads** (conversation list, history, model catalog) ride TanStack Query; the **live turn** rides SSE reader → module-level run store → pure reducer (`useSyncExternalStore`).                                                                                   | A cache library contorted around an ordered event stream, or hand-rolled fetching for plain reads.                                                |
| **Replay-safe live state.**                | The reducer is pure and idempotent by sequence; there is deliberately **no client-side merge** of live and history — a terminal run refetches committed history, then clears the live run.                                                                        | Snapshot-merge heuristics: the classic source of duplicated and reordered messages.                                                               |
| **Themable without a fork.**               | Tiered tokens on the widget root; four light themes via `data-sidechat-theme`; radius/typeface/density/elevation as one-token overrides; compound kit exported beside the batteries-included default. **No dark mode by policy** — themes are the variation axis. | Hardcoded values and a half-maintained dark variant nobody designed.                                                                              |

## Decision

The widget (`packages/side-chat-widget`) is iframe-embedded, Effect-free and
provider-free by gate, FSD-structured with a locked entry, split between
TanStack Query reads and the store/reducer live path, merge-free by design,
and themed through scoped tokens with light themes only. Host integration
(context in, host commands out) crosses the frame via the postMessage bridge
pattern ([host-commands.md](../architecture/host-commands.md) "Embedding via
iframe"); the bridge contract itself stays transport-agnostic.

## Alternatives rejected

- **Shadow DOM isolation** — one-directional (protects the host from the
  widget, not the widget from inherited CSS custom properties and CSP), and
  portal/font handling inside shadow roots is quirky; it survives only in the
  docs app's preview harness. Direct React mount remains possible for hosts
  that accept the stylesheet contract, but the iframe is the supported
  default.
- **TanStack Query for the live stream** — a cache is the wrong shape for an
  ordered, replayable event stream; the reducer owns ordering, dedupe, and
  terminal semantics explicitly.
- **Client-side live/history merge** — snapshot merging is where chat UIs rot;
  the ordered-log + handoff model keeps one source of truth per phase.
- **Dark mode** — a second, permanently under-designed variant; rejected in
  favor of a real multi-theme system (revisit as a _theme_, not a mode).

## Consequences

Hosts embed via proxy + iframe (documented recipe) rather than `npm install
and render` — the deliberate price of isolation; direct mount exists but the
host owns the style risk. The FSD gates occasionally force an import through a
barrel a newcomer would have reached around. The no-merge model makes the
run→history handoff load-bearing: terminal events trigger a committed-history
refetch before the live run is cleared. Review rule: reintroducing
Effect into the widget, a live-path Query cache, `:root`-global tokens, or a
`dark:` variant should be rejected and pointed here.

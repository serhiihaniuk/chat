# ADR 0001: No Owned Host App

Status: accepted (rebaselined 2026-07-01, expanded 2026-07-02)

## Context

Side Chat is embedded into a partner's web app. The tempting move for any
embeddable product is to ship a first-party host app "for demos" — and every
team that does learns the same lesson: the pet app accretes host-specific
hacks, skews the framework's design toward its own needs, and gets copied to
production by adopters as if it were guidance.

## What it buys here

| Capability | In this repo | Without it |
|---|---|---|
| **A clear product boundary.** | Side Chat owns widget, protocol, service, runtime, persistence; partners own host surfaces, auth, data, workflows. The only "host" in the repo is a contract plus fixtures. | The framework grows a favorite child; APIs bend toward the demo instead of the adopter. |
| **Executable, honest examples.** | The widget harness is explicitly a fixture: demo host panel, fake bridge, and `workbench-embed.html` — a complete, origin-checked postMessage embedding that doubles as adopter documentation. | Demo-app code cargo-culted into production; example and product indistinguishable. |
| **Fail-closed demo capabilities.** | Mock/local capabilities (fake provider, mock tools, seeded chats) fail outside explicit local profiles. | Demo backdoors riding into production configs. |

## Decision

The repository ships **no production host app**. Host behavior is represented
by the `packages/host-bridge` contract and the `test-harness/widget-harness`
fixtures, which are the worked embedding examples. Anything demo-shaped is
profile-gated and fails closed in production.

## Alternatives rejected

- **Ship a demo host app** — becomes the de facto product and the de facto
  (wrong) production guidance; see Context.
- **Docs-only, no runnable host** — adopters need something executable to
  learn the embed and host-command round trip from; the harness fills that
  role without pretending to be a product.

## Consequences

Anyone evaluating Side Chat runs the harness, not a polished demo — a slightly
harder first impression, deliberately traded for a boundary that stays true.
The obligation this creates: every embedding pattern must exist as a runnable
recipe (the iframe guide, the host-command walkthrough), because there is no
app to point at instead.

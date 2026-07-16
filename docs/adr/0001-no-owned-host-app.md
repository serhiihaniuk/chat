# ADR 0001: Ship No Production Host App

Status: accepted 2026-07-01; rebaselined 2026-07-16

## Context

Side Chat is embedded into a partner's web application. A first-party demo host
would accumulate host-specific behavior, skew public contracts toward one
example, and risk being copied into production as if it were supported product
code.

Adopters still need executable integration examples. A harness can demonstrate
the boundary without becoming an owned host product.

## Decision

The repository ships no production host application. Host behavior is
represented by the browser-safe `packages/host-bridge` contract and runnable
fixtures in `test-harness/widget-harness`.

The harness demonstrates iframe embedding, authenticated service access, host
context, client tools, and browser recovery. It remains explicitly test/example
infrastructure. Scripted providers, seeded conversations, and harness-only
client tools are reachable only through testing composition.

Partners own their host UI, authentication, data, permissions, navigation, and
workflows. Side Chat owns the widget, bridge contract, service, durable
execution, and persistence.

## Alternatives rejected

- **Ship a polished demo host:** it becomes the de facto product and biases
  public APIs toward one adopter.
- **Provide documentation without a runnable host:** iframe, origin, context,
  and client-tool contracts need executable browser evidence.
- **Put demo capabilities in production composition behind flags:** a missed
  flag becomes a production backdoor.

## Consequences

Evaluation uses the harness rather than a first-party product shell. Every
supported integration pattern needs a runnable fixture and a focused operations
guide because there is no host app to hide missing documentation.

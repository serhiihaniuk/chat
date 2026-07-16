# ADR 0002: Keep Deployment Configuration Readable and Deliberately Repetitive

Status: accepted 2026-07-02; rebaselined 2026-07-16

## Context

A deployment selects provider connections, models, reasoning policy, tools,
host-context limits, admission, timeouts, authentication references, telemetry,
and title behavior. When those choices are assembled from environment flags,
defaults, inheritance, and helper factories, maintainers must execute code
mentally before they can answer what a deployment does.

## Decision

Each deployment variant is one standalone typed file in
`apps/side-chat-service`:

- `sidechat.config.ts` declares the default production deployment;
- `sidechat.azure.config.ts` declares the Azure variant;
- `sidechat.fake.config.ts` declares deterministic local/test behavior.

Each file spells out its complete behavior. Variants do not inherit from a
shared base and do not generate model or tool entries through loops, spreads,
or factories. Near-identical blocks are intentionally repeated so a reviewer
can read or diff a deployment without following hidden control flow.

Environment values are declared inline through typed references and resolved by
the service environment boundary. Ad-hoc `process.env` reads remain forbidden.
Environment carries secrets and deployment placement; product behavior remains
visible in the typed declaration.

Shared config modules may define schemas, provider constructors, value sets, and
validation. They must not silently choose the default model, request-selectable
models, title model, exposed tools, or policy for a deployment.

## Alternatives rejected

- **Shared base configuration:** a variant becomes readable only relative to
  another file.
- **Config factories or generated entries:** shorter source hides the actual
  deployment behind execution.
- **Environment-first behavior flags:** strings are a poor representation for
  structured model, tool, and policy choices.
- **JSON or YAML:** loses direct TypeScript checking and typed environment
  references without adding useful safety.
- **Many small configuration modules:** restores the cross-file archaeology the
  declaration exists to prevent.

## Consequences

Configuration files are longer and intentionally repetitive. Adding a model or
tool may require copying a visible block into multiple variants. Review should
reject abstractions that make a variant impossible to understand on its own.
[Configuration operations](../operations/configuration.md) owns the current
schema and environment reference.

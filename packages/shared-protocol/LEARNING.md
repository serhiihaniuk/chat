# Shared Protocol Learning Guide

Status: local learning path

Read this when you want to understand `sidechat.v1`, the browser-facing product protocol. This package is the contract between widget and backend.

## Purpose

`packages/shared-protocol` defines request DTOs, stream events, host commands, citations, token usage, headers, SSE codec helpers, and sequence validation. The browser and server both depend on this package so they cannot silently disagree about the chat contract.

```txt
Effect Schema
  -> TypeScript DTO types
  -> runtime validation
  -> SSE encode/decode helpers
```

## Owns / Does Not Own

| Owns | Does not own |
| --- | --- |
| `sidechat.v1` schemas and DTO types. | AI SDK tool schemas. |
| Stream event names and validation. | Backend workflow decisions. |
| SSE frame helpers. | React rendering. |
| Host command shapes. | Host command execution. |

## Read Order

1. [`src/sidechat.v1/schemas.ts`](src/sidechat.v1/schemas.ts)  
   Start with the protocol shapes.

2. [`src/sidechat.v1/types.ts`](src/sidechat.v1/types.ts)  
   See how TypeScript types derive from schemas.

3. [`src/sidechat.v1/contracts.ts`](src/sidechat.v1/contracts.ts)  
   See route/header constants.

4. [`src/sidechat.v1/validation.ts`](src/sidechat.v1/validation.ts)  
   See parse vs validate helpers.

5. [`src/sidechat.v1/codec.ts`](src/sidechat.v1/codec.ts)  
   See text/event-stream framing.

6. [`src/sidechat.v1/sequence.ts`](src/sidechat.v1/sequence.ts)  
   See cross-event stream rules.

7. [`src/index.ts`](src/index.ts)  
   See the package facade consumed by apps and packages.

## Key Files

| File | Why it exists |
| --- | --- |
| `schemas.ts` | Canonical Effect Schema source for protocol JSON shapes. |
| `types.ts` | Derived TypeScript DTO names used across the monorepo. |
| `contracts.ts` | Stable HTTP route/header constants. |
| `validation.ts` | Runtime decoding for unknown values. |
| `codec.ts` | SSE encoding and parsing. |
| `sequence.ts` | Stream lifecycle validation. |
| `README.md` | Short package-level reference. |

## Technology Purpose In Context

### Effect Schema

Effect Schema solves the "one source of truth" problem for the product protocol. The same schema defines runtime decoding and TypeScript types. This matters because every stream frame starts as unknown JSON.

### Why Not Zod Here

Zod appears in adapter code where libraries expect it, such as AI SDK tool input schemas. This package owns the product protocol, so Effect Schema remains canonical here.

## Boundary Warnings

- Do not import backend ports, React, Hono, AI SDK, or `pg`.
- Do not add provider-specific stream fields to `sidechat.v1`.
- Do not change event names without treating it as a protocol version change.

## Verification

Run from the repository root:

```sh
npm run build --workspace @side-chat/shared-protocol
npm run verify
```

## Read Next

- [Side-Chat API](../../apps/side-chat-api/LEARNING.md) for the server producer.
- [Side-Chat Widget](../side-chat-widget/LEARNING.md) for the browser consumer.

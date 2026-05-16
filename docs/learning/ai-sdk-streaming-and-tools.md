# AI SDK Streaming And Tools From Scratch

Status: learning guide

This guide explains how AI SDK fits the side-chat architecture.

## What AI SDK Is Good At

AI SDK is strong at provider and chat-product mechanics:

- streaming model output
- tool calling
- multi-step calls
- provider abstraction
- reasoning and source parts
- UI/data stream concepts
- token usage
- typed tool inputs

That is why it is a good fit for a Workbench chat backend written in Node/TypeScript.

But AI SDK is not the whole architecture. In this repo, it belongs behind `ModelPort`.

## The Adapter Rule

Target rule:

```txt
Application code talks to ModelPort.
AI adapter code talks to AI SDK.
Widget code talks to sidechat.v1.
```

This keeps provider details out of the product protocol.

Current evidence:

- `apps/side-chat-api/src/adapters/ai/openai-model.ts` imports `streamText`, `tool`, `stepCountIs`, and `@ai-sdk/openai`.
- `apps/side-chat-api/src/application/stream-chat.ts` consumes `ModelPort.stream()`.
- `packages/side-chat-widget` consumes `sidechat.v1` events, not AI SDK provider stream parts.

## Basic Streaming Shape

AI SDK `streamText` returns stream parts. The adapter maps those parts into internal model chunks:

```txt
AI SDK text-delta
  -> ModelChunk { kind: "delta" }
  -> sidechat.delta
  -> widget assistant text

AI SDK reasoning-delta
  -> ModelChunk { kind: "reasoning" }
  -> sidechat.reasoning
  -> widget reasoning part

AI SDK tool-result
  -> ModelChunk { kind: "tool" }
  -> sidechat.tool
  -> widget tool part

AI SDK finish
  -> ModelChunk { kind: "done" }
  -> sidechat.completed
  -> usage and terminal state
```

That adapter mapping is the important seam. If a future provider has different stream internals, the browser should still receive `sidechat.v1`.

## Tools

A tool is a typed capability the model can call.

In this repo, tools include:

- query approved Workbench data
- read current host surface context
- request a host UI command
- generate a Workbench report

Tool inputs are validated with Zod schemas. That matters because a model should not get to pass arbitrary SQL or arbitrary browser commands.

Tool names should describe product capabilities, not implementation details.

Good:

```txt
workbench_query
workbench_surface_context
host_command
generate_workbench_report
```

Bad:

```txt
run_sql
mutate_grid_internal_state
call_openai_function_1
```

## Multi-Step Calls

AI SDK can let the model call a tool, receive the tool result, and then continue generating. This repo currently uses a small step limit through `stopWhen`.

That is important because tool loops can become hidden orchestration.

Target rules:

- keep step limits low
- log or expose tool progress
- validate every tool input
- require explicit approval for risky future tools
- never let model output become arbitrary host mutation

## Host Commands

`host_command` is a special kind of tool result.

The model does not directly mutate the browser. It returns a validated serializable command:

```txt
grid.applyView
grid.clearView
ui.focusResource
```

Then the backend emits `sidechat.host_command`, and the widget asks the host bridge to apply it.

This is the safe boundary:

```txt
model suggests command
backend validates command
widget dispatches command
host decides how to apply it
```

The host remains owner of its UI.

## sidechat.v1 Versus AI SDK UI Messages

AI SDK has UI message and data stream concepts. They are useful references because they model text, reasoning, tools, data, and sources.

This repo still owns `sidechat.v1` as the product protocol.

Why keep a repo-owned protocol?

- the widget is reusable outside a specific framework
- the backend can switch providers
- the host command contract is Workbench-specific
- governance and tests can validate the exact stream sequence
- the browser does not need provider SDK details

The future can move closer to AI SDK UIMessage shapes if that helps, but only through an explicit protocol decision.

## What To Study In Code

Read these files in order:

1. `packages/shared-protocol/src/sidechat.v1/types.ts`
2. `packages/shared-protocol/src/sidechat.v1/schemas.ts`
3. `packages/shared-protocol/src/sidechat.v1/sequence.ts`
4. `apps/side-chat-api/src/ports/index.ts`
5. `apps/side-chat-api/src/adapters/ai/openai-model.ts`
6. `apps/side-chat-api/src/application/stream-chat.ts`
7. `packages/side-chat-widget/src/hooks/use-side-chat.ts`

The lesson: provider stream parts enter at the adapter and leave as product events.

## References

- AI SDK documentation, `streamText`: https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text
- AI SDK documentation, Stream Protocols: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
- AI SDK documentation, Tool Calling: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- AI SDK documentation, UIMessage: https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message

# Native stream and SDK readability

Use this reference when code combines AI SDK streams, `WorkflowAgent`, provider
adapters, tools, journal replay, or public stream handling. Read the current
stream and package-boundary documents before applying these patterns.

## Side Chat stream model

Side Chat keeps the AI SDK UI-message stream as its public chat contract. It does
not insert a repository-owned event vocabulary between the Workflow journal and
the browser.

The local path is:

```txt
validate and admit the request
-> reconstruct the provider and WorkflowAgent in the Workflow realm
-> journal native model-call parts
-> project journal parts to native UIMessageChunk values
-> validate and scrub the stream profile
-> encode the safe chunks as SSE
-> fold native UIMessage values into widget-owned message and activity state
```

Provider DTOs, Workflow records, database rows, prompts, and raw errors stay
inside their owning boundaries. Native `UIMessage` and `UIMessageChunk` types may
cross only the explicit application, Workflow/HTTP, and widget stream seams
documented by the repository.

## Make boundary stages visible

Name the stages that change representation or establish a guarantee. For
example, a replay edge may have this readable shape:

```ts
const journalParts = readDurableJournalParts(replay)
const publicChunks = projectJournalPartsToUiMessageChunks(journalParts)
const safeChunks = scrubUiMessageChunks(publicChunks)

return encodeUiMessageStream(safeChunks)
```

These names illustrate responsibilities, not repository APIs. Verify the actual
helpers before editing. Do not add a second internal event or chat-envelope type
merely to reproduce this shape.

Keep provider selection, agent construction, journal reading, public projection,
safety scrubbing, transport encoding, and widget rendering in the modules that
own those decisions. Split a dense expression only when the named stages reduce
context load more than they add navigation.

## Failure and lifecycle model

Keep validation, authorization, provider, tool, persistence, replay, transport,
and widget failures distinct until the boundary that owns public normalization.
A public scrubber may replace private errors with stable safe vocabulary, but it
must preserve terminal discipline and must not hide ordinary failure semantics
from the owning layer.

Make ordering, cancellation, replay position, terminal state, and cleanup visible
where callers depend on them. Keep byte-level keepalive separate from application
events, and keep advisory turn-activity SSE separate from transcript authority.

## Widget activity projection

Tool and reasoning activity is a widget-owned view of native message parts. If
several native parts update one visible activity, preserve the stable native tool
or part identity used by the widget reducer. Do not introduce a service-owned
activity protocol or generate a new identity for every update.

## Review questions

1. Which module owns each representation change?
2. Does the path retain native `UIMessageChunk` values instead of inventing a
   second event vocabulary?
3. Which provider, Workflow, persistence, or private-content details stay hidden?
4. Where are validation and safe error normalization applied exactly once?
5. Are ordering, replay, cancellation, terminal state, and cleanup visible?
6. Does widget activity remain a projection rather than transcript authority?
7. Would a maintainer understand the local sequence without reconstructing the
   entire Workflow and transport architecture?

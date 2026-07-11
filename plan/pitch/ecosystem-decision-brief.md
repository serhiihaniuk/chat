# AI Assistant Platform: The Decision Has Changed

A decision brief. It deliberately recommends neither option — it defines what
must be decided, by whom, and against which criteria.

## Summary

In May–June 2026, both major AI application ecosystems shipped the layer we
previously had to design ourselves. LangChain released the LangGraph v3
streaming protocol and an open-source React client. Vercel released AI SDK 7
with an equivalent protocol, client, and an open-source durable runtime.

This changes our decision. We are no longer choosing whether to build the
"assistant infrastructure" layer in-house — nobody should build it anymore.
We are choosing **which ecosystem to adopt**, and both choices mean real,
deliberate framework coupling. "Avoiding vendor lock-in" is no longer one of
the options on the table; the option is choosing which vendor's open-source
stack we couple to, and who owns the result.

## What changed (all in the last few months)

| When               | What                                                   | Why it matters                                                                                |
| ------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Mar 2026           | LangChain ships `@langchain/react` (`useStream`) — MIT | Python stacks get an official React chat client                                               |
| May 28–Jun 1, 2026 | LangGraph v3 event protocol                            | Typed streaming: messages, reasoning, tool lifecycle, subgraphs — no more hand-built adapters |
| Jun 17, 2026       | Vercel ships eve (agent framework, preview)            | Signal of where the TypeScript ecosystem is heading                                           |
| Jun 25, 2026       | AI SDK 7 stable                                        | Typed stream protocol, React client, tool approvals, timeouts, durable Workflow runtime       |

Both of our existing implementations predate these releases. Neither should
inherit authority just because it already exists.

## What both ecosystems now provide (previously our job to build)

- A documented, typed streaming protocol: the user sees the answer appear
  live, with "thinking" and tool activity shown as it happens.
- An official React client that consumes that protocol (state, reconnection,
  tool rendering).
- Tool lifecycle handling (a tool call becomes structured events, not text).
- A human-approval primitive (the model pauses; a person approves or denies).
- Agent orchestration (multi-step tool use, sub-agents).

## What differs (the honest comparison)

| Dimension                                                                              | LangGraph (LangChain)                                                                                                   | AI SDK 7 (Vercel)                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Language                                                                               | Python backend; TypeScript frontend client                                                                              | TypeScript end to end                                                                                                                                                                                              |
| Core framework license                                                                 | MIT (open source)                                                                                                       | Apache 2.0 (open source)                                                                                                                                                                                           |
| Streaming protocol + React client                                                      | Open source (v3 + `useStream`)                                                                                          | Open source (UI message stream + `useChat`)                                                                                                                                                                        |
| Durable production runtime (crash recovery, background runs, cross-instance reconnect) | **Agent Server — commercial license**, even self-hosted; requires Postgres + Redis; normally reports usage to LangChain | **Workflow runtime — open source**, self-hosted on Postgres; younger, and our compatibility testing found a reproducible defect in its newest agent integration (reported; fix is a one-line change on their side) |
| Without the durable runtime                                                            | Request-bound execution; the missing server layer is ours to build                                                      | Request-bound execution (`ToolLoopAgent`); same limitation                                                                                                                                                         |
| Orchestration style                                                                    | Explicit graphs and subgraphs (strong for complex pipelines)                                                            | Agent loop with tools and sub-agents (strong for chat products)                                                                                                                                                    |
| Operational footprint                                                                  | Python service (+ Agent Server + Redis if licensed)                                                                     | Node service + Postgres                                                                                                                                                                                            |
| Maturity of the new layer                                                              | Protocol/client weeks old; durable runtime established                                                                  | Protocol/client stable since June; durable runtime weeks old                                                                                                                                                       |

Both companies are credible: LangChain is well funded with large enterprise
references; Vercel maintains some of the most used open-source software in
the industry. Both new layers are new — either choice needs compatibility
tests, exact version pins, and an upgrade discipline.

## What stays ours in EVERY option

No ecosystem provides these; whoever owns the product builds them:

- Authentication and tenant/ownership checks (a user id in a request body is
  not authentication).
- Approval policy and audit records (who may approve what; proof of what was
  approved).
- Durable conversation records with retention (a financial product cannot be
  record-less).
- Safe error handling (provider errors never reach the client raw).
- Capacity control (a bounded number of concurrent model calls — this is also
  the cost control).
- The client UI and its integration into our application.

## Acceptance scenarios (apply to whichever stack is chosen)

The chosen implementation should be accepted against scenarios, not demos:

1. The user refreshes the page mid-answer. What do they see?
2. The user presses Stop. Does the model call actually stop (and stop
   billing)?
3. The corporate gateway times out long requests. How does a three-minute,
   multi-tool answer survive?
4. A risky action needs sign-off. Where is the approval recorded, and what
   happens if the server restarts while waiting?
5. Who can read a conversation, and what prevents reading someone else's?
6. Support asks: "which model and which prompt produced this answer in
   March?" What is the answer path?

## The decision that needs an owner

1. **Pick one ecosystem.** Both are viable. The choice determines the
   language, the operational model, and the licensing relationship.
2. **Name the owning team and a technical owner.** The chosen stack is a
   commitment to learn and operate it — not a library import.
3. **Decide the durability question explicitly.** Request-bound execution
   (simpler, loses in-flight answers on restart) vs the ecosystem's durable
   runtime (LangChain: licensed; Vercel: open source but younger).
4. **Adopt the acceptance scenarios above** as the definition of done.

Once these four points are decided and owned, the evaluation that started
this discussion is complete.

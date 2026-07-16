# Host Commands (Host-Side Tools)

Read this when: you want the assistant to _act_ in your host app — open a record, focus a panel, prefill a form — instead of only answering in text.
Source of truth for: declaring, handling, and testing a host command end to end, plus a runnable worked example.
Not source of truth for: the host-bridge contract ([widget-and-host-integration.md](widget-and-host-integration.md) "Host bridge contract"), the full seam map ([extension-seams.md](extension-seams.md)), or the config file shape ([../operations/configuration.md](../operations/configuration.md)).

## Migration status

This page describes the legacy `apps/partner-ai-service` host-command path. The
replacement `apps/side-chat-service` does not expose host commands; it uses
durable browser-executed [client tools](client-tools.md) instead. Keep this guide
only when maintaining the legacy comparison wing before Step 20 cutover. New
replacement-stack integrations must follow the client-tool contract, including
durable ownership checks, timeout behavior, and Workflow-hook resumption.

## Host command vs runtime tool

Side Chat has two ways for the assistant to do more than write text. They look similar in a config file and feel different at runtime.

- A **runtime tool** runs on the server. The runtime executes it, the result feeds back into the model, and the model keeps writing. `jira.search_issues` ([jira-search-issues-tool.ts](../../apps/partner-ai-service/src/adapters/tools/examples/jira-search-issues-tool.ts)) is the worked example. Use a tool when the _backend_ must fetch or compute something.
- A **host command** runs in the browser. The assistant asks your host page to perform a UI action; your page performs it and reports back. There is no server execution. Use a host command when the _host app_ owns the action — navigation, selection, opening a record.

|                | Runtime tool                                  | Host command                                                           |
| -------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| Runs in        | The service runtime                           | The browser, in your host app                                          |
| Declared as    | `ToolCapability` + a `RuntimeTool` executable | `HostCommandCapability` only                                           |
| Performed by   | `agent-runtime`                               | Your `HostBridge.dispatchCommand`                                      |
| Result feeds   | Back to the model                             | Into the activity timeline, and back to the model via the result route |
| Worked example | `jira-search-issues-tool.ts`                  | `open_resource` (this guide)                                           |

If an action needs both — say, persist on the server _and_ move the host UI — ship a runtime tool and a host command as two registrations. Neither one implies the other.

## The contract

Three small types carry a host command from config to the host app. Read them once; the rest of this guide is just wiring them together.

| Piece        | Type (location)                                                                                                                                                                                                                                                                                                        | Shape                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Declaration  | `HostCommandCapability` ([capabilities.ts](../../packages/partner-ai-core/src/domain/capabilities/contracts/capabilities.ts)) — the server manifest shape; the browser bridge advertises the same command as a `BrowserHostCommandCapability` ([capability.ts](../../packages/host-bridge/src/commands/capability.ts)) | `{ commandName, description, inputSchema }`                                |
| Stream event | `ActivityHostCommandDetails` ([event-union.ts:98](../../packages/chat-protocol/src/sidechat-v1/events/event-union.ts))                                                                                                                                                                                                 | a `host_command` activity event with `{ commandId, commandName, payload }` |
| Result       | `HostCommandResult` ([command-result.ts](../../packages/host-bridge/src/commands/command-result.ts))                                                                                                                                                                                                                   | `{ commandId, commandName, status, resultCode, data? }`                    |

The flow is one straight line:

1. You **declare** the command in `sidechat.config.ts`. It rides the config into the host manifest automatically ([options-adapter.ts:151](../../apps/partner-ai-service/src/config/sidechat-config/options/options-adapter.ts) → manifest `commands`). No runtime code.
2. During a turn, the model calls the command and a `host_command` **activity event** arrives in the stream (see [how it is triggered](#how-a-host-command-is-triggered) below).
3. The widget **dispatches** that event to your bridge — once per `activityId` — at `maybeDispatchHostCommand` ([widget-run-subscription.ts:55](../../packages/side-chat-widget/src/features/chat/model/subscription/widget-run-subscription.ts)).
4. Your bridge **performs** the action and returns a `HostCommandResult`.
5. The widget **folds** that result into the assistant's activity timeline and **POSTs** it to the result route, which resumes the model's awaiting tool call. A failure is a recorded row, not a retry.

## The worked example

`open_resource` is a complete, runnable host-side example. It lives in the widget harness, which doubles as a tiny demo host app. The harness stream emits the command directly, so this example proves dispatch, host handling, and result folding without requiring a model or server declaration. Run it:

```bash
npm run dev --workspace @side-chat/widget-harness
# open http://127.0.0.1:5173/?mode=mock-stream
```

You see a **Demo host app** panel (the host page) next to the chat widget. Send any message. The mock stream emits an `open_resource` host command; the harness bridge applies it, and the panel updates live — the named record highlights, the "Assistant actions" counter ticks up, and the command log shows `open_resource · applied`.

Three files make that work. Copy their host-side pattern for your own command:

| File                                                                                    | Role                                                                |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [demo-host-surface.ts](../../test-harness/widget-harness/src/host/demo-host-surface.ts) | The host app's own state, and how it interprets a command.          |
| [fake-host-bridge.ts](../../test-harness/widget-harness/src/host/fake-host-bridge.ts)   | The bridge: turns a dispatched command into a host action + result. |
| [demo-host-panel.tsx](../../test-harness/widget-harness/src/app/demo-host-panel.tsx)    | The visible host UI a person also clicks directly.                  |

## Add a host command

### 1. Register it in config

A host command is "registered" by declaring a `HostCommandCapability` in `hostCommands.availableCommands`. Follow the catalog pattern used for tools — a named entry, kept beside config so a reader sees the command's contract:

```ts
const openResourceCommand = {
  commandName: "open_resource",
  description:
    "Open a record in the host app for the user, such as a ticket, invoice, or customer.",
  inputSchema: OPEN_RESOURCE_INPUT_SCHEMA, // a JSON Schema object
} satisfies HostCommandCapability;
```

```ts
// apps/partner-ai-service/sidechat.config.ts
hostCommands: {
  availableCommands: [openResourceCommand],
},
```

- `commandName` is the stable id the host app matches on. Namespacing (`open_resource`, `crm.open_record`) keeps it distinct from tool names.
- `inputSchema` is the JSON Schema for the `payload` your host app will receive.

Host commands are bounded browser actions, not a durable human-approval workflow. If a mutation requires approval, build a separate durable workflow that records the request, decision, authorization, and retry behavior before exposing the mutation to the model.

That is the whole backend change. The command now appears in the host manifest; no runtime tool, no executor.

### 2. Handle it in the host bridge

The host app owns the action. Build a `HostBridge` and implement `dispatchCommand` to perform the command and return a result. In production you use `createHostBridge` ([bridge.ts:28](../../packages/host-bridge/src/bridge/bridge.ts)), which gates each command against your advertised capabilities and then calls your dispatcher.

**Advertise the command in `getCapabilities` — the config declaration alone does not make it model-callable.** The `capabilities` you pass here (a `BrowserHostCommandCapability` list — [capability.ts](../../packages/host-bridge/src/commands/capability.ts), the browser twin of core's manifest `HostCommandCapability`) do double duty. `createHostBridge` refuses to dispatch a command that is not in the list — it returns `unsupported` without calling your dispatcher. And each turn the widget sends the same advertised list to the server as `request.hostCommands`, which core relays into the runtime's `toolScope.hostCommands` ([build-model-turn-request.ts:44](../../packages/partner-ai-core/src/application/stream-chat/model-request/build-model-turn-request.ts)) — that relay is what exposes the command to the model as a callable tool. A command declared in server config but never advertised by `getCapabilities` is never offered to the model.

```ts
const bridge = createHostBridge({
  contextProvider, // returns HostContext on each turn
  capabilities, // { schemaVersion, commands: [{ commandName: "open_resource" }] }
  dispatcher: {
    dispatchCommand: (command) => {
      if (command.commandName === "open_resource") {
        const { resourceType, resourceId } = command.payload;
        openRecordInYourApp(String(resourceType), String(resourceId)); // your UI action
        return Promise.resolve(
          createCommandResult(command, { status: "applied", resultCode: "opened" }),
        );
      }
      return Promise.resolve(createUnsupportedResult(command));
    },
  },
});
```

The harness shows the same idea without the capability gate — it reads the payload and mutates the visible demo state ([fake-host-bridge.ts](../../test-harness/widget-harness/src/host/fake-host-bridge.ts) → [demo-host-surface.ts](../../test-harness/widget-harness/src/host/demo-host-surface.ts)). Return one of the `HostCommandResult` statuses (`applied`, `rejected`, `unsupported`, `failed`, `timed_out`); the helpers in [command-result.ts](../../packages/host-bridge/src/commands/command-result.ts) build each.

Keep the dispatcher synchronous-ish and side-effecting on _your_ state only. Do not retry inside it — a failed result is the recorded outcome.

### 3. See the result in the widget

Pass the bridge to the widget through the `hostBridge` prop:

```tsx
<SideChatWidget client={client} hostBridge={bridge} /* … */ />
```

That is all the widget needs. When a `host_command` event arrives, the widget calls your `dispatchCommand` and folds the returned result into the assistant's activity timeline — `applied` shows as completed, anything else as failed. The contract and the exact fold-back rules are owned by [widget-and-host-integration.md](widget-and-host-integration.md) "Host bridge contract".

This in-process prop works when the host page and the widget share one document. If you embed the widget in an **iframe**, the bridge cannot be a plain object passed across the boundary — see [Embedding via iframe](#embedding-via-iframe).

### 4. Trigger and test it

The deterministic way to exercise the whole loop today is the harness mock stream. Its client emits an `open_resource` activity event on every turn ([mock-stream-client.ts](../../test-harness/widget-harness/src/clients/mock-stream-client.ts) `hostCommandEvent`), so a single message drives declare → dispatch → handle → result. Point your own command's event at the same builder to test it the same way.

For a unit test, dispatch a hand-built event straight at the bridge and assert the result and the host-side effect — see the round-trip test in [widget-harness.test.ts](../../test-harness/widget-harness/src/app/widget-harness.test.ts) ("keeps host command results as harness-local records").

## Embedding via iframe

The `hostBridge` prop is consumed **inside** the widget. When you embed the widget in an iframe, the widget runs in the iframe's document while the host page is the **parent** window — so you cannot hand it a bridge object built in the parent. Instead, build the bridge inside the iframe and have it **forward** each command to the parent over `postMessage`; the parent performs the action and replies with the result.

The round trip:

1. The iframe bridge's `dispatchCommand` posts `{ type: "sidechat.widget.hostCommand", command }` to `window.parent`.
2. The parent's `message` listener performs the host action and posts `{ type: "sidechat.widget.hostCommandResult", commandId, result }` back to the iframe.
3. The iframe bridge matches the reply by `commandId` and resolves with a `HostCommandResult`. A missing reply times out, so the timeline never hangs.

**Iframe side** — forward and await (worked example: [post-message-host-bridge.ts](../../test-harness/widget-harness/src/host/post-message-host-bridge.ts)):

```ts
const createPostMessageHostBridge = ({ context }) => ({
  getContext: () => Promise.resolve(context),
  dispatchCommand: (event) => {
    const command = toHostCommand(event);
    return new Promise((resolve) => {
      const origin = window.location.origin;
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        resolve(
          createCommandResult(command, { status: "timed_out", resultCode: "host_command_timeout" }),
        );
      }, 5000);
      window.addEventListener(
        "message",
        (message) => {
          if (message.origin !== origin) return; // validate sender
          const data = message.data;
          if (data?.type !== "sidechat.widget.hostCommandResult") return;
          if (data.commandId !== command.commandId) return; // correlate reply
          clearTimeout(timer);
          controller.abort();
          resolve(createCommandResult(command, data.result));
        },
        { signal: controller.signal },
      );
      window.parent.postMessage({ type: "sidechat.widget.hostCommand", command }, origin);
    });
  },
});
```

Pass it to the widget exactly like the in-process bridge: `<SideChatWidget hostBridge={createPostMessageHostBridge({ context })} />`. In the harness, `harness-app.tsx` selects this bridge whenever the widget is iframe-embedded (`openControl=host`).

**Parent side** — perform the action and reply (worked example: [workbench-embed.html](../../test-harness/widget-harness/public/workbench-embed.html)):

```js
window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return; // validate sender
  if (event.data?.type !== "sidechat.widget.hostCommand") return;
  const { commandId, commandName, payload } = event.data.command;
  const result = performHostAction(commandName, payload); // → { status, resultCode, data? }
  frame.contentWindow.postMessage(
    { type: "sidechat.widget.hostCommandResult", commandId, result },
    window.location.origin,
  );
});
```

Three rules make this safe and reliable: **validate `event.origin`** on both sides, **correlate by `commandId`**, and **time out** when no reply arrives. `getContext` can ride the same channel if the parent owns page context; the example returns a static context for brevity.

See it: with the harness running, open `http://127.0.0.1:5173/workbench-embed.html?mode=mock-stream&open=true&framePath=/`, then send a message in the iframe — the parent page's record list updates and the result folds back into the widget timeline. The proxy-based host setup (separate origins, `/side-chat-frame` + `/side-chat-api`) is in [../operations/embed-widget-iframe.md](../operations/embed-widget-iframe.md).

## How a host command is triggered

A host command reaches the widget as a `host_command` activity event inside the turn stream. Two paths produce that event, and both work today:

- **Model-driven emission (production).** Core relays the declared commands to the runtime per turn ([build-model-turn-request.ts](../../packages/partner-ai-core/src/application/stream-chat/model-request/build-model-turn-request.ts)), and the runtime exposes each one to the model as a callable tool ([ai-sdk-tool-adapter.ts](../../packages/agent-runtime/src/runtime/ai-sdk/ai-sdk-tool-adapter.ts)). When the model calls one, the runner emits the `host_command` activity event ([tool-activity-mapper.ts](../../packages/agent-runtime/src/runtime/ai-sdk/streaming/tool-activity-mapper.ts)). The fake provider drives this deterministically, and `agent-runtime.test.ts` covers the round trip end to end.
- **Harness mock stream (offline fixture).** The harness client emits the event without a model, which keeps host-side handling testable in isolation.

## The mid-stream result round trip

This is the hardest part of host commands to understand, so read it slowly. The
decision record behind it is
[ADR 0009](../adr/0009-host-command-await-and-result-relay.md).

The key constraint: **SSE is one-directional.** The turn stream can deliver the
command to the browser, but nothing can travel browser-to-server on it. So the
model's tool loop **pauses on the server** — exactly as it would for a backend
tool — while the "execution" happens in the browser, and the result returns on
a separate small POST. The stream goes quiet during the pause and resumes after.

```txt
model            service (owner instance)        stream        browser / host app
  |-- calls tool --> tool loop pauses;
  |                  resolver registers pending
  |                  (commandId, 30 s timer)
  |                  emit host_command activity --> event -----> widget dispatches
  |                                                              host performs action
  |                            <-- POST /chat/turns/:id/host-commands/:commandId/result
  |                  resolver settles pending
  |<-- tool result --|
  |-- keeps generating; deltas resume on the same still-open stream
```

The pieces, in order:

1. **Pause.** The model calls the command; the runtime's tool call awaits a
   pending entry (keyed `(assistantTurnId, commandId)`) in the connection-bound
   resolver
   ([service-host-command-resolver.ts](../../apps/partner-ai-service/src/adapters/host-commands/service-host-command-resolver.ts)),
   which lives in the memory of the instance running the turn's fiber. The
   resolver first persists an `emitted` row in `host_command_results` — the
   durable proof that this commandId belongs to this turn.
2. **Deliver.** The `host_command` activity event rides the normal turn stream;
   the widget dispatches it to your bridge once per `activityId`.
3. **Return.** The widget POSTs the `HostCommandResult` to
   `POST /chat/turns/:assistantTurnId/host-commands/:commandId/result` — the
   side door, a plain HTTP request that works on **any** instance: it validates
   against the `emitted` row (no row for this turn → 404, never a settle),
   persists the result, and `pg_notify`s the owner in the same transaction
   ([chat-turn-host-commands.ts](../../apps/partner-ai-service/src/inbound/http/routes/chat/turns/host-commands/chat-turn-host-commands.ts)).
4. **Resume.** The owner settles the pending entry — directly when the POST
   landed on it, via its result-notification listener otherwise, or via its
   ~2 s result poll if the signal was lost; the tool call resolves; the result
   enters the model's context; generation continues.

Bounds that make the pause safe — the turn can never hang on a silent host:

| Situation                                          | Resolver behavior                    | What the model sees          |
| -------------------------------------------------- | ------------------------------------ | ---------------------------- |
| No stream subscriber connected when the tool fires | Resolves immediately                 | `no_connected_client` result |
| No result within 30 seconds                        | Resolves on the timer                | `timed_out` result           |
| Result posted twice / after settle                 | Second settle is a no-op             | first result only            |
| User cancels mid-await                             | Fiber interrupt tears the await down | (turn ends `aborted`)        |

Failure modes worth knowing:

| Failure                                                   | Behavior                                                                                                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Result POST lands on a non-owner instance (load balancer) | That instance persists the result and `pg_notify`s; the owner settles in milliseconds, or within ~2 s via its result poll if the signal was lost (ADR 0009) |
| Result POSTed with a leaked commandId from another turn   | `404` — the durable `emitted` row binds the command to its turn, so a caller's own valid turn cannot settle someone else's command                          |
| Stream stays silent during a long await                   | SSE heartbeat comments keep proxies and client watchdogs from treating the healthy pause as a dead connection.                                              |
| Reload replays a completed command event                  | Dispatch ignores activity that is no longer `running`, so a completed host action is not performed twice.                                                   |
| Owner instance crashes mid-await                          | Pending entry and fiber die together; the lease reaper terminalizes the turn. The `emitted` row stays unresolved — one small row, kept forever by design.   |

One boundary to respect: this seam is built for **fast UI actions**. The await
is in-memory and 30-seconds-bounded, so a turn cannot park on a human decision
— do not build approval gates on it (ADR 0009 records the rejected
durable-pause alternative).

## Verify

```bash
npm run typecheck
npm run lint:custom
npx vitest run test-harness/widget-harness apps/partner-ai-service/src
```

The config declaration flows into the host manifest, so the service composition tests cover it; the harness tests cover the dispatch round trip.

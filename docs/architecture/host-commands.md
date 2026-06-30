# Host Commands (Host-Side Tools)

Read this when: you want the assistant to *act* in your host app — open a record, focus a panel, prefill a form — instead of only answering in text.
Source of truth for: declaring, handling, and testing a host command end to end, plus a runnable worked example.
Not source of truth for: the host-bridge contract ([widget-and-host-integration.md](widget-and-host-integration.md) "Host bridge contract"), the full seam map ([extension-seams.md](extension-seams.md)), or the config file shape ([../operations/configuration.md](../operations/configuration.md)).

## Host command vs runtime tool

Side Chat has two ways for the assistant to do more than write text. They look similar in a config file and feel different at runtime.

- A **runtime tool** runs on the server. The runtime executes it, the result feeds back into the model, and the model keeps writing. `jira.search_issues` ([jira-search-issues-tool.ts](../../apps/partner-ai-service/src/adapters/tools/examples/jira-search-issues-tool.ts)) is the worked example. Use a tool when the *backend* must fetch or compute something.
- A **host command** runs in the browser. The assistant asks your host page to perform a UI action; your page performs it and reports back. There is no server execution. Use a host command when the *host app* owns the action — navigation, selection, opening a record.

| | Runtime tool | Host command |
|---|---|---|
| Runs in | The service runtime | The browser, in your host app |
| Declared as | `ToolCapability` + a `RuntimeTool` executable | `HostCommandCapability` only |
| Performed by | `agent-runtime` | Your `HostBridge.dispatchCommand` |
| Result feeds | Back to the model | Back into the activity timeline |
| Worked example | `jira-search-issues-tool.ts` | `open_resource` (this guide) |

If an action needs both — say, persist on the server *and* move the host UI — ship a runtime tool and a host command as two registrations. Neither one implies the other.

## The contract

Three small types carry a host command from config to the host app. Read them once; the rest of this guide is just wiring them together.

| Piece | Type (location) | Shape |
|---|---|---|
| Declaration | `HostCommandCapability` ([capabilities.ts:170](../../packages/partner-ai-core/src/domain/capabilities/contracts/capabilities.ts)) | `{ commandName, description, inputSchema, approvalMode }` |
| Stream event | `ActivityHostCommandDetails` ([event-union.ts:98](../../packages/chat-protocol/src/sidechat-v1/events/event-union.ts)) | a `host_command` activity event with `{ commandId, commandName, payload }` |
| Result | `HostCommandResult` ([command-result.ts](../../packages/host-bridge/src/commands/command-result.ts)) | `{ commandId, commandName, status, resultCode, data? }` |

The flow is one straight line:

1. You **declare** the command in `sidechat.config.ts`. It rides the config into the host manifest automatically ([options-adapter.ts:151](../../apps/partner-ai-service/src/config/sidechat-config/options/options-adapter.ts) → manifest `commands`). No runtime code.
2. During a turn, a `host_command` **activity event** arrives in the stream (who emits it is covered in [the trigger seam](#how-a-host-command-is-triggered) below).
3. The widget **dispatches** that event to your bridge — once per `activityId` — at `maybeDispatchHostCommand` ([widget-run-subscription.ts:55](../../packages/side-chat-widget/src/features/chat/model/subscription/widget-run-subscription.ts)).
4. Your bridge **performs** the action and returns a `HostCommandResult`.
5. The widget **folds** that result back into the assistant's activity timeline. A failure is a recorded row, not a retry.

## The worked example

`open_resource` is a complete, runnable host command. It lives in the widget harness, which doubles as a tiny demo host app. Run it:

```bash
npm run dev --workspace @side-chat/widget-harness
# open http://127.0.0.1:5173/?mode=mock-stream
```

You see a **Demo host app** panel (the host page) next to the chat widget. Send any message. The mock stream emits an `open_resource` host command; the harness bridge applies it, and the panel updates live — the named record highlights, the "Assistant actions" counter ticks up, and the command log shows `open_resource · applied`.

Four files make that work. They are the host-command analogue of the jira tool — copy them for your own command:

| File | Role |
|---|---|
| [host-commands.ts](../../apps/partner-ai-service/src/config/catalog/capabilities/host-commands.ts) | Declares the `open_resource` capability (catalog entry). |
| [demo-host-surface.ts](../../test-harness/widget-harness/src/host/demo-host-surface.ts) | The host app's own state, and how it interprets a command. |
| [fake-host-bridge.ts](../../test-harness/widget-harness/src/host/fake-host-bridge.ts) | The bridge: turns a dispatched command into a host action + result. |
| [demo-host-panel.tsx](../../test-harness/widget-harness/src/app/demo-host-panel.tsx) | The visible host UI a person also clicks directly. |

## Add a host command

### 1. Register it in config

A host command is "registered" by declaring a `HostCommandCapability` in `hostCommands.availableCommands`. Follow the catalog pattern used for tools — a named entry, kept beside config so a reader sees the command's contract:

```ts
// apps/partner-ai-service/src/config/catalog/capabilities/host-commands.ts
export const HOST_COMMANDS = {
  OPEN_RESOURCE: {
    commandName: "open_resource",
    description:
      "Open a record in the host app for the user, such as a ticket, invoice, or customer.",
    inputSchema: OPEN_RESOURCE_INPUT_SCHEMA, // a JSON Schema object
    approvalMode: "never",
  },
} as const satisfies Record<string, HostCommandCapability>;
```

```ts
// apps/partner-ai-service/sidechat.config.ts
hostCommands: {
  availableCommands: [HOST_COMMANDS.OPEN_RESOURCE],
  approvalPolicies: [],
  activityRenderers: [],
},
```

- `commandName` is the stable id the host app matches on. Namespacing (`open_resource`, `crm.open_record`) keeps it distinct from tool names.
- `inputSchema` is the JSON Schema for the `payload` your host app will receive.
- `approvalMode` is `never`, `on_request`, or `always` ([ApprovalMode](../../packages/partner-ai-core/src/domain/capabilities/contracts/capabilities.ts)). Anything other than `never` needs a matching entry in `approvalPolicies`.

That is the whole backend change. The command now appears in the host manifest; no runtime tool, no executor.

### 2. Handle it in the host bridge

The host app owns the action. Build a `HostBridge` and implement `dispatchCommand` to perform the command and return a result. In production you use `createHostBridge` ([bridge.ts:28](../../packages/host-bridge/src/bridge/bridge.ts)), which gates each command against your advertised capabilities and then calls your dispatcher:

```ts
const bridge = createHostBridge({
  contextProvider,        // returns HostContext on each turn
  capabilities,           // { schemaVersion, commands: [{ commandName: "open_resource" }] }
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

Keep the dispatcher synchronous-ish and side-effecting on *your* state only. Do not retry inside it — a failed result is the recorded outcome.

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
        resolve(createCommandResult(command, { status: "timed_out", resultCode: "host_command_timeout" }));
      }, 5000);
      window.addEventListener("message", (message) => {
        if (message.origin !== origin) return;                          // validate sender
        const data = message.data;
        if (data?.type !== "sidechat.widget.hostCommandResult") return;
        if (data.commandId !== command.commandId) return;               // correlate reply
        clearTimeout(timer);
        controller.abort();
        resolve(createCommandResult(command, data.result));
      }, { signal: controller.signal });
      window.parent.postMessage(
        { type: "sidechat.widget.hostCommand", command },
        origin,
      );
    });
  },
});
```

Pass it to the widget exactly like the in-process bridge: `<SideChatWidget hostBridge={createPostMessageHostBridge({ context })} />`. In the harness, `harness-app.tsx` selects this bridge whenever the widget is iframe-embedded (`openControl=host`).

**Parent side** — perform the action and reply (worked example: [workbench-embed.html](../../test-harness/widget-harness/public/workbench-embed.html)):

```js
window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;          // validate sender
  if (event.data?.type !== "sidechat.widget.hostCommand") return;
  const { commandId, commandName, payload } = event.data.command;
  const result = performHostAction(commandName, payload);       // → { status, resultCode, data? }
  frame.contentWindow.postMessage(
    { type: "sidechat.widget.hostCommandResult", commandId, result },
    window.location.origin,
  );
});
```

Three rules make this safe and reliable: **validate `event.origin`** on both sides, **correlate by `commandId`**, and **time out** when no reply arrives. `getContext` can ride the same channel if the parent owns page context; the example returns a static context for brevity.

See it: with the harness running, open `http://127.0.0.1:5173/workbench-embed.html?mode=mock-stream&open=true&framePath=/`, then send a message in the iframe — the parent page's record list updates and the result folds back into the widget timeline. The proxy-based host setup (separate origins, `/side-chat-frame` + `/side-chat-api`) is in [../operations/embed-widget-iframe.md](../operations/embed-widget-iframe.md).

## How a host command is triggered

A host command reaches the widget as a `host_command` activity event inside the turn stream. Two paths can produce that event, and only one is wired today:

- **Harness mock stream (works now).** The harness client emits the event deterministically. This is the supported way to build and test host-command handling, and it is what the worked example uses.
- **Model-driven emission (reserved seam).** The intent is that the model, mid-turn, chooses an allowed host command and the runtime emits the event. The plumbing for the allowlist already exists: the turn policy's `allowedCommandNames` ([capabilities.ts:245](../../packages/partner-ai-core/src/domain/capabilities/contracts/capabilities.ts)) is passed to the runtime as `toolScope.allowedHostCommandNames` ([build-model-turn-request.ts:38](../../packages/partner-ai-core/src/application/stream-chat/model-request/build-model-turn-request.ts)). But `agent-runtime` does not yet read that scope or emit the event, so a declared command is **not** model-callable in production. Declaring, handling, and testing a host command is complete; model-triggered emission is the remaining runtime seam.

State this honestly to adopters: register and handle your command now, and exercise it through the harness; the production trigger lands when the runtime seam is built.

## Verify

```bash
npm run typecheck
npm run lint:custom
npx vitest run test-harness/widget-harness apps/partner-ai-service/src
```

The config declaration flows into the host manifest, so the service composition tests cover it; the harness tests cover the dispatch round trip.

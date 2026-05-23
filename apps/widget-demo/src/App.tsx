import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SideChatWidget } from "@side-chat/side-chat-widget";
import type {
  HostCommand,
  HostCommandResult,
  HostContextSnapshot,
  ModelSelection,
} from "@side-chat/shared-protocol";

const availableModels = [
  { provider: "openai", id: "gpt-5.4-nano", reasoningEffort: "medium" },
] satisfies ModelSelection[];

type ParentMessage =
  | {
      type: "sidechat.host.context";
      context?: HostContextSnapshot;
      requestId?: string;
    }
  | {
      type: "sidechat.host.commandResult";
      requestId: string;
      result: HostCommandResult;
    };

type PendingRequest = {
  reject: (reason?: unknown) => void;
  resolve: (value: unknown) => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isParentMessage = (value: unknown): value is ParentMessage =>
  isRecord(value) &&
  typeof value.type === "string" &&
  value.type.startsWith("sidechat.");

const requestId = () =>
  `embed-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;

const getSearchParam = (name: string) =>
  new URLSearchParams(window.location.search).get(name)?.trim() || undefined;

const getParentOrigin = () => {
  const fromQuery = getSearchParam("parentOrigin");
  if (fromQuery) return fromQuery;
  try {
    return document.referrer ? new URL(document.referrer).origin : "*";
  } catch {
    return "*";
  }
};

/**
 * Minimal public-package consumer. This app is a packaging and callback smoke
 * test, not the Workbench integration source of truth.
 */
export function App() {
  const [events, setEvents] = useState<string[]>([]);
  const [hostContext, setHostContext] = useState<
    HostContextSnapshot | undefined
  >();
  const pendingRequestsRef = useRef(new Map<string, PendingRequest>());
  const isEmbed = getSearchParam("embed") === "1";
  const workspaceId = getSearchParam("workspaceId") ?? "demo-workspace";
  const conversationId =
    getSearchParam("conversationId") ?? "demo-conversation-001";
  const title = getSearchParam("title") ?? "Demo Assistant";
  const parentOrigin = useMemo(getParentOrigin, []);

  const postToParent = useCallback(
    (message: unknown) => {
      if (!isEmbed) return;
      window.parent.postMessage(message, parentOrigin);
    },
    [isEmbed, parentOrigin],
  );

  const record = (event: string) =>
    setEvents((current) => [event, ...current].slice(0, 4));

  useEffect(() => {
    if (!isEmbed) return;

    const onMessage = (event: MessageEvent<unknown>) => {
      if (parentOrigin !== "*" && event.origin !== parentOrigin) return;
      if (!isParentMessage(event.data)) return;

      if (event.data.type === "sidechat.host.context") {
        if (!event.data.requestId) {
          setHostContext(event.data.context);
          return;
        }

        const pending = pendingRequestsRef.current.get(event.data.requestId);
        if (!pending) return;
        pendingRequestsRef.current.delete(event.data.requestId);
        pending.resolve(event.data.context);
        return;
      }

      if (event.data.type === "sidechat.host.commandResult") {
        const pending = pendingRequestsRef.current.get(event.data.requestId);
        if (!pending) return;
        pendingRequestsRef.current.delete(event.data.requestId);
        pending.resolve(event.data.result);
      }
    };

    window.addEventListener("message", onMessage);
    postToParent({ type: "sidechat.embed.ready" });
    postToParent({ type: "sidechat.embed.resize", width: 112, height: 112 });
    return () => window.removeEventListener("message", onMessage);
  }, [isEmbed, parentOrigin, postToParent]);

  const askParent = useCallback(
    <T,>(message: { type: string; [key: string]: unknown }) =>
      new Promise<T>((resolve, reject) => {
        if (!isEmbed) {
          reject(new Error("No iframe parent is configured."));
          return;
        }

        const id = requestId();
        pendingRequestsRef.current.set(id, {
          reject,
          resolve: (value) => resolve(value as T),
        });
        postToParent({ ...message, requestId: id });

        window.setTimeout(() => {
          const pending = pendingRequestsRef.current.get(id);
          if (!pending) return;
          pendingRequestsRef.current.delete(id);
          pending.reject(new Error("Timed out waiting for host response."));
        }, 5_000);
      }),
    [isEmbed, postToParent],
  );

  const getHostContext = useCallback(async () => {
    if (!isEmbed) return undefined;
    const context = await askParent<HostContextSnapshot | undefined>({
      type: "sidechat.host.getContext",
    });
    setHostContext(context);
    return context;
  }, [askParent, isEmbed]);

  const dispatchHostCommand = useCallback(
    async (command: HostCommand) => {
      if (!isEmbed) {
        return {
          status: "unsupported",
          message: "No iframe host bridge is configured.",
        } satisfies HostCommandResult;
      }

      return await askParent<HostCommandResult>({
        type: "sidechat.host.dispatchCommand",
        command,
      });
    },
    [askParent, isEmbed],
  );

  const widget = (
    <SideChatWidget
      apiEndpoint="/chat/stream"
      workspaceId={workspaceId}
      initialConversationId={conversationId}
      title={title}
      placeholder="Ask about revenue, markdown, or failure retry"
      availableModels={availableModels}
      host={
        isEmbed
          ? { getContext: getHostContext, dispatchCommand: dispatchHostCommand }
          : undefined
      }
      onOpen={() => {
        record("opened");
        postToParent({ type: "sidechat.embed.resize", width: 760, height: 860 });
      }}
      onClose={() => {
        record("closed");
        postToParent({ type: "sidechat.embed.resize", width: 112, height: 112 });
      }}
      onError={(error) => record(`error:${error.code}`)}
      onUsage={(usage) => record(`usage:${usage.totalTokens}`)}
    />
  );

  if (isEmbed) {
    return (
      <main className="embed-shell" data-embed-ready="true">
        {widget}
        {hostContext ? (
          <span className="sr-only" data-testid="host-context-status">
            Host context: {hostContext.pageId}
          </span>
        ) : null}
      </main>
    );
  }

  return (
    <main className="demo-shell">
      <section>
        <p className="eyebrow">Reusable package consumer</p>
        <h1>Widget Demo</h1>
        <p>
          Imports SideChatWidget and package styles through the public
          @side-chat/side-chat-widget surface.
        </p>
        <div className="demo-card-grid" aria-label="Demo state checklist">
          <article>
            <strong>Conversation history</strong>
            <span>Opens demo-conversation-001 on launch for testing.</span>
          </article>
          <article>
            <strong>Streaming markdown</strong>
            <span>Try headings, lists, links, and code prompts.</span>
          </article>
          <article>
            <strong>Error / retry</strong>
            <span>
              Send a prompt containing “fail” to exercise stream errors.
            </span>
          </article>
        </div>
        <aside className="demo-events" aria-label="Widget callback events">
          <h2>Widget callbacks</h2>
          {events.length === 0 ? (
            <p>No widget events yet.</p>
          ) : (
            <ul>
              {events.map((event, index) => (
                <li key={`${event}-${index}`}>{event}</li>
              ))}
            </ul>
          )}
        </aside>
      </section>
      {widget}
    </main>
  );
}

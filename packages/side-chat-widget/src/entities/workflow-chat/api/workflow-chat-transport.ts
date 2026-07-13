import {
  WorkflowChatTransport,
  type ReconnectToStreamOptions,
  type SendMessagesOptions,
  type WorkflowChatTransportOptions,
} from "@ai-sdk/workflow";
import type { ChatRequestOptions, ChatTransport } from "ai";
import type { JsonObject } from "@side-chat/shared";

import {
  resolveWorkflowChatRequestConfig,
  workflowChatFetch,
  workflowChatUrl,
  type WorkflowChatClient,
  type WorkflowUIMessage,
} from "../model/workflow-chat-client.js";

type CreateWorkflowChatTransportInput = Readonly<{
  getClient: () => WorkflowChatClient;
  getClientTools?:
    | (() =>
        | readonly WorkflowClientToolDefinition[]
        | Promise<readonly WorkflowClientToolDefinition[]>)
    | undefined;
  onRunStarted: (runId: string) => void;
  onRunFinished: () => void;
  /** The run to reattach to on a cold-load reconnect, when discovery found one. */
  getReconnectRunId?: (() => string | undefined) | undefined;
}>;

export type WorkflowClientToolDefinition = Readonly<{
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
}>;

/**
 * Bind Workflow's generic transport to Side Chat's HTTP envelope.
 *
 * The callbacks deliberately resolve `getClient()` and request configuration at
 * request time. Auth refresh, model selection, and credentials therefore never
 * become captured mount-time values.
 */
export function createWorkflowChatTransport({
  getClient,
  getClientTools,
  getReconnectRunId,
  onRunFinished,
  onRunStarted,
}: CreateWorkflowChatTransportInput): ChatTransport<WorkflowUIMessage> {
  const client = getClient();
  const transportOptions: WorkflowChatTransportOptions<WorkflowUIMessage> = {
    api: workflowChatUrl(getClient(), "/api/chat"),
    fetch: (input, init) => fetchWorkflowResponse(getClient(), input, init),
    onChatSendMessage: (response) => {
      const runId = response.headers.get("x-workflow-run-id");
      if (!runId) throw new Error("Chat response did not include a workflow run id.");
      onRunStarted(runId);
    },
    onChatEnd: onRunFinished,
    prepareSendMessagesRequest: async ({ messages }) => {
      const client = getClient();
      const request = await resolveWorkflowChatRequestConfig(client);
      const clientTools = await getClientTools?.();
      const body: WorkflowChatRequestBody = {
        conversationId: client.conversationId,
        messages,
        requestId: crypto.randomUUID(),
      };
      if (client.modelPreference !== undefined) body.modelPreference = client.modelPreference;
      if (clientTools && clientTools.length > 0) body.clientTools = clientTools;
      return applyRequestConfig({ api: workflowChatUrl(client, "/api/chat"), body }, request);
    },
    prepareReconnectToStreamRequest: async ({ api }) => {
      const client = getClient();
      const request = await resolveWorkflowChatRequestConfig(client);
      // A cold load has no SDK run id, so the SDK's fallback url targets the
      // conversation id; a discovered run id rewrites it to that run's stream.
      const runId = getReconnectRunId?.();
      const url = runId
        ? workflowChatUrl(client, `/api/chat/${encodeURIComponent(runId)}/stream`)
        : toServiceUrl(client, api);
      return applyRequestConfig({ api: url }, request);
    },
  };
  if (client.maxConsecutiveErrors !== undefined) {
    transportOptions.maxConsecutiveErrors = client.maxConsecutiveErrors;
  }
  const transport = new WorkflowChatTransport<WorkflowUIMessage>(transportOptions);

  return {
    reconnectToStream: (options) => transport.reconnectToStream(toReconnectOptions(options)),
    sendMessages: (options) => transport.sendMessages(toSendOptions(options)),
  };
}

async function fetchWorkflowResponse(
  client: WorkflowChatClient,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await workflowChatFetch(client)(input, init);
  if (!response.body || !init?.signal) return response;

  return new Response(closeBodyCalmlyOnAbort(response.body, init.signal), {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

/** Let Workflow reconnect observe the aborted signal without logging a stream failure. */
function closeBodyCalmlyOnAbort(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          controller.close();
          return;
        }
        controller.enqueue(result.value);
      } catch (error) {
        if (signal.aborted) {
          controller.close();
          return;
        }
        controller.error(error);
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });
}

type AiSdkSendOptions = Parameters<ChatTransport<WorkflowUIMessage>["sendMessages"]>[0];
type AiSdkReconnectOptions = Parameters<ChatTransport<WorkflowUIMessage>["reconnectToStream"]>[0];

/** Keep AI SDK 7's explicit undefineds out of Workflow's exact optional fields. */
const toSendOptions = (
  options: AiSdkSendOptions,
): SendMessagesOptions<WorkflowUIMessage> & ChatRequestOptions => {
  const result: SendMessagesOptions<WorkflowUIMessage> & ChatRequestOptions = {
    chatId: options.chatId,
    messages: options.messages,
    trigger: options.trigger,
  };
  if (options.abortSignal !== undefined) result.abortSignal = options.abortSignal;
  if (options.body !== undefined) result.body = options.body;
  if (options.headers !== undefined) result.headers = options.headers;
  if (options.messageId !== undefined) result.messageId = options.messageId;
  if (options.metadata !== undefined) result.metadata = options.metadata;
  return result;
};

const toReconnectOptions = (
  options: AiSdkReconnectOptions,
): ReconnectToStreamOptions & ChatRequestOptions => {
  const result: ReconnectToStreamOptions & ChatRequestOptions = {
    chatId: options.chatId,
  };
  if (options.body !== undefined) result.body = options.body;
  if (options.headers !== undefined) result.headers = options.headers;
  if (options.metadata !== undefined) result.metadata = options.metadata;
  return result;
};

type WorkflowChatRequestBody = {
  readonly conversationId: string;
  readonly messages: WorkflowUIMessage[];
  readonly requestId: string;
  clientTools?: readonly WorkflowClientToolDefinition[];
  modelPreference?: string;
};

type PreparedWorkflowRequest = {
  api?: string;
  body?: object;
  credentials?: RequestCredentials;
  headers?: HeadersInit;
};

const applyRequestConfig = <Request extends PreparedWorkflowRequest>(
  result: Request,
  config: Awaited<ReturnType<typeof resolveWorkflowChatRequestConfig>>,
): Request => {
  if (config.credentials !== undefined) result.credentials = config.credentials;
  if (config.headers !== undefined) result.headers = config.headers;
  return result;
};

function toServiceUrl(client: WorkflowChatClient, api: string): string {
  if (/^https?:\/\//u.test(api)) return api;
  return workflowChatUrl(client, api.startsWith("/") ? api : `/${api}`);
}

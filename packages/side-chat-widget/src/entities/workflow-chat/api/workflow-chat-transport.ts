import {
  WorkflowChatTransport,
  type ReconnectToStreamOptions,
  type SendMessagesOptions,
  type WorkflowChatTransportOptions,
} from "@ai-sdk/workflow";
import type { ChatRequestOptions, ChatTransport } from "ai";
import type {
  HostClientToolDefinition,
  HostContext,
  HostContextRequest,
} from "@side-chat/host-bridge";
import { SIDE_CHAT_CLIENT_TOOL_CAPABILITY } from "@side-chat/stream-profile";

import {
  readWorkflowChatHttpError,
  resolveWorkflowChatRequestConfig,
  workflowChatFetch,
  workflowChatUrl,
  type WorkflowConversationClient,
  type WorkflowUIMessage,
} from "../model/workflow-chat-client.js";

type CreateWorkflowChatTransportInput = Readonly<{
  getClient: () => WorkflowConversationClient;
  getHostContext?: WorkflowHostContextCollector | undefined;
  getClientTools?:
    | (() =>
        | readonly WorkflowClientToolDefinition[]
        | Promise<readonly WorkflowClientToolDefinition[]>)
    | undefined;
  clientToolCapability?: string | undefined;
  onRunStarted: (runId: string) => void;
  onRunFinished: () => void;
  /** The run to reattach to on a cold-load reconnect, when discovery found one. */
  getReconnectRunId?: (() => string | undefined) | undefined;
  onReconnectStarted?: (() => void) | undefined;
  onReconnectConnected?: (() => void) | undefined;
}>;

type WorkflowHostContext = HostContext;
type WorkflowHostContextCollector = (
  request: HostContextRequest,
) => Promise<WorkflowHostContext | undefined>;

/** Transport-facing name for the client-tool definition owned by host-bridge. */
export type WorkflowClientToolDefinition = HostClientToolDefinition;

type AiSdkSendOptions = Parameters<ChatTransport<WorkflowUIMessage>["sendMessages"]>[0];
type AiSdkReconnectOptions = Parameters<ChatTransport<WorkflowUIMessage>["reconnectToStream"]>[0];
type WorkflowReconnectOptions = AiSdkReconnectOptions &
  Pick<ReconnectToStreamOptions, "abortSignal">;

type SideChatWorkflowTransport = Omit<ChatTransport<WorkflowUIMessage>, "reconnectToStream"> & {
  reconnectToStream: (
    options: WorkflowReconnectOptions,
  ) => ReturnType<ChatTransport<WorkflowUIMessage>["reconnectToStream"]>;
};

/**
 * Boundary mental model: preparation reads the latest widget and host state,
 * delivery maps HTTP failures, and the AI SDK owns stream retries and decoding.
 *
 * Every callback resolves `getClient()` at request time, so auth refresh, model
 * selection, and credentials never become captured mount-time values.
 */
export function createWorkflowChatTransport(
  input: CreateWorkflowChatTransportInput,
): SideChatWorkflowTransport {
  const transport = new WorkflowChatTransport<WorkflowUIMessage>(
    createWorkflowTransportOptions(input),
  );

  return {
    reconnectToStream: (options) => transport.reconnectToStream(toReconnectOptions(options)),
    sendMessages: (options) => transport.sendMessages(toSendOptions(options)),
  };
}

function createWorkflowTransportOptions(
  input: CreateWorkflowChatTransportInput,
): WorkflowChatTransportOptions<WorkflowUIMessage> {
  const client = input.getClient();
  const transportOptions: WorkflowChatTransportOptions<WorkflowUIMessage> = {
    api: workflowChatUrl(client, "/api/chat"),
    fetch: (request, init) =>
      fetchWorkflowResponse(input.getClient(), request, init, {
        onReconnectConnected: input.onReconnectConnected,
        onReconnectStarted: input.onReconnectStarted,
      }),
    onChatSendMessage: (response) => {
      const runId = response.headers.get("x-workflow-run-id");
      if (!runId) throw new Error("Chat response did not include a workflow run id.");
      input.onRunStarted(runId);
    },
    onChatEnd: input.onRunFinished,
    prepareSendMessagesRequest: ({ messages }) => prepareWorkflowSendRequest(input, messages),
    prepareReconnectToStreamRequest: ({ api }) => prepareWorkflowReconnectRequest(input, api),
  };
  if (client.maxConsecutiveErrors !== undefined) {
    transportOptions.maxConsecutiveErrors = client.maxConsecutiveErrors;
  }
  return transportOptions;
}

async function prepareWorkflowSendRequest(
  input: CreateWorkflowChatTransportInput,
  messages: WorkflowUIMessage[],
): Promise<PreparedWorkflowSendRequest> {
  const client = input.getClient();
  const requestConfig = await resolveWorkflowChatRequestConfig(client);
  const requestId = crypto.randomUUID();
  const clientTools = await input.getClientTools?.();
  const hostContext = await input.getHostContext?.({ requestId });
  const body = createWorkflowChatRequestBody(client, messages, requestId, clientTools, hostContext);
  const request = applyRequestConfig<PreparedWorkflowSendRequest>(
    { api: workflowChatUrl(client, "/api/chat"), body },
    requestConfig,
  );
  addClientToolCapability(request, clientTools, input.clientToolCapability);
  return request;
}

function createWorkflowChatRequestBody(
  client: WorkflowConversationClient,
  messages: WorkflowUIMessage[],
  requestId: string,
  clientTools: readonly WorkflowClientToolDefinition[] | undefined,
  hostContext: WorkflowHostContext | undefined,
): WorkflowChatRequestBody {
  const body: WorkflowChatRequestBody = {
    conversationId: client.conversationId,
    messages,
    requestId,
  };
  if (client.modelPreference !== undefined) body.modelPreference = client.modelPreference;
  if (client.reasoningEffort !== undefined) body.reasoningEffort = client.reasoningEffort;
  if (client.enabledToolNames !== undefined) body.enabledToolNames = client.enabledToolNames;
  if (clientTools && clientTools.length > 0) body.clientTools = clientTools;
  if (hostContext !== undefined) body.hostContext = hostContext;
  return body;
}

function addClientToolCapability(
  request: PreparedWorkflowSendRequest,
  clientTools: readonly WorkflowClientToolDefinition[] | undefined,
  capability: string | undefined,
): void {
  if (!clientTools || clientTools.length === 0) return;
  if (!capability) throw new Error("Client tools require an originating-tab capability.");
  const headers = new Headers(request.headers);
  headers.set(SIDE_CHAT_CLIENT_TOOL_CAPABILITY.HEADER, capability);
  request.headers = headers;
}

async function prepareWorkflowReconnectRequest(
  input: CreateWorkflowChatTransportInput,
  api: string,
): Promise<PreparedWorkflowRequest> {
  const client = input.getClient();
  const requestConfig = await resolveWorkflowChatRequestConfig(client);
  // A cold load has no SDK run id, so discovery replaces the SDK's conversation
  // fallback with the authoritative run stream while preserving service origin.
  const runId = input.getReconnectRunId?.();
  const url = runId
    ? workflowChatUrl(client, `/api/chat/${encodeURIComponent(runId)}/stream`)
    : toServiceUrl(client, api);
  return applyRequestConfig({ api: url }, requestConfig);
}

async function fetchWorkflowResponse(
  client: WorkflowConversationClient,
  input: RequestInfo | URL,
  init?: RequestInit,
  observer: WorkflowReconnectObserver = {},
): Promise<Response> {
  const isReconnect = init?.method !== "POST";
  if (isReconnect) observer.onReconnectStarted?.();
  const response = await workflowChatFetch(client)(input, init);
  if (!response.ok) throw await readWorkflowChatHttpError(response);
  if (isReconnect && response.body) observer.onReconnectConnected?.();
  if (!response.body || !init?.signal) return response;

  return new Response(closeBodyCalmlyOnAbort(response.body, init.signal), {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

type WorkflowReconnectObserver = Readonly<{
  onReconnectStarted?: (() => void) | undefined;
  onReconnectConnected?: (() => void) | undefined;
}>;

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
  options: WorkflowReconnectOptions,
): ReconnectToStreamOptions & ChatRequestOptions => {
  const result: ReconnectToStreamOptions & ChatRequestOptions = {
    chatId: options.chatId,
  };
  if (options.abortSignal !== undefined) result.abortSignal = options.abortSignal;
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
  enabledToolNames?: readonly string[];
  hostContext?: WorkflowHostContext;
  modelPreference?: string;
  reasoningEffort?: WorkflowConversationClient["reasoningEffort"];
};

type PreparedWorkflowRequest = {
  api?: string;
  body?: object;
  credentials?: RequestCredentials;
  headers?: HeadersInit;
};

type PreparedWorkflowSendRequest = PreparedWorkflowRequest & {
  body: object;
};

const applyRequestConfig = <Request extends PreparedWorkflowRequest>(
  result: Request,
  config: Awaited<ReturnType<typeof resolveWorkflowChatRequestConfig>>,
): Request => {
  if (config.credentials !== undefined) result.credentials = config.credentials;
  if (config.headers !== undefined) result.headers = config.headers;
  return result;
};

function toServiceUrl(client: WorkflowConversationClient, api: string): string {
  if (/^https?:\/\//u.test(api)) return api;
  return workflowChatUrl(client, api.startsWith("/") ? api : `/${api}`);
}

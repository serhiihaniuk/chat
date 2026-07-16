import { isRecord, type JsonValue } from "@side-chat/shared";
import { SIDE_CHAT_CLIENT_TOOL_CAPABILITY } from "@side-chat/stream-profile";

import {
  readWorkflowChatHttpError,
  resolveWorkflowChatRequestConfig,
  workflowChatFetch,
  WorkflowChatHttpError,
  workflowChatUrl,
  type WorkflowChatClient,
} from "./workflow-chat-client.js";

// The durable hook is created just after the run starts, so an interaction POST
// can briefly beat it and get a 409; retry a few times with the server's backoff.
const HOOK_NOT_READY_STATUS = 409;
const MAX_HOOK_RETRY_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 5_000;

export type WorkflowApprovalDecisionAcknowledgement = Readonly<{
  readonly approvalId: string;
  readonly state: string;
  readonly accepted: boolean;
  readonly resumed?: boolean | undefined;
}>;

/** Post one native client-tool outcome to the durable Step 11 hook. */
export async function postWorkflowClientToolOutput(
  client: WorkflowChatClient,
  runId: string,
  toolCallId: string,
  output: JsonValue,
  clientToolCapability: string,
): Promise<void> {
  await postWorkflowJson(
    client,
    `/api/chat/${encodeURIComponent(runId)}/tools/${encodeURIComponent(toolCallId)}/output`,
    { output },
    true,
    clientToolCapability,
  );
}

/** Submit one approval decision to the durable Step 12 endpoint. */
export async function postWorkflowApprovalDecision(
  client: WorkflowChatClient,
  runId: string,
  approvalId: string,
  approved: boolean,
): Promise<WorkflowApprovalDecisionAcknowledgement> {
  const payload = await postWorkflowJson(
    client,
    `/api/chat/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvalId)}`,
    { approved },
    false,
    undefined,
  );
  if (!isRecord(payload) || typeof payload["state"] !== "string") {
    throw new WorkflowChatHttpError(
      "invalid_approval_acknowledgement",
      "Approval response was invalid.",
      false,
    );
  }
  return {
    approvalId: typeof payload["approvalId"] === "string" ? payload["approvalId"] : approvalId,
    state: payload["state"],
    accepted: payload["accepted"] === true,
    resumed: typeof payload["resumed"] === "boolean" ? payload["resumed"] : undefined,
  };
}

async function postWorkflowJson(
  client: WorkflowChatClient,
  path: string,
  body: JsonValue,
  retryNotReady: boolean,
  clientToolCapability: string | undefined,
): Promise<unknown> {
  for (let attempt = 0; ; attempt += 1) {
    const request = await resolveWorkflowChatRequestConfig(client);
    const init = createPostWorkflowRequest(request, body, clientToolCapability);
    const response = await workflowChatFetch(client)(workflowChatUrl(client, path), init);
    if (response.ok) return readJsonIfPresent(response);

    if (shouldRetryNotReady(response, retryNotReady, attempt)) {
      await waitForRetry(response.headers.get("retry-after"));
      continue;
    }
    throw await readWorkflowChatHttpError(response);
  }
}

function shouldRetryNotReady(response: Response, retryNotReady: boolean, attempt: number): boolean {
  return (
    retryNotReady && response.status === HOOK_NOT_READY_STATUS && attempt < MAX_HOOK_RETRY_ATTEMPTS
  );
}

function createPostWorkflowRequest(
  request: Awaited<ReturnType<typeof resolveWorkflowChatRequestConfig>>,
  body: JsonValue,
  clientToolCapability: string | undefined,
): RequestInit {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  if (clientToolCapability !== undefined) {
    headers.set(SIDE_CHAT_CLIENT_TOOL_CAPABILITY.HEADER, clientToolCapability);
  }
  if (!headers.has("x-request-id")) headers.set("x-request-id", crypto.randomUUID());
  return {
    method: "POST",
    body: JSON.stringify(body),
    headers,
    ...(request.credentials === undefined ? {} : { credentials: request.credentials }),
  };
}

async function readJsonIfPresent(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    throw new WorkflowChatHttpError("invalid_json_response", "Response was invalid.", false);
  }
}

async function waitForRetry(value: string | null): Promise<void> {
  const seconds = value === null ? 0 : Number(value);
  const delayMs =
    Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS) : 0;
  if (delayMs === 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

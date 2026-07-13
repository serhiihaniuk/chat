import { isRecord } from "@side-chat/shared";

import {
  createHistoryRequestInit,
  readWorkflowChatHttpError,
  resolveWorkflowChatRequestConfig,
  workflowChatFetch,
  workflowChatUrl,
  type WorkflowChatClient,
} from "./workflow-chat-client.js";

/** One conversation summary for the sidebar and switcher list. */
export type WorkflowConversationSummary = Readonly<{
  id: string;
  /** The service's generated title, or "" before one exists; the UI supplies a fallback. */
  title: string;
  lastMessageAt?: string | undefined;
}>;

/**
 * List this workspace's conversations for the sidebar and switcher.
 *
 * Workspace scope comes from the request auth, not the path. Entries the service
 * has not titled yet return an empty title so the UI can show its new-chat
 * fallback until title generation lands.
 */
export async function readWorkflowConversations(
  client: WorkflowChatClient,
  signal?: AbortSignal,
): Promise<readonly WorkflowConversationSummary[]> {
  const request = await resolveWorkflowChatRequestConfig(client);
  const response = await workflowChatFetch(client)(
    workflowChatUrl(client, "/api/conversations"),
    createHistoryRequestInit(request, signal),
  );
  if (!response.ok) throw await readWorkflowChatHttpError(response);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload["conversations"])) {
    throw new Error("Conversation list response is invalid.");
  }
  const summaries: WorkflowConversationSummary[] = [];
  for (const entry of payload["conversations"]) {
    const summary = toConversationSummary(entry);
    if (summary) summaries.push(summary);
  }
  return summaries;
}

function toConversationSummary(entry: unknown): WorkflowConversationSummary | undefined {
  if (!isRecord(entry) || typeof entry["id"] !== "string") return undefined;
  const title = typeof entry["title"] === "string" ? entry["title"] : "";
  const lastMessageAt =
    typeof entry["lastMessageAt"] === "string" ? entry["lastMessageAt"] : undefined;
  return { id: entry["id"], title, lastMessageAt };
}

/** One selectable turn model exposed by the workflow service. */
export type WorkflowModel = Readonly<{ id: string; provider?: string | undefined }>;

/** The workflow service's turn model catalog and its default selection. */
export type WorkflowModelCatalog = Readonly<{
  models: readonly WorkflowModel[];
  defaultModelId: string | undefined;
}>;

/** Read the workflow service's turn model catalog for the composer selector. */
export async function readWorkflowModels(
  client: WorkflowChatClient,
  signal?: AbortSignal,
): Promise<WorkflowModelCatalog> {
  const request = await resolveWorkflowChatRequestConfig(client);
  const response = await workflowChatFetch(client)(
    workflowChatUrl(client, "/api/models"),
    createHistoryRequestInit(request, signal),
  );
  if (!response.ok) throw await readWorkflowChatHttpError(response);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload["models"])) {
    throw new Error("Model catalog response is invalid.");
  }
  const models: WorkflowModel[] = [];
  for (const entry of payload["models"]) {
    const model = toWorkflowModel(entry);
    if (model) models.push(model);
  }
  const defaultModelId =
    typeof payload["defaultModelId"] === "string" ? payload["defaultModelId"] : undefined;
  return { models, defaultModelId };
}

function toWorkflowModel(entry: unknown): WorkflowModel | undefined {
  if (!isRecord(entry) || typeof entry["id"] !== "string") return undefined;
  const provider = typeof entry["provider"] === "string" ? entry["provider"] : undefined;
  return { id: entry["id"], provider };
}

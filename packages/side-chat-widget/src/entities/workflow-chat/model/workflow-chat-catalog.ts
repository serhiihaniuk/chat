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
export type WorkflowModel = Readonly<{
  id: string;
  provider?: string | undefined;
  contextWindowTokens: number;
}>;

/** The workflow service's turn model catalog and its default selection. */
export type WorkflowModelCatalog = Readonly<{
  models: readonly WorkflowModel[];
  defaultModelId: string | undefined;
}>;

/** One trusted server tool exposed through the safe composer display contract. */
export type WorkflowTool = Readonly<{
  name: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}>;

export type WorkflowToolCatalog = Readonly<{ tools: readonly WorkflowTool[] }>;

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

/** Read and strictly validate the server-tool display catalog. */
export async function readWorkflowTools(
  client: WorkflowChatClient,
  signal?: AbortSignal,
): Promise<WorkflowToolCatalog> {
  const request = await resolveWorkflowChatRequestConfig(client);
  const response = await workflowChatFetch(client)(
    workflowChatUrl(client, "/api/tools"),
    createHistoryRequestInit(request, signal),
  );
  if (!response.ok) throw await readWorkflowChatHttpError(response);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !hasOnlyKeys(payload, ["tools"]) || !Array.isArray(payload["tools"])) {
    throw new Error("Tool catalog response is invalid.");
  }
  const tools = payload["tools"].map(toWorkflowTool);
  const validTools = tools.filter((tool): tool is WorkflowTool => tool !== undefined);
  if (
    validTools.length !== tools.length ||
    new Set(validTools.map((tool) => tool.name)).size !== validTools.length
  ) {
    throw new Error("Tool catalog response is invalid.");
  }
  return { tools: validTools };
}

function toWorkflowTool(entry: unknown): WorkflowTool | undefined {
  if (!isRecord(entry)) return undefined;
  if (!hasOnlyKeys(entry, ["name", "label", "description", "defaultEnabled"])) return undefined;
  const name = entry["name"];
  const label = entry["label"];
  const description = entry["description"];
  const defaultEnabled = entry["defaultEnabled"];
  if (!isTrimmedText(name) || !isTrimmedText(label) || !isTrimmedText(description)) {
    return undefined;
  }
  if (typeof defaultEnabled !== "boolean") return undefined;
  return { name, label, description, defaultEnabled };
}

function isTrimmedText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return (
    Object.keys(value).every((key) => allowed.has(key)) && Object.keys(value).length === keys.length
  );
}

function toWorkflowModel(entry: unknown): WorkflowModel | undefined {
  if (!isRecord(entry) || typeof entry["id"] !== "string") return undefined;
  const contextWindowTokens = entry["contextWindowTokens"];
  if (
    typeof contextWindowTokens !== "number" ||
    !Number.isSafeInteger(contextWindowTokens) ||
    contextWindowTokens <= 0
  ) {
    return undefined;
  }
  const provider = typeof entry["provider"] === "string" ? entry["provider"] : undefined;
  return { id: entry["id"], provider, contextWindowTokens };
}

/**
 * Parent-side iframe harness.
 *
 * This page deliberately uses the same public host-context registration API as
 * a real embedding application. Commands and tools keep their older harness
 * messages; page context travels through its own exact-origin, correlated seam.
 */
import { isRecord } from "@side-chat/shared";
import { registerIframeHostContextProvider } from "@side-chat/host-bridge";

import {
  HOST_TOOL_CALL_MESSAGE_TYPE,
  HOST_TOOL_RESULT_MESSAGE_TYPE,
} from "#host/post-message-host-bridge";

const SET_OPEN_MESSAGE_TYPE = "sidechat.widget.setOpen";
const OPEN_CHANGE_MESSAGE_TYPE = "sidechat.widget.openChange";
const READY_MESSAGE_TYPE = "sidechat.widget.ready";

type WorkbenchRecord = {
  readonly id: string;
  readonly label: string;
};

type WorkbenchToolCall = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: Record<string, unknown>;
};

type WorkbenchResult = {
  readonly status: "applied" | "failed" | "unsupported";
  readonly resultCode: string;
  readonly data?: { readonly persisted: boolean };
};

const frame = requireElement<HTMLIFrameElement>("#assistant-frame");
const button = requireElement<HTMLButtonElement>("#assistant-toggle");
const recordList = requireElement<HTMLUListElement>("#record-list");
const statusElement = requireElement<HTMLParagraphElement>("#host-status");
const params = new URLSearchParams(window.location.search);
let open = params.get("open") === "true";
let activeRecordId: string | undefined;

const framePath = params.get("framePath") ?? "/side-chat-frame/";
const frameUrl = new URL(framePath, window.location.origin);
frameUrl.searchParams.set("mode", "service");
frameUrl.searchParams.set("workspaceId", params.get("workspaceId") ?? "workspace_e2e");
frameUrl.searchParams.set("authToken", params.get("authToken") ?? "local-compose-token");
frameUrl.searchParams.set("apiBaseUrl", params.get("apiBaseUrl") ?? "/side-chat-api");
frameUrl.searchParams.set("openControl", "host");
frameUrl.searchParams.set("open", String(open));

const records: WorkbenchRecord[] = [
  { id: "ticket-4821", label: "Support ticket #4821" },
  { id: "invoice-1042", label: "Invoice #1042" },
  { id: "customer-acme", label: "Customer · Acme Corp" },
];

renderRecords();

const frameWindow = requireFrameWindow(frame);

const unregisterContextProvider = registerIframeHostContextProvider({
  frame: frameWindow,
  targetOrigin: frameUrl.origin,
  getContext: (request) =>
    Promise.resolve({
      schemaVersion: "widget-harness.host-context.v1",
      collectedAt: new Date().toISOString(),
      origin: window.location.origin,
      // The harness URL carries its local auth token. Never copy query values
      // into the page snapshot merely because the host can see them.
      url: `${window.location.origin}${window.location.pathname}`,
      title: document.title,
      metadata: {
        mode: "service",
        requestId: request.requestId,
        workspaceId: frameUrl.searchParams.get("workspaceId") ?? "workspace_e2e",
      },
      surface: activeRecordId
        ? {
            surfaceId: activeRecordId,
            resourceType: "record",
            resourceId: activeRecordId,
          }
        : { surfaceId: "workbench-record-list", resourceType: "workbench" },
    }),
});

window.addEventListener("beforeunload", unregisterContextProvider, { once: true });
frame.src = frameUrl.toString();
frame.addEventListener("load", sendOpenState);
button.addEventListener("click", () => {
  open = !open;
  sendOpenState();
});
window.addEventListener("message", receiveFrameMessage);

function receiveFrameMessage(event: MessageEvent<unknown>): void {
  if (event.source !== frameWindow || event.origin !== frameUrl.origin || !isRecord(event.data)) {
    return;
  }

  const data = event.data;
  if (data["type"] === READY_MESSAGE_TYPE) {
    sendOpenState();
    return;
  }

  if (data["type"] === HOST_TOOL_CALL_MESSAGE_TYPE) {
    const toolCall = readToolCall(data["toolCall"]);
    if (!toolCall) return;
    postToolResult(
      toolCall.toolCallId,
      handleHostToolCall(toolCall),
    );
    return;
  }

  if (data["type"] !== OPEN_CHANGE_MESSAGE_TYPE || typeof data["open"] !== "boolean") return;
  open = data["open"];
  sendOpenState();
}

function handleHostToolCall(toolCall: WorkbenchToolCall): WorkbenchResult {
  if (toolCall.toolName !== "open_resource") {
    return { status: "unsupported", resultCode: "unknown_tool" };
  }

  const resourceId = toolCall.input["resourceId"];
  if (typeof resourceId !== "string") {
    return { status: "failed", resultCode: "missing_resource_id" };
  }

  if (!records.some((record) => record.id === resourceId)) {
    records.push({ id: resourceId, label: resourceId });
  }
  activeRecordId = resourceId;
  renderRecords();
  statusElement.textContent = `Assistant opened: ${resourceId}`;
  return {
    status: "applied",
    resultCode: "workbench_opened",
    data: { persisted: false },
  };
}

function sendOpenState(): void {
  frameWindow.postMessage({ type: SET_OPEN_MESSAGE_TYPE, open }, frameUrl.origin);
  frame.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  button.textContent = open ? "Close assistant" : "Open assistant";
}

function postToolResult(toolCallId: string, result: WorkbenchResult): void {
  frameWindow.postMessage(
    { type: HOST_TOOL_RESULT_MESSAGE_TYPE, toolCallId, result },
    frameUrl.origin,
  );
}

function renderRecords(): void {
  recordList.replaceChildren(
    ...records.map((record) => {
      const item = document.createElement("li");
      if (record.id === activeRecordId) item.className = "active";
      const label = document.createElement("span");
      label.textContent = record.label;
      item.append(label);
      if (record.id === activeRecordId) {
        const badge = document.createElement("span");
        badge.className = "open";
        badge.textContent = "● Open";
        item.append(badge);
      }
      return item;
    }),
  );
}

function readToolCall(value: unknown): WorkbenchToolCall | undefined {
  if (!isRecord(value)) return undefined;
  const toolCallId = readString(value["toolCallId"]);
  const toolName = readString(value["toolName"]);
  if (!toolCallId || !toolName) return undefined;
  return {
    toolCallId,
    toolName,
    input: isRecord(value["input"]) ? value["input"] : {},
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Missing workbench element: ${selector}`);
  return element;
}

function requireFrameWindow(iframe: HTMLIFrameElement): Window {
  const contentWindow = iframe.contentWindow;
  if (!contentWindow) throw new Error("The workbench iframe window is unavailable.");
  return contentWindow;
}

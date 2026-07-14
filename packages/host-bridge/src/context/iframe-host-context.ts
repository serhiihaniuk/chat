import { isRecord } from "@side-chat/shared";

import type {
  HostContextProvider,
  HostContextRequest,
  HostContextSnapshot,
} from "./host-context.js";
import {
  assertExactIframeOrigin,
  IFRAME_HOST_CONTEXT_MESSAGE,
  isIframeConnectMessage,
  isMatchingIframeConnectionMessage,
  parseIframeHostContextSnapshot,
  readIframeContextRequestMessage,
  readIframeContextResponse,
  readIframeTimeout,
  type IframeContextRequestMessage,
} from "./iframe-host-context-message.js";
const PROVIDER_ERROR_MESSAGE = "The host page could not provide page context.";
const RESPONSE_ERROR_MESSAGE = "The host page returned invalid page context.";
const TIMEOUT_ERROR_MESSAGE = "The host page did not respond with page context.";

export type RegisterIframeHostContextProviderOptions = Readonly<{
  /** Exact child frame window allowed to request context. */
  frame: Window;
  /** Exact origin of the child frame. Wildcards are rejected. */
  targetOrigin: string;
  /** Collect a fresh snapshot for each opted-in send or regenerate. */
  getContext: HostContextProvider["getContext"];
}>;

export type ConnectIframeHostContextProviderOptions = Readonly<{
  /** Exact origin of the parent host. Wildcards are rejected. */
  targetOrigin: string;
  /** Handshake and per-request timeout. */
  timeoutMs?: number | undefined;
}>;

/**
 * Register one page-context callback in the iframe parent.
 *
 * The returned cleanup function removes the listener. Source and origin are
 * checked before any provider code runs, and provider failures cross the frame
 * only as a fixed safe error.
 */
export function registerIframeHostContextProvider(
  options: RegisterIframeHostContextProviderOptions,
): () => void {
  assertExactIframeOrigin(options.targetOrigin);
  let activeConnectionId: string | undefined;

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (!isExpectedPeer(event, options.frame, options.targetOrigin)) return;
    const message = event.data;
    if (!isRecord(message)) return;

    if (isIframeConnectMessage(message)) {
      const connectionId = readId(message["connectionId"]);
      if (!connectionId) return;
      activeConnectionId = connectionId;
      options.frame.postMessage(
        { type: IFRAME_HOST_CONTEXT_MESSAGE.AVAILABLE, connectionId },
        options.targetOrigin,
      );
      return;
    }

    if (message["type"] !== IFRAME_HOST_CONTEXT_MESSAGE.REQUEST) return;
    const request = readIframeContextRequestMessage(message, activeConnectionId);
    if (!request) return;
    void answerContextRequest(options, request);
  };

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

/**
 * Connect an iframe child to a parent registration.
 *
 * Absence is represented by `undefined`, allowing the widget to hide the menu
 * row. Once connected, each `getContext` call performs a new correlated request.
 */
export async function connectIframeHostContextProvider(
  options: ConnectIframeHostContextProviderOptions,
): Promise<HostContextProvider | undefined> {
  assertExactIframeOrigin(options.targetOrigin);
  if (window.parent === window) return undefined;
  const timeoutMs = readIframeTimeout(options.timeoutMs);
  const connectionId = crypto.randomUUID();
  const connected = await waitForConnection(
    window.parent,
    options.targetOrigin,
    connectionId,
    timeoutMs,
  );
  if (!connected) return undefined;

  return {
    getContext: (request) =>
      requestIframeHostContext(
        window.parent,
        options.targetOrigin,
        connectionId,
        request,
        timeoutMs,
      ),
  };
}

async function answerContextRequest(
  options: RegisterIframeHostContextProviderOptions,
  message: IframeContextRequestMessage,
): Promise<void> {
  try {
    const snapshot = await options.getContext(message.request);
    options.frame.postMessage(
      {
        type: IFRAME_HOST_CONTEXT_MESSAGE.RESPONSE,
        connectionId: message.connectionId,
        correlationId: message.correlationId,
        ok: true,
        snapshot,
      },
      options.targetOrigin,
    );
  } catch {
    options.frame.postMessage(
      {
        type: IFRAME_HOST_CONTEXT_MESSAGE.RESPONSE,
        connectionId: message.connectionId,
        correlationId: message.correlationId,
        ok: false,
      },
      options.targetOrigin,
    );
  }
}

function waitForConnection(
  parent: Window,
  targetOrigin: string,
  connectionId: string,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (!isExpectedPeer(event, parent, targetOrigin)) return;
      if (
        !isMatchingIframeConnectionMessage(
          event.data,
          IFRAME_HOST_CONTEXT_MESSAGE.AVAILABLE,
          connectionId,
        )
      ) {
        return;
      }
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(true);
    };
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(false);
    }, timeoutMs);
    window.addEventListener("message", onMessage);
    parent.postMessage({ type: IFRAME_HOST_CONTEXT_MESSAGE.CONNECT, connectionId }, targetOrigin);
  });
}

function requestIframeHostContext(
  parent: Window,
  targetOrigin: string,
  connectionId: string,
  request: HostContextRequest,
  timeoutMs: number,
): Promise<HostContextSnapshot> {
  const correlationId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error(TIMEOUT_ERROR_MESSAGE));
    }, timeoutMs);
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (!isExpectedPeer(event, parent, targetOrigin)) return;
      const response = readIframeContextResponse(event.data, connectionId, correlationId);
      if (!response) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (!response.ok) {
        reject(new Error(PROVIDER_ERROR_MESSAGE));
        return;
      }
      const snapshot = parseIframeHostContextSnapshot(response.snapshot);
      if (!snapshot) {
        reject(new Error(RESPONSE_ERROR_MESSAGE));
        return;
      }
      resolve(snapshot);
    };
    window.addEventListener("message", onMessage);
    parent.postMessage(
      {
        type: IFRAME_HOST_CONTEXT_MESSAGE.REQUEST,
        connectionId,
        correlationId,
        request,
      },
      targetOrigin,
    );
  });
}

function readId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isExpectedPeer(event: MessageEvent<unknown>, peer: Window, origin: string): boolean {
  return event.source === peer && event.origin === origin;
}

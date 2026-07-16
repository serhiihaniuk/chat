import {
  startCompiledService,
  type CompiledService,
} from "#adapters/http/testing/compiled-service-process";
import { isRecord } from "@side-chat/shared";
import { BUNDLED_CONFIG_NAMES } from "#config/declaration/bundled-config-catalog";
import { SERVICE_ENV_KEYS } from "#config/declaration/side-chat-config";
import { serviceProcessEnv } from "#config/environment/process-environment";
import {
  PROVIDER_OBSERVATION_PREFIX,
  readProviderObservations,
} from "#testing/scripted-language-model";

export { isRecord };

export type ApiScriptMode =
  | "happy"
  | "cancel-before-first"
  | "cancel-mid"
  | "error-before"
  | "error-mid";

const COMPATIBILITY_FIXTURE = {
  AUTHORIZATION: "Bearer local-test-token",
  CONVERSATION_ID: "conversation-1",
  POLL_INTERVAL_MS: 100,
  PROVIDER_POLL_INTERVAL_MS: 50,
  TIMEOUT_MS: 30_000,
} as const;

/**
 * Owns the compiled service process and the HTTP/polling mechanics shared by
 * the WorkflowAgent compatibility scenarios. Tests keep the assertions; this
 * fixture only drives public routes and reads the scripted provider's output.
 */
export class CompiledCompatibilityFixture {
  readonly #request: typeof fetch;
  readonly #service: CompiledService;

  private constructor(service: CompiledService, request: typeof fetch) {
    this.#request = request;
    this.#service = service;
  }

  static async start(request: typeof fetch): Promise<CompiledCompatibilityFixture> {
    const service = await startCompiledService({
      environment: isolatedCompatibilityEnvironment(),
      configName: BUNDLED_CONFIG_NAMES.FAKE,
      configNameEnvKey: SERVICE_ENV_KEYS.CONFIG_NAME,
      localBaseUrlEnvKey: SERVICE_ENV_KEYS.WORKFLOW_LOCAL_BASE_URL,
      localDataDirectoryEnvKey: SERVICE_ENV_KEYS.WORKFLOW_LOCAL_DATA_DIR,
      providerObservationPrefix: PROVIDER_OBSERVATION_PREFIX,
      targetWorldEnvKey: SERVICE_ENV_KEYS.WORKFLOW_TARGET_WORLD,
    });
    return new CompiledCompatibilityFixture(service, request);
  }

  get baseUrl(): string {
    return this.#service.baseUrl;
  }

  close(): Promise<void> {
    return this.#service.close();
  }

  startCompatibilityTurn(requestId: string, mode: "complete" | "block"): Promise<Response> {
    return this.#request(`${this.baseUrl}/compatibility/turns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId,
        mode,
        messages: [userMessage(requestId)],
      }),
    });
  }

  startApiTurn(requestId: string, mode: ApiScriptMode): Promise<Response> {
    return this.#request(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        authorization: COMPATIBILITY_FIXTURE.AUTHORIZATION,
        "content-type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify({
        requestId,
        conversationId: COMPATIBILITY_FIXTURE.CONVERSATION_ID,
        modelPreference: mode,
        messages: [userMessage(requestId)],
      }),
    });
  }

  replayApiTurn(runId: string, startIndex: number): Promise<Response> {
    return this.#request(`${this.baseUrl}/api/chat/${runId}/stream?startIndex=${startIndex}`, {
      headers: { authorization: COMPATIBILITY_FIXTURE.AUTHORIZATION },
    });
  }

  async waitForSettledConversationState(requestId: string): Promise<Record<string, unknown>> {
    const deadline = Date.now() + COMPATIBILITY_FIXTURE.TIMEOUT_MS;
    while (Date.now() < deadline) {
      const response = await this.#request(
        `${this.baseUrl}/api/conversations/${COMPATIBILITY_FIXTURE.CONVERSATION_ID}/state`,
        { headers: { authorization: COMPATIBILITY_FIXTURE.AUTHORIZATION } },
      );
      if (response.ok) {
        const state: unknown = await response.json();
        if (isRecord(state) && hasSettledRequest(state, requestId)) return state;
      }
      await delay(COMPATIBILITY_FIXTURE.POLL_INTERVAL_MS);
    }
    throw new Error(`Conversation state never settled for ${requestId}:\n${this.output()}`);
  }

  async readJournalShape(runId: string): Promise<Record<string, unknown>> {
    const response = await this.#request(
      `${this.baseUrl}/compatibility/chat-turns/${runId}/journal-shape`,
    );
    const shape: unknown = await response.json();
    if (!isRecord(shape)) throw new Error("Expected journal shape JSON");
    return shape;
  }

  /** The durable run-id hook may not exist until the workflow first suspends. */
  async cancelApiTurn(runId: string): Promise<void> {
    const deadline = Date.now() + COMPATIBILITY_FIXTURE.TIMEOUT_MS;
    while (Date.now() < deadline) {
      const response = await this.#request(`${this.baseUrl}/api/chat/${runId}/cancel`, {
        method: "POST",
        headers: {
          authorization: COMPATIBILITY_FIXTURE.AUTHORIZATION,
          "content-type": "application/json",
        },
        body: JSON.stringify({ conversationId: COMPATIBILITY_FIXTURE.CONVERSATION_ID }),
      });
      if (response.ok) return;
      await delay(COMPATIBILITY_FIXTURE.POLL_INTERVAL_MS);
    }
    throw new Error(`Chat cancel hook never became resumable:\n${this.output()}`);
  }

  /** The durable cancel hook registers when the workflow first suspends. */
  async cancelCompatibilityTurn(requestId: string): Promise<void> {
    const deadline = Date.now() + COMPATIBILITY_FIXTURE.TIMEOUT_MS;
    while (Date.now() < deadline) {
      const response = await this.#request(
        `${this.baseUrl}/compatibility/turns/${requestId}/cancel`,
        { method: "POST" },
      );
      const body: unknown = await response.json();
      if (isRecord(body) && body["cancelled"] === true) return;
      await delay(COMPATIBILITY_FIXTURE.POLL_INTERVAL_MS);
    }
    throw new Error(`Cancel hook never became resumable:\n${this.output()}`);
  }

  async approveWrapperProbe(runId: string, approvalId: string): Promise<void> {
    const deadline = Date.now() + COMPATIBILITY_FIXTURE.TIMEOUT_MS;
    while (Date.now() < deadline) {
      const response = await this.#request(
        `${this.baseUrl}/compatibility/probes/wrapper-approval-gate/${runId}/${approvalId}`,
        { method: "POST" },
      );
      if (response.ok) return;
      await delay(COMPATIBILITY_FIXTURE.POLL_INTERVAL_MS);
    }
    throw new Error(`Approval hook never became resumable:\n${this.output()}`);
  }

  async waitForObservation(requestId: string, event: string): Promise<Record<string, unknown>> {
    const deadline = Date.now() + COMPATIBILITY_FIXTURE.TIMEOUT_MS;
    while (Date.now() < deadline) {
      const observation = this.readObservations(requestId, event)[0];
      if (observation) return observation;
      await delay(COMPATIBILITY_FIXTURE.PROVIDER_POLL_INTERVAL_MS);
    }
    throw new Error(`Provider never reported "${event}" for ${requestId}:\n${this.output()}`);
  }

  countObservations(requestId: string, event: string): number {
    return this.readObservations(requestId, event).length;
  }

  /** Scans captured service stdout for the scripted provider's observation lines. */
  private readObservations(requestId: string, event: string): Array<Record<string, unknown>> {
    return readProviderObservations(this.output(), requestId, event);
  }

  private output(): string {
    return this.#service.output();
  }
}

/** Compatibility runs must never inherit a developer's durable database targets. */
function isolatedCompatibilityEnvironment(): Readonly<Record<string, string | undefined>> {
  return {
    ...serviceProcessEnv(),
    [SERVICE_ENV_KEYS.SIDECHAT_DATABASE_URL]: undefined,
    [SERVICE_ENV_KEYS.WORKFLOW_POSTGRES_URL]: undefined,
  };
}

function userMessage(requestId: string): Record<string, unknown> {
  return {
    id: `user-${requestId}`,
    role: "user",
    parts: [{ type: "text", text: "hello" }],
  };
}

function hasSettledRequest(state: Record<string, unknown>, requestId: string): boolean {
  const messages = state["messages"];
  if (!Array.isArray(messages) || isRecord(state["activeTurn"])) return false;
  return messages.some((message) => isRecord(message) && message["id"] === `user-${requestId}`);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

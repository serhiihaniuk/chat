import { createRuntimeToolFromPromise } from "@side-chat/agent-runtime";
import { createMemorySidechatRepositories } from "@side-chat/db";
import {
  createPartnerAiServiceApp,
  createServiceToolRegistration,
  type ServiceToolRegistration,
} from "@side-chat/partner-ai-service";
import type { JsonObject } from "@side-chat/shared";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

const AUTH = { authorization: "Bearer local-test-token" } as const;

const REVERSE_INPUT_SCHEMA = {
  type: "object",
  properties: { text: { type: "string" } },
  required: ["text"],
  additionalProperties: false,
} as const satisfies JsonObject;

/**
 * An adopter's tool, authored as a plain async function via the promise factory.
 * No Effect knowledge is required before bundling it into one registration.
 */
const reverseToolRegistration = (): ServiceToolRegistration =>
  createServiceToolRegistration({
    capability: {
      name: "example.reverse_text",
      description: "Reverse the characters of a string.",
      inputSchema: REVERSE_INPUT_SCHEMA,
    },
    runtimeTool: createRuntimeToolFromPromise({
      name: "example.reverse_text",
      description: "Reverse the characters of a string.",
      inputSchema: REVERSE_INPUT_SCHEMA,
      run: (input) => {
        const text = typeof input["text"] === "string" ? input["text"] : "";
        return Promise.resolve({ reversed: text.split("").reverse().join("") });
      },
    }),
    defaultEnabled: true,
    label: "Reverse text",
  });

describe("adopter tool registration", () => {
  it("offers a promise-authored tool to the model through the service manifest", async () => {
    const workspace = { tenantId: "tenant_adopt_tool", workspaceId: "workspace_adopt_tool" };
    const app = createPartnerAiServiceApp({
      workspace,
      auth: { profile: "development", workspace },
      repositories: createMemorySidechatRepositories({ idPrefix: "adopt_tool" }),
      runtime: { provider: "fake", tools: [reverseToolRegistration()] },
      resumability: { safetyPollIntervalMs: 10 },
    });

    const response = await app.request("/tools", { headers: AUTH });
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(readToolNames(body)).toContain("example.reverse_text");
  });

  it("runs the promise-authored tool exactly as written", async () => {
    // The registration's executable is the real runtime tool the model would call.
    const result = await Effect.runPromise(
      reverseToolRegistration().runtimeTool.execute(
        { text: "otters" },
        { requestId: "r", assistantTurnId: "t", modelId: "m", toolName: "example.reverse_text" },
      ),
    );

    expect(result).toEqual({ reversed: "sretto" });
  });
});

const readToolNames = (value: unknown): string[] => {
  if (!isRecord(value) || !Array.isArray(value["tools"])) return [];
  return value["tools"].flatMap((tool) => {
    if (!isRecord(tool) || typeof tool["name"] !== "string") return [];
    return [tool["name"]];
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

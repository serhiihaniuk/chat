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
 * An adopter's tool, authored as a plain async function via the promise factory —
 * no Effect knowledge required — then bundled into one registration.
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
    approvalPolicyIds: [],
    label: "Reverse text",
  });

describe("adopter tool registration", () => {
  it("offers a promise-authored tool to the model through the service manifest", async () => {
    const app = createPartnerAiServiceApp({
      repositories: createMemorySidechatRepositories({ idPrefix: "adopt_tool" }),
      runtime: { provider: "fake", tools: [reverseToolRegistration()] },
      resumability: { safetyPollIntervalMs: 10 },
    });

    const response = await app.request("/tools", { headers: AUTH });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      readonly tools: readonly { readonly name: string }[];
    };
    expect(body.tools.map((tool) => tool.name)).toContain("example.reverse_text");
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

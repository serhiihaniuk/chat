import { dynamicTool, jsonSchema } from "ai";
import { describe, expect, it } from "vitest";

import {
  CHAT_TURN_AGENT_ERROR_CODES,
  ChatTurnToolConflictError,
  mergeChatTurnTools,
} from "./chat-turn-agent.js";

describe("mergeChatTurnTools", () => {
  it("reports a typed conflict when client and server tools share a name", () => {
    const searchTool = dynamicTool({
      description: "Search",
      inputSchema: jsonSchema({ type: "object", additionalProperties: false }),
    });
    let conflict: unknown;

    try {
      mergeChatTurnTools({ search: searchTool }, { search: searchTool });
    } catch (error) {
      conflict = error;
    }

    expect(conflict).toBeInstanceOf(ChatTurnToolConflictError);
    expect(conflict).toMatchObject({
      code: CHAT_TURN_AGENT_ERROR_CODES.TOOL_CONFLICT,
      toolName: "search",
    });
  });
});

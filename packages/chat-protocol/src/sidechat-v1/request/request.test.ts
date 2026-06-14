import { describe, expect, it } from "vitest";
import { ProtocolValidationError } from "../errors.js";
import { parseChatStreamRequest } from "./request.js";
import { SIDECHAT_PROTOCOL_VERSION } from "../version.js";

describe("parseChatStreamRequest", () => {
  it("accepts a sidechat.v1 stream request", () => {
    const request = parseChatStreamRequest({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      requestId: "req_001",
      conversationId: "conv_001",
      message: { id: "msg_001", role: "user", content: "Explain this" },
      hostContext: {
        schemaVersion: "host.v1",
        origin: "https://host.example",
        metadata: { pageKind: "report" },
      },
    });

    expect(request.requestId).toBe("req_001");
    expect(request.message.role).toBe("user");
    expect(request.hostContext?.schemaVersion).toBe("host.v1");
  });

  it("rejects unsupported protocol versions", () => {
    expect(() =>
      parseChatStreamRequest({
        protocolVersion: "sidechat.v2",
        requestId: "req_001",
        message: { id: "msg_001", role: "user", content: "Hello" },
      }),
    ).toThrow(ProtocolValidationError);
  });
});

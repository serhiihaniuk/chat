import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ProtocolSequenceError } from "#sidechat-v1/errors";
import { validateSidechatEventSequence } from "#sidechat-v1/sequence";
import { parseSidechatStreamEvent } from "#sidechat-v1/validation";

const fixtureDir = dirname(fileURLToPath(import.meta.url));

const readFixture = (name: string): unknown[] => {
  const text = readFileSync(join(fixtureDir, name), "utf8");
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${name} must be an array`);
  return parsed;
};

describe("sidechat protocol fixtures", () => {
  it("validates the golden success stream", () => {
    const events = readFixture("success-stream.json").map(
      parseSidechatStreamEvent,
    );
    expect(validateSidechatEventSequence(events).eventCount).toBe(5);
  });

  it("validates the golden error stream", () => {
    const events = readFixture("error-stream.json").map(
      parseSidechatStreamEvent,
    );
    expect(validateSidechatEventSequence(events).terminalEvent.type).toBe(
      "sidechat.error",
    );
  });

  it("rejects the malformed golden stream", () => {
    const events = readFixture("malformed-stream.json").map(
      parseSidechatStreamEvent,
    );
    expect(() => validateSidechatEventSequence(events)).toThrow(
      ProtocolSequenceError,
    );
  });
});

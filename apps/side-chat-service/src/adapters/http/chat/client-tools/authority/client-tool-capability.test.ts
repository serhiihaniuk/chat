import { describe, expect, it } from "vitest";

import { digestClientToolCapability } from "./client-tool-capability.js";

describe("digestClientToolCapability", () => {
  it("accepts one 256-bit lowercase hexadecimal capability", () => {
    expect(digestClientToolCapability("a".repeat(64))).toMatch(/^[0-9a-f]{64}$/u);
  });

  it.each([undefined, "", "a".repeat(63), "A".repeat(64), "g".repeat(64)])(
    "rejects malformed capability %s",
    (value) => {
      expect(digestClientToolCapability(value)).toBeUndefined();
    },
  );
});

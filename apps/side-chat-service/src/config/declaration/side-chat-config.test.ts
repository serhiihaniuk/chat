import { describe, expect, it } from "vitest";

import { ENV_REFERENCE_KINDS, ENV_VALUE_TYPES, readEnv } from "./side-chat-config.js";

describe("readEnv", () => {
  it("keeps the inline description on the environment reference", () => {
    expect(
      readEnv.secret("SIDECHAT_TEST_SECRET", {
        description: "Credential used by the test provider.",
      }),
    ).toEqual({
      kind: ENV_REFERENCE_KINDS.ENV,
      key: "SIDECHAT_TEST_SECRET",
      description: "Credential used by the test provider.",
      valueType: ENV_VALUE_TYPES.STRING,
      required: true,
      secret: true,
    });
  });

  it("rejects a blank description", () => {
    expect(() => readEnv("SIDECHAT_TEST_VALUE", { description: " " })).toThrow(
      "requires a description",
    );
  });
});

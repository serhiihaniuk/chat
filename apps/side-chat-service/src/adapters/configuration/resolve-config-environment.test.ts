import { describe, expect, it } from "vitest";

import { readEnv } from "#ports/configuration/side-chat-config";

import { resolveConfigEnvironment } from "./resolve-config-environment.js";

const TEST_SECRET_ENV_KEY = "SIDECHAT_SECRET";

describe("configuration environment adapter", () => {
  it("reports missing secrets by key without exposing values", () => {
    const config = { credential: readEnv.secret(TEST_SECRET_ENV_KEY) };

    const result = resolveConfigEnvironment(config, {});

    expect(result.issues).toEqual([
      { path: "credential", message: `${TEST_SECRET_ENV_KEY} is required` },
    ]);
  });
});

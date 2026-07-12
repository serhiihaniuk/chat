import { describe, expect, it } from "vitest";

import {
  canonicalizeServerToolInput,
  createServerToolInputDigest,
} from "./server-tool-input-digest.js";

describe("server tool input digest", () => {
  it("canonicalizes nested objects independently of insertion order", async () => {
    const first = {
      z: [{ amount: 2, currency: "EUR" }],
      a: { enabled: true, label: null },
    };
    const second = {
      a: { label: null, enabled: true },
      z: [{ currency: "EUR", amount: 2 }],
    };

    expect(canonicalizeServerToolInput(first)).toBe(
      '{"a":{"enabled":true,"label":null},"z":[{"amount":2,"currency":"EUR"}]}',
    );
    await expect(createServerToolInputDigest(first)).resolves.toBe(
      await createServerToolInputDigest(second),
    );
  });

  it("returns the lowercase SHA-256 digest of the canonical value", async () => {
    await expect(createServerToolInputDigest({ action: "create" })).resolves.toBe(
      "e7e4f446ad1ae5e2af6590a040d2d75379b5304927c51104e9519bdac0965184",
    );
  });

  it.each([
    [{ value: undefined }, "undefined field"],
    [{ value: Number.NaN }, "non-finite number"],
    [{ value: Number.POSITIVE_INFINITY }, "infinite number"],
    [{ value: 1n }, "bigint"],
    [{ value: new Date(0) }, "non-plain object"],
    [sparseArray(), "sparse array"],
    [objectWithSymbol(), "symbol-keyed field"],
    [cyclicObject(), "cycle"],
  ])("rejects non-JSON-safe input: %s", async (input, _reason) => {
    await expect(createServerToolInputDigest(input)).rejects.toThrow(TypeError);
  });
});

function sparseArray(): unknown[] {
  const value: unknown[] = [];
  value.length = 2;
  value[1] = "present";
  return value;
}

function objectWithSymbol(): object {
  return { safe: true, [Symbol("hidden")]: "not-json" };
}

function cyclicObject(): object {
  const value: { self?: object } = {};
  value.self = value;
  return value;
}

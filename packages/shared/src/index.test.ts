import { describe, expect, it } from "vitest";
import { optionalField } from "./index.js";

describe("optionalField", () => {
  it("omits nullish values", () => {
    expect(optionalField("traceId", undefined)).toEqual({});
    expect(optionalField("traceId", null)).toEqual({});
  });

  it("preserves present falsy values", () => {
    expect(optionalField("count", 0)).toEqual({ count: 0 });
    expect(optionalField("enabled", false)).toEqual({ enabled: false });
    expect(optionalField("label", "")).toEqual({ label: "" });
  });
});

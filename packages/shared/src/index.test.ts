import { describe, expect, expectTypeOf, it } from "vitest";
import {
  compactJsonObject,
  omitNullishField,
  omitUndefinedField,
  omitUndefinedProperties,
  type OmitUndefinedProperties,
} from "./index.js";

describe("omitUndefinedField", () => {
  it("omits undefined and preserves null", () => {
    expect(omitUndefinedField("traceId", undefined)).toEqual({});
    expect(omitUndefinedField("traceId", null)).toEqual({ traceId: null });
  });

  it("preserves present falsy values", () => {
    expect(omitUndefinedField("count", 0)).toEqual({ count: 0 });
    expect(omitUndefinedField("enabled", false)).toEqual({ enabled: false });
    expect(omitUndefinedField("label", "")).toEqual({ label: "" });
  });
});

describe("omitNullishField", () => {
  it("omits nullish values", () => {
    expect(omitNullishField("traceId", undefined)).toEqual({});
    expect(omitNullishField("traceId", null)).toEqual({});
  });

  it("preserves present falsy values", () => {
    expect(omitNullishField("count", 0)).toEqual({ count: 0 });
    expect(omitNullishField("enabled", false)).toEqual({ enabled: false });
    expect(omitNullishField("label", "")).toEqual({ label: "" });
  });
});

describe("omitUndefinedProperties", () => {
  it("omits undefined properties and preserves null plus falsy values", () => {
    expect(
      omitUndefinedProperties({
        omitted: undefined,
        nullValue: null,
        count: 0,
        enabled: false,
        label: "",
      }),
    ).toEqual({
      nullValue: null,
      count: 0,
      enabled: false,
      label: "",
    });
  });

  it("types undefined-capable fields as optional after compaction", () => {
    type BoundaryInput = {
      readonly traceId: string | undefined;
      readonly conversationId: string | undefined;
      readonly required: string;
      readonly nullish: string | null | undefined;
    };
    type BoundaryOutput = {
      readonly traceId?: string;
      readonly conversationId?: string;
      readonly required: string;
      readonly nullish?: string | null;
    };

    expectTypeOf<BoundaryInput>().not.toMatchTypeOf<BoundaryOutput>();
    expectTypeOf<OmitUndefinedProperties<BoundaryInput>>().toEqualTypeOf<BoundaryOutput>();

    const output: BoundaryOutput = omitUndefinedProperties({
      traceId: undefined,
      conversationId: "conversation",
      required: "required",
      nullish: null,
    } satisfies BoundaryInput);

    expect(output).toEqual({
      conversationId: "conversation",
      required: "required",
      nullish: null,
    });
  });
});

describe("compactJsonObject", () => {
  it("omits undefined while preserving null JSON values", () => {
    expect(compactJsonObject({ kept: "value", omitted: undefined, empty: null })).toEqual({
      kept: "value",
      empty: null,
    });
  });
});

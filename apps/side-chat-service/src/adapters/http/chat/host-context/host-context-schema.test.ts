import { describe, expect, it } from "vitest";

import type { HostContextPolicy } from "#domain/host-context";

import { parseHostContext } from "./host-context-schema.js";

const POLICY: HostContextPolicy = {
  enabled: true,
  maxSerializedBytes: 16_384,
  maxStringLength: 4_096,
  maxMetadataDepth: 8,
  maxMetadataEntries: 128,
};

describe("host context HTTP schema", () => {
  it("accepts the service-owned page-reference contract", () => {
    expect(
      parseHostContext(
        {
          schemaVersion: "host.v1",
          origin: "https://admin.example.test",
          url: "https://admin.example.test/accounts/42",
          title: "Account 42",
          metadata: {
            accountId: "42",
            flags: ["trial", { region: "eu" }],
            score: 12.5,
          },
        },
        POLICY,
      ),
    ).toEqual({
      schemaVersion: "host.v1",
      origin: "https://admin.example.test",
      url: "https://admin.example.test/accounts/42",
      title: "Account 42",
      metadata: {
        accountId: "42",
        flags: ["trial", { region: "eu" }],
        score: 12.5,
      },
    });
  });

  it.each([
    ["unknown top-level key", { schemaVersion: "host.v1", authority: "admin" }],
    ["empty schema version", { schemaVersion: "   " }],
    ["non-object metadata", { schemaVersion: "host.v1", metadata: ["not", "an", "object"] }],
    ["non-finite number", { schemaVersion: "host.v1", metadata: { score: Infinity } }],
    ["oversized direct string", { schemaVersion: "host.v1", title: "x".repeat(4_097) }],
    [
      "oversized metadata key",
      { schemaVersion: "host.v1", metadata: { ["k".repeat(4_097)]: true } },
    ],
    [
      "oversized metadata string",
      { schemaVersion: "host.v1", metadata: { value: "x".repeat(4_097) } },
    ],
    ["excess metadata depth", { schemaVersion: "host.v1", metadata: deepMetadata(9) }],
    ["excess metadata entries", { schemaVersion: "host.v1", metadata: wideMetadata(129) }],
    ["excess serialized bytes", oversizedSerializedContext()],
  ])("rejects %s", (_case, value) => {
    expect(parseHostContext(value, POLICY)).toBeUndefined();
  });
});

function deepMetadata(depth: number): unknown {
  let value: unknown = "leaf";
  for (let level = 0; level < depth; level += 1) value = { child: value };
  return value;
}

function wideMetadata(entries: number): Record<string, boolean> {
  return Object.fromEntries(
    Array.from({ length: entries }, (_, index) => [`entry-${index}`, true]),
  );
}

function oversizedSerializedContext() {
  const value = "x".repeat(POLICY.maxStringLength);
  return {
    schemaVersion: "host.v1",
    origin: value,
    url: value,
    title: value,
    metadata: { value },
  };
}

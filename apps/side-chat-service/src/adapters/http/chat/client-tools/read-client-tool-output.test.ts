import { describe, expect, it } from "vitest";

import {
  CLIENT_TOOL_OUTPUT_MAX_BYTES,
  readCappedBytes,
  readClientToolOutput,
} from "../chat-routes.js";

interface StreamRequestInit extends RequestInit {
  duplex: "half";
}

describe("readCappedBytes", () => {
  it("returns the whole body when it stays under the ceiling", async () => {
    const payload = new TextEncoder().encode("client tool output");

    await expect(readCappedBytes(streamOf(payload), CLIENT_TOOL_OUTPUT_MAX_BYTES)).resolves.toEqual(
      payload,
    );
  });

  it("treats a missing body as empty", async () => {
    await expect(readCappedBytes(null, CLIENT_TOOL_OUTPUT_MAX_BYTES)).resolves.toEqual(
      new Uint8Array(0),
    );
  });

  it("aborts and cancels the source instead of buffering an unbounded body", async () => {
    // The source never ends, so only a cap enforced *during* the read can stop
    // it. If the reader buffered the whole body first, this test would hang.
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024));
      },
      cancel() {
        cancelled = true;
      },
    });

    const bytes = await readCappedBytes(stream, CLIENT_TOOL_OUTPUT_MAX_BYTES);

    expect(bytes).toBeUndefined();
    expect(cancelled).toBe(true);
  });
});

describe("readClientToolOutput", () => {
  it("accepts a well-formed output envelope", async () => {
    const request = new Request("http://local/output", {
      method: "POST",
      body: JSON.stringify({ output: { ok: true } }),
    });

    await expect(readClientToolOutput(request)).resolves.toEqual({
      valid: true,
      output: { value: { ok: true } },
    });
  });

  it("rejects an oversized body whose content-length is absent or dishonest", async () => {
    const request = oversizedStreamRequest();

    // A streamed body carries no content-length, so the streaming cap is the
    // only line of defense; the size hint cannot be trusted to reject it.
    expect(request.headers.get("content-length")).toBeNull();
    await expect(readClientToolOutput(request)).resolves.toEqual({
      valid: false,
      output: {
        value: { status: "failed", errorCode: "invalid_client_tool_output" },
      },
    });
  });
});

function streamOf(payload: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(payload);
      controller.close();
    },
  });
}

function oversizedStreamRequest(): Request {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(4096));
      sent += 4096;
      if (sent > CLIENT_TOOL_OUTPUT_MAX_BYTES + 4096) controller.close();
    },
  });
  const init: StreamRequestInit = { method: "POST", body, duplex: "half" };
  return new Request("http://local/output", init);
}

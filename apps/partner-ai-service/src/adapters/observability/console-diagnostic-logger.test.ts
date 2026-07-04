import { afterEach, describe, expect, it, vi } from "vitest";

import { createJsonConsoleLogger, createPrettyConsoleLogger } from "./console-diagnostic-logger.js";

const FIXED_CLOCK = () => new Date("2026-07-04T09:08:07.006Z");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("console diagnostic loggers", () => {
  it("filters below the configured minimum level", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logger = createPrettyConsoleLogger({ level: "warn", now: FIXED_CLOCK });

    logger.debug("dropped");
    logger.info("dropped");
    logger.warn("kept");

    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("kept");
  });

  it("redacts sensitive field keys at every level", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const logger = createPrettyConsoleLogger({ level: "debug", now: FIXED_CLOCK });

    logger.info("turn", {
      model: "fake-echo",
      prompt: "the secret system prompt",
      apiKey: "sk-123",
    });

    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain("model=fake-echo");
    expect(line).not.toContain("the secret system prompt");
    expect(line).not.toContain("sk-123");
    expect(line).toContain("[redacted]");
  });

  it("formats a pretty line as time, level, message, then fields", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    createPrettyConsoleLogger({ level: "info", now: FIXED_CLOCK }).info("service ready", {
      port: 8787,
    });

    expect(log.mock.calls[0]?.[0]).toBe("09:08:07.006 INFO  service ready port=8787");
  });

  it("formats a json line as one object per line", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    createJsonConsoleLogger({ level: "info", now: FIXED_CLOCK }).info("service ready", {
      port: 8787,
    });

    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      time: "2026-07-04T09:08:07.006Z",
      level: "info",
      message: "service ready",
      port: 8787,
    });
  });

  it("routes warn and error to stderr", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logger = createJsonConsoleLogger({ level: "debug", now: FIXED_CLOCK });

    logger.warn("a warning");
    logger.error("an error");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("is fail-open: a throwing console never propagates", () => {
    vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("console is broken");
    });
    const logger = createPrettyConsoleLogger({ level: "debug", now: FIXED_CLOCK });

    expect(() => logger.info("should not throw")).not.toThrow();
  });
});

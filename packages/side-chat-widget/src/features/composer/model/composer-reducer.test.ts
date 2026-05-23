import { describe, expect, it } from "vitest";

import { composerReducer } from "./composer-reducer.js";
import { initialComposerState } from "./composer-state.js";
import { submitComposerMessage } from "./submit-rules.js";

describe("composerReducer", () => {
  it("tracks message input and clears after submit", () => {
    const withMessage = composerReducer(initialComposerState, {
      message: "hello",
      type: "message_changed",
    });

    expect(withMessage).toEqual({ message: "hello" });
    expect(composerReducer(withMessage, { type: "submitted" })).toEqual({
      message: "",
    });
  });
});

describe("submitComposerMessage", () => {
  it("submits trimmed text only when enabled", () => {
    const submitted: string[] = [];

    expect(
      submitComposerMessage("  hello  ", false, (message) =>
        submitted.push(message),
      ),
    ).toBe(true);
    expect(
      submitComposerMessage("blocked", true, (message) =>
        submitted.push(message),
      ),
    ).toBe(false);
    expect(
      submitComposerMessage("   ", false, (message) => submitted.push(message)),
    ).toBe(false);
    expect(submitted).toEqual(["hello"]);
  });
});

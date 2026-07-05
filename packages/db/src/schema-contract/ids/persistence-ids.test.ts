import { describe, expect, it } from "vitest";

import {
  toAssistantMessageId,
  toUserMessageId,
  type AssistantMessageId,
  type UserMessageId,
} from "./persistence-ids.js";

// Type-level guard: user and assistant message ids carry distinct brands, so one is
// never silently accepted where the other is required. The `@ts-expect-error` lines
// fail to compile the moment the brands are merged again (which would make these
// assignments valid), turning a silent regression into a build break.
describe("message id brands", () => {
  it("keeps UserMessageId and AssistantMessageId mutually unassignable", () => {
    const user = toUserMessageId("m_user");
    const assistant = toAssistantMessageId("m_assistant");

    // @ts-expect-error a user id must not satisfy an assistant id slot
    const asAssistant: AssistantMessageId = user;
    // @ts-expect-error an assistant id must not satisfy a user id slot
    const asUser: UserMessageId = assistant;

    expect(String(asAssistant)).toBe("m_user");
    expect(String(asUser)).toBe("m_assistant");
  });
});

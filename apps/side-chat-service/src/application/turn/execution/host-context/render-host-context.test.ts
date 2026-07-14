import { describe, expect, it } from "vitest";

import type { HostContext } from "#domain/host-context";
import { TURN_MESSAGE_ROLES, type TurnMessage } from "#domain/turn/turn";

import { HOST_CONTEXT_TRUST_LABEL, renderHostContextForExecution } from "./render-host-context.js";

const EARLIER_USER: TurnMessage = {
  id: "user-0",
  role: TURN_MESSAGE_ROLES.USER,
  text: "Earlier question",
};
const EARLIER_ASSISTANT: TurnMessage = {
  id: "assistant-0",
  role: TURN_MESSAGE_ROLES.ASSISTANT,
  text: "Earlier answer",
};
const ACCEPTED_USER: TurnMessage = {
  id: "user-1",
  role: TURN_MESSAGE_ROLES.USER,
  text: "Summarize the risks",
};
const MESSAGES = [EARLIER_USER, EARLIER_ASSISTANT, ACCEPTED_USER] as const;
const HOST_CONTEXT: HostContext = {
  schemaVersion: "host.v1",
  origin: "https://admin.example.test",
  url: "https://admin.example.test/releases/7",
  title: "Release 7",
  metadata: { releaseId: 7, confidential: false },
};

describe("renderHostContextForExecution", () => {
  it("leaves execution messages unchanged when host context is absent", () => {
    expect(renderHostContextForExecution(MESSAGES, ACCEPTED_USER, undefined)).toBe(MESSAGES);
  });

  it("augments only the latest accepted user message in an explicitly untrusted user block", () => {
    const rendered = renderHostContextForExecution(MESSAGES, ACCEPTED_USER, HOST_CONTEXT);

    expect(rendered.slice(0, -1)).toEqual([EARLIER_USER, EARLIER_ASSISTANT]);
    expect(rendered.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(rendered.at(-1)).toMatchObject({
      id: ACCEPTED_USER.id,
      role: TURN_MESSAGE_ROLES.USER,
    });
    expect(rendered.at(-1)?.text).toContain(HOST_CONTEXT_TRUST_LABEL);
    expect(rendered.at(-1)?.text).toContain('"title": "Release 7"');
    expect(rendered.at(-1)?.text).toContain('"url": "https://admin.example.test/releases/7"');
    expect(rendered.at(-1)?.text).toContain('"origin": "https://admin.example.test"');
    expect(rendered.at(-1)?.text).toContain('"releaseId": 7');
    expect(rendered.at(-1)?.text).toContain(ACCEPTED_USER.text);
  });
});

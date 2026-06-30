import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import {
  RUNTIME_REASONING_EFFORTS,
  type RuntimeReasoningEffort,
} from "@side-chat/ai-runtime-contract";
import { isRecord, type JsonObject } from "@side-chat/shared";

import type { ScriptedToolCall } from "#testing/scripted-language-model";
import { createDeterministicTitle } from "./fake-title-script.js";
import { createDemoHostCommandCall } from "./fake-host-command-script.js";

export const FAKE_REASONING_EFFORTS = {
  LOW: RUNTIME_REASONING_EFFORTS.LOW,
  MEDIUM: RUNTIME_REASONING_EFFORTS.MEDIUM,
  HIGH: RUNTIME_REASONING_EFFORTS.HIGH,
} as const;

export type FakeReasoningEffort =
  (typeof FAKE_REASONING_EFFORTS)[keyof typeof FAKE_REASONING_EFFORTS];

export const DEFAULT_FAKE_REASONING_EFFORT = FAKE_REASONING_EFFORTS.MEDIUM;

type ToolPromptMessage = Extract<LanguageModelV3CallOptions["prompt"][number], { role: "tool" }>;

const DEMO_MOCK_WEB_SEARCH_TOOL_NAME = "mock_web_search";
const DEMO_TOOL_ACTIVITY_TITLE = "Run mock_web_search";

export const createDeterministicFakeText = (
  options: LanguageModelV3CallOptions,
  effort: RuntimeReasoningEffort,
): string => {
  const userText = lastUserText(options);
  const title = createDeterministicTitle(userText);
  if (title) return title;

  const codename = findPriorProjectCodename(options, userText);
  if (codename) return `Your project codename is ${codename}.`;

  const canned = createShowcaseAnswer(userText, effort, options);
  if (canned) return canned;

  return userText.length > 0 ? `Fake response: ${userText}` : "Fake response.";
};

export const createDemoReasoningText = (
  effort: RuntimeReasoningEffort,
  options?: LanguageModelV3CallOptions,
): string | undefined => {
  const level = normalizeReasoningEffort(effort);
  if (level === undefined) return undefined;

  const body = readDemoToolResult(options)
    ? "Read the mock search result, select the markdown proof points, and stream the final answer with table, code, and source context."
    : {
        [FAKE_REASONING_EFFORTS.LOW]:
          "Read the latest message, choose the smallest useful demo path, and stream a focused answer.",
        [FAKE_REASONING_EFFORTS.MEDIUM]:
          "Read the latest message, check prior chat context, decide whether the mock search tool is available, and stream the showcase answer in visible chunks.",
        [FAKE_REASONING_EFFORTS.HIGH]:
          "Compare the prompt with seeded chat history, preserve deterministic demo behavior, choose mock search only when exposed by policy, and make the markdown proof easy to present.",
      }[level];

  return `**Thinking (${level})** ${body}`;
};

export const createDemoToolCall = (
  options: LanguageModelV3CallOptions,
): ScriptedToolCall | undefined => {
  const userText = lastUserText(options);
  const hostCommandCall = createDemoHostCommandCall(options, userText);
  if (hostCommandCall) return hostCommandCall;
  if (!shouldUseDemoTool(userText) || readDemoToolResult(options)) return undefined;
  if (
    !options.tools?.some(
      (tool) => tool.type === "function" && tool.name === DEMO_MOCK_WEB_SEARCH_TOOL_NAME,
    )
  ) {
    return undefined;
  }

  return {
    toolCallId: `fake_demo_search_${options.prompt.length}`,
    toolName: DEMO_MOCK_WEB_SEARCH_TOOL_NAME,
    title: DEMO_TOOL_ACTIVITY_TITLE,
    input: { query: demoToolQuery(userText) },
  };
};

const createShowcaseAnswer = (
  userText: string,
  effort: RuntimeReasoningEffort,
  options: LanguageModelV3CallOptions,
): string | undefined => {
  if (/\b(what is your mission|mission)\b/iu.test(userText)) {
    return createMissionShowcaseAnswer(effort);
  }
  if (/\b(what tools do you have|tools)\b/iu.test(userText)) {
    return createToolShowcaseAnswer(userText, effort, options);
  }
  if (/\b(thinking|reasoning|think)\b/iu.test(userText)) {
    return createThinkingShowcaseAnswer(effort);
  }
  if (/\b(tool|search|source|sources|lookup|look up)\b/iu.test(userText)) {
    return createToolShowcaseAnswer(userText, effort, options);
  }
  if (isMarkdownShowcasePrompt(userText)) return createMarkdownShowcaseAnswer(effort);
  return undefined;
};

const createMissionShowcaseAnswer = (effort: RuntimeReasoningEffort): string => {
  const effortLabel = normalizeReasoningEffort(effort) ?? "no";
  return `## Mission

I sit inside the workspace and turn host-app context into concrete next steps.

| Surface | Demo proof |
| --- | --- |
| Runtime | This response used ${effortLabel} thinking through the real AI runtime path. |
| Persistence | The turn is written to the same conversation history used by normal chats. |
| Embed | The host owns open and closed state while the iframe stays focused on Side Chat. |

Send \`tool\` next to show the activity panel with deterministic local search.`;
};

const createThinkingShowcaseAnswer = (effort: RuntimeReasoningEffort): string => {
  const effortLabel = normalizeReasoningEffort(effort) ?? "no";
  return `## Thinking Level

This fake provider is using **${effortLabel}** thinking. Change the effort selector and send this prompt again to see the activity title update.

1. Low keeps the plan short.
2. Medium checks context and tool availability.
3. High shows the most deliberate demo narration.

The app still streams through core, runtime, protocol events, service persistence, and the widget renderer.`;
};

const createMarkdownShowcaseAnswer = (effort: RuntimeReasoningEffort): string => {
  const effortLabel = normalizeReasoningEffort(effort) ?? "no";
  return `## Showcase Response

This is the fake model, but the app path is real: policy, runtime streaming, in-memory persistence, protocol mapping, and markdown rendering all stay active.

| Feature | What to point at |
| --- | --- |
| Thinking | The activity row reflects **${effortLabel}** effort. |
| Streaming | Text arrives in small chunks instead of one instant block. |
| Markdown | Tables, lists, code blocks, and quotes render inside the message. |

\`\`\`ts
const frameSrc = "/side-chat-frame/?mode=local-service&workspaceId=workspace_local&authToken=local-compose-token";
\`\`\`

> Deterministic local demo. No external model is called.`;
};

const createToolShowcaseAnswer = (
  userText: string,
  effort: RuntimeReasoningEffort,
  options: LanguageModelV3CallOptions,
): string => {
  const effortLabel = normalizeReasoningEffort(effort) ?? "no";
  const toolResult = readDemoToolResult(options);
  const toolLine = toolResult
    ? `**Tool result:** ${toolResult}`
    : "**Tool result:** mock_web_search was not exposed on this turn, so I stayed on the markdown-only path.";

  return `## Tool-Backed Showcase

${toolLine}

| Step | Runtime surface | Visible proof |
| --- | --- | --- |
| 1 | Thinking | ${effortLabel} reasoning appears before the answer. |
| 2 | Tool choice | The activity panel shows \`${DEMO_MOCK_WEB_SEARCH_TOOL_NAME}\` when policy exposes it. |
| 3 | Final answer | Markdown renders after the tool result returns. |

\`\`\`json
${JSON.stringify({ tool: DEMO_MOCK_WEB_SEARCH_TOOL_NAME, query: demoToolQuery(userText) }, null, 2)}
\`\`\`

Use this during the demo to show that fake mode still exercises core, AI runtime, tool execution, persistence, and the widget renderer.`;
};

const shouldUseDemoTool = (userText: string): boolean =>
  /\b(tool|tools|search|source|sources|lookup|look up|web|current)\b/iu.test(userText);

const isMarkdownShowcasePrompt = (userText: string): boolean =>
  /^(hi|hello)$/iu.test(userText.trim()) || /\b(markdown|showcase|demo)\b/iu.test(userText);

const demoToolQuery = (userText: string): string =>
  userText.trim().length > 0
    ? `Side Chat demo briefing: ${userText.trim()}`
    : "Side Chat demo briefing";

const readDemoToolResult = (
  options: LanguageModelV3CallOptions | undefined,
): string | undefined => {
  if (!options) return undefined;

  for (let index = options.prompt.length - 1; index >= 0; index -= 1) {
    const message = options.prompt[index];
    if (message?.role !== "tool") continue;
    const summary = readToolMessageSummary(message);
    if (summary) return summary;
  }
  return undefined;
};

const readToolMessageSummary = (message: ToolPromptMessage): string | undefined => {
  for (const part of [...message.content].reverse()) {
    if (part.type !== "tool-result") continue;
    if (part.toolName !== DEMO_MOCK_WEB_SEARCH_TOOL_NAME) continue;
    const summary = readToolOutputSummary(part.output);
    if (summary) return summary;
  }
  return undefined;
};

const readToolOutputSummary = (output: {
  readonly type: string;
  readonly value?: unknown;
}): string | undefined => {
  if (output.type === "text" && typeof output.value === "string") return output.value;
  if (output.type !== "json" || !isRecord(output.value)) return undefined;
  const value = output.value as JsonObject;
  return typeof value["summary"] === "string" ? value["summary"] : undefined;
};

const normalizeReasoningEffort = (
  effort: RuntimeReasoningEffort,
): FakeReasoningEffort | undefined => {
  if (effort === RUNTIME_REASONING_EFFORTS.NONE) return undefined;
  if (effort === RUNTIME_REASONING_EFFORTS.HIGH || effort === RUNTIME_REASONING_EFFORTS.XHIGH) {
    return FAKE_REASONING_EFFORTS.HIGH;
  }
  if (effort === RUNTIME_REASONING_EFFORTS.LOW || effort === RUNTIME_REASONING_EFFORTS.MINIMAL) {
    return FAKE_REASONING_EFFORTS.LOW;
  }
  return FAKE_REASONING_EFFORTS.MEDIUM;
};

const lastUserText = (options: LanguageModelV3CallOptions): string => {
  const userMessage = userTextMessages(options).at(-1);
  return userMessage ?? "";
};

const findPriorProjectCodename = (
  options: LanguageModelV3CallOptions,
  latestUserText: string,
): string | undefined => {
  if (!/\bwhat is my project codename\b/iu.test(latestUserText)) return undefined;

  const priorUserText = userTextMessages(options).slice(0, -1).join(" ");
  const match = /\bproject codename is (?<codename>[A-Za-z0-9][A-Za-z0-9 _-]*)(?:[.!?]|$)/u.exec(
    priorUserText,
  );
  return match?.groups?.["codename"]?.trim();
};

const userTextMessages = (options: LanguageModelV3CallOptions): readonly string[] =>
  options.prompt
    .flatMap((message) => (message.role === "user" ? [message] : []))
    .map((message) => {
      return message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(" ")
        .trim();
    })
    .filter((content) => content.length > 0);

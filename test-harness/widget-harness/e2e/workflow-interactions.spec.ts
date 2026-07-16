import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page, type Route } from "playwright/test";

const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../plan/v7/evidence/task-15-widget-interactions",
);
const workflowWidgetUrl = "/side-chat-frame/?mode=service&workspaceId=task-15";
const recoveryEvidenceDirectory = resolve(
  import.meta.dirname,
  "../../../plan/v7/evidence/task-16-widget-recovery",
);
const recoveryWorkspaceId = "task-16";
const recoveryWidgetUrl = `/side-chat-frame/?mode=service&workspaceId=${recoveryWorkspaceId}`;
const recoveryStorageKey = `side-chat-widget:${recoveryWorkspaceId}:workflow-active-turn`;
const parityEvidenceDirectory = resolve(
  import.meta.dirname,
  "../../../plan/v7/evidence/task-16a-widget-parity",
);
const parityWorkspaceId = "task-16a";
const parityWidgetUrl = `/side-chat-frame/?mode=service&workspaceId=${parityWorkspaceId}`;
const parityRecoveryStorageKey = `side-chat-widget:${parityWorkspaceId}:workflow-active-turn`;
const modelCatalog = {
  models: [
    {
      id: "gpt-5.6-luna",
      provider: "openai",
      contextWindowTokens: 372_000,
      reasoning: {
        efforts: ["low", "medium", "high"],
        defaultEffort: "medium",
      },
    },
  ],
  defaultModelId: "gpt-5.6-luna",
};
const toolCatalog = {
  tools: [
    {
      name: "mock_web_search",
      label: "Mock web search",
      description: "Search deterministic public context.",
      defaultEnabled: true,
    },
    {
      name: "calculator",
      label: "Calculator",
      description: "Evaluate arithmetic.",
      defaultEnabled: true,
    },
  ],
};

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
  mkdirSync(recoveryEvidenceDirectory, { recursive: true });
  mkdirSync(parityEvidenceDirectory, { recursive: true });
});

test("dispatches a native client tool through the host and posts one durable output", async ({
  page,
}) => {
  let postedOutput: unknown;
  let postedOutputCount = 0;
  await routeWorkflowApi(page, {
    runId: "run-client-tool",
    conversationTitleSequence: ["Client tool chat"],
    stateAfterStart: {
      activeTurn: { turnId: "turn-client-tool", runId: "run-client-tool" },
      messages: [
        {
          id: "user-client-tool",
          role: "user",
          parts: [{ type: "text", text: "Open ticket 4821" }],
        },
        {
          id: "assistant-client-tool",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolCallId: "call-open-resource",
              toolName: "open_resource",
              state: "input-available",
              input: { resourceType: "ticket", resourceId: "ticket-4821" },
            },
          ],
        },
      ],
    },
    stateAfterToolOutput: {
      activeTurn: null,
      messages: [
        {
          id: "user-client-tool",
          role: "user",
          parts: [{ type: "text", text: "Open ticket 4821" }],
        },
        {
          id: "assistant-client-tool",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolCallId: "call-open-resource",
              toolName: "open_resource",
              state: "output-available",
              input: { resourceType: "ticket", resourceId: "ticket-4821" },
              output: { status: "applied", resultCode: "harness_local_only" },
            },
          ],
        },
      ],
    },
    chunks: [
      { type: "start", messageId: "assistant-client-tool" },
      { type: "start-step" },
      {
        type: "tool-input-available",
        dynamic: true,
        toolCallId: "call-open-resource",
        toolName: "open_resource",
        input: { resourceType: "ticket", resourceId: "ticket-4821" },
      },
      { type: "finish-step" },
      { type: "finish" },
    ],
    onToolOutput: (body) => {
      postedOutput = body;
      postedOutputCount += 1;
    },
  });

  await page.goto(workflowWidgetUrl);
  await page.getByLabel("Message").fill("Open ticket 4821");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByTestId("demo-host-assistant-count")).toHaveText("Assistant actions: 1");
  await expect
    .poll(() => postedOutput)
    .toMatchObject({
      output: { status: "applied", resultCode: "harness_local_only" },
    });
  await expect(page.getByTestId("demo-host-log").getByText("open_resource")).toBeVisible();

  // Once the server exposes the durable output, a reload must render that
  // settled state without dispatching the client tool or posting it again.
  await page.reload();
  await expect(page.getByText("Client tool chat")).toBeVisible();
  await expect(page.getByTestId("demo-host-assistant-count")).toHaveText("Assistant actions: 0");
  await expect.poll(() => postedOutputCount).toBe(1);
  await page.screenshot({
    path: resolve(evidenceDirectory, "client-tool-dispatched.png"),
    fullPage: true,
  });
});

test("restores approval after reload and immediately transitions its tool to running", async ({
  page,
}) => {
  let postedDecision: unknown;
  await routeWorkflowApi(page, {
    runId: "run-approval",
    stateAfterStart: {
      activeTurn: { turnId: "turn-approval", runId: "run-approval" },
      messages: [
        {
          id: "user-approval",
          role: "user",
          parts: [{ type: "text", text: "Read the private document" }],
        },
        {
          id: "assistant-approval",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolCallId: "call-needs-access",
              toolName: "needs_access",
              state: "approval-requested",
              input: { resourceId: "document-private" },
              approval: { id: "approval-task-15" },
            },
          ],
        },
      ],
    },
    chunks: [
      { type: "start", messageId: "assistant-approval" },
      { type: "start-step" },
      {
        type: "tool-input-available",
        toolCallId: "call-needs-access",
        toolName: "needs_access",
        input: { resourceId: "document-private" },
      },
      {
        type: "tool-approval-request",
        approvalId: "approval-task-15",
        toolCallId: "call-needs-access",
      },
      { type: "finish-step" },
      { type: "finish" },
    ],
    onApproval: (body) => {
      postedDecision = body;
    },
  });

  await page.goto(workflowWidgetUrl);
  await page.getByLabel("Message").fill("Read the private document");
  await page.getByRole("button", { name: "Send" }).click();

  const approval = page.locator('[data-slot="tool-approval"]');
  await expect(approval).toHaveCount(1);
  await expect(approval).toHaveAttribute("data-state", "requested");

  // Approval is durable history, not transient component state. A remount must
  // restore the same request before the user decides it.
  await page.reload();
  await expect(approval).toHaveCount(1);
  await expect(approval).toHaveAttribute("data-state", "requested");
  await page.getByRole("button", { name: "Approve" }).click();

  await expect.poll(() => postedDecision).toEqual({ approved: true });
  await expect(approval).toHaveCount(0);
  const runningTool = page.locator('[data-slot="tool-detail-row"][data-state="running"]');
  await expect(runningTool).toContainText("Needs access");
  await page.screenshot({
    path: resolve(evidenceDirectory, "approval-approved.png"),
    fullPage: true,
  });
});

test("reattaches to an in-progress run on cold load and reassembles the answer", async ({
  page,
}) => {
  await seedWorkflowRecoveryCursor(page, recoveryStorageKey, {
    conversationId: "conversation-task-16",
    runId: "run-refresh",
  });
  await routeWorkflowRecovery(page, {
    runId: "run-refresh",
    activeTurn: {
      turnId: "turn-refresh",
      runId: "run-refresh",
      status: "running",
    },
    history: [
      {
        id: "user-refresh",
        role: "user",
        parts: [{ type: "text", text: "Summarize the ticket" }],
      },
    ],
    streamChunks: [
      { type: "start", messageId: "assistant-refresh" },
      { type: "start-step" },
      { type: "text-start", id: "text-1" },
      {
        type: "text-delta",
        id: "text-1",
        delta: "The ticket reports a billing error.",
      },
      { type: "text-end", id: "text-1" },
      { type: "finish-step" },
      { type: "finish" },
    ],
  });

  await page.goto(recoveryWidgetUrl);

  // The reattached assistant answer streams in over the seeded user message, and
  // the seeded message is not duplicated by the replay.
  await expect(page.getByText("The ticket reports a billing error.")).toBeVisible();
  await expect(page.getByText("Summarize the ticket")).toHaveCount(1);
  await page.screenshot({
    path: resolve(recoveryEvidenceDirectory, "refresh-reattach.png"),
    fullPage: true,
  });
});

test("shows the empty state with quick actions before the first message", async ({ page }) => {
  await routeWorkflowIdle(page);

  await page.goto(parityWidgetUrl);

  await expect(page.getByText("How can I help with this page?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Summarize this page" })).toBeVisible();
  // The restored composer footer surfaces the workflow model selector.
  await expect(page.getByRole("combobox").filter({ hasText: "gpt-5.6-luna" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("How can I help with this page?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Summarize this page" })).toBeVisible();
  await page.screenshot({
    path: resolve(parityEvidenceDirectory, "empty-state.png"),
    fullPage: true,
  });
});

test("keeps the next send usable after the idle activity connection drops", async ({ page }) => {
  let activityReadCount = 0;
  await routeWorkflowApi(page, {
    conversationTitleSequence: ["Idle recovery chat"],
    failActivityReads: true,
    onActivityRead: () => {
      activityReadCount += 1;
    },
    runId: "run-after-idle-activity-loss",
    stateAfterStart: {
      activeTurn: null,
      messages: [
        {
          id: "user-after-idle-activity-loss",
          role: "user",
          parts: [{ type: "text", text: "Send after idle activity loss" }],
        },
        {
          id: "assistant-after-idle-activity-loss",
          role: "assistant",
          parts: [{ type: "text", text: "The next turn still works." }],
        },
      ],
    },
    chunks: [
      { type: "start", messageId: "assistant-after-idle-activity-loss" },
      { type: "start-step" },
      { type: "text-start", id: "text-after-idle-activity-loss" },
      {
        type: "text-delta",
        id: "text-after-idle-activity-loss",
        delta: "The next turn still works.",
      },
      { type: "text-end", id: "text-after-idle-activity-loss" },
      { type: "finish-step" },
      { type: "finish" },
    ],
  });

  await page.goto(workflowWidgetUrl);
  await expect.poll(() => activityReadCount).toBeGreaterThanOrEqual(1);
  await page.getByLabel("Message").fill("Send after idle activity loss");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("The next turn still works.")).toBeVisible();
});

test("keeps a new-chat draft usable when its server history does not exist yet", async ({
  page,
}) => {
  let draftPersisted = false;
  let draftConversationId: string | undefined;
  let draftStateRequests = 0;
  await page.route("**/side-chat-api/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!draftPersisted && request.method() === "GET" && path.endsWith("/state")) {
      draftStateRequests += 1;
      await route.fulfill({ status: 404, json: { error: "not_found" } });
      return;
    }
    if (request.method() === "POST" && path.endsWith("/api/chat")) {
      const conversationId = readConversationId(request.postData());
      if (typeof conversationId !== "string") throw new Error("Draft request needs an id.");
      draftConversationId = conversationId;
      draftPersisted = true;
      await fulfillWorkflowStream(route, {
        runId: "run-new-chat-draft",
        chunks: [{ type: "start", messageId: "assistant-new-chat-draft" }, { type: "finish" }],
      });
      return;
    }
    const fulfilled = await fulfillWorkflowRead(route, path, {
      activeTurn: null,
      conversations: [
        {
          id: "conversation-parity",
          title: "Existing conversation",
          lastMessageAt: "2026-07-13T10:00:00Z",
        },
      ],
      messages: [],
      tools: [],
    });
    if (!fulfilled) await route.abort("failed");
  });

  await page.goto(parityWidgetUrl);
  await expect(page.getByText("How can I help with this page?")).toBeVisible();
  await page.getByText("gpt-5.6-luna", { exact: true }).first().click();
  await page.getByRole("button", { name: "High" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "New chat", exact: true }).click();

  await expect(page.getByText("How can I help with this page?")).toBeVisible();
  await expect(page.getByLabel("Message")).toBeVisible();
  await expect(page.getByRole("combobox").filter({ hasText: "gpt-5.6-luna" })).toBeVisible();
  await expect(page.getByText("/ High", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add context and tools" })).toBeVisible();
  await expect(page.getByText("The requested resource is unavailable.")).toHaveCount(0);
  expect(draftStateRequests).toBe(0);
  expect(new URL(page.url()).searchParams.get("conversationId")).toBeNull();

  await page.getByRole("button", { name: "Add context and tools" }).click();
  await expect(page.getByText("No tools available", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("Message").fill("Persist this draft");
  await page.getByRole("button", { name: "Send" }).click();
  await expect.poll(() => draftConversationId).not.toBeUndefined();
  expect(new URL(page.url()).searchParams.get("conversationId")).toBeNull();
  await expect
    .poll(() => page.evaluate((key) => sessionStorage.getItem(key), parityRecoveryStorageKey))
    .toBeNull();
  await expect(page.getByText("The requested resource is unavailable.")).toHaveCount(0);
});

test("replaces the first-message fallback with the generated workflow title", async ({ page }) => {
  const observedTitles: string[] = [];
  await routeWorkflowApi(page, {
    runId: "run-title-refresh",
    stateAfterStart: {
      activeTurn: null,
      messages: [
        {
          id: "user-title-refresh",
          role: "user",
          parts: [{ type: "text", text: "first fallback title" }],
        },
        {
          id: "assistant-title-refresh",
          role: "assistant",
          parts: [{ type: "text", text: "The title workflow can now run." }],
        },
      ],
    },
    chunks: [
      { type: "start", messageId: "assistant-title-refresh" },
      { type: "start-step" },
      { type: "text-start", id: "text-title-refresh" },
      {
        type: "text-delta",
        id: "text-title-refresh",
        delta: "The title workflow can now run.",
      },
      { type: "text-end", id: "text-title-refresh" },
      { type: "finish-step" },
      { type: "finish" },
    ],
    conversationTitleSequence: ["first fallback title", "Generated workflow title"],
    onConversationTitleRead: (title) => observedTitles.push(title),
  });

  await page.goto(parityWidgetUrl);
  await page.getByLabel("Message").fill("first fallback title");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Generated workflow title", { exact: true })).toBeVisible();
  expect(observedTitles).toContain("first fallback title");
  expect(observedTitles).toContain("Generated workflow title");
});

test("selects server tools per turn and renders terminal context usage", async ({ page }) => {
  let chatRequest: unknown;
  await routeWorkflowApi(page, {
    runId: "run-tools-and-usage",
    tools: toolCatalog.tools,
    stateAfterStart: {
      activeTurn: null,
      messages: [
        {
          id: "user-tools-and-usage",
          role: "user",
          parts: [{ type: "text", text: "Calculate the selected total" }],
        },
        {
          id: "assistant-tools-and-usage",
          role: "assistant",
          parts: [
            {
              type: "text",
              text: "The selected calculator is available for this turn.",
            },
          ],
          metadata: {
            terminal: { status: "completed", finishReason: "stop" },
            usage: {
              inputTokens: 10_000,
              outputTokens: 2_800,
              totalTokens: 12_800,
              reasoningTokens: 0,
              cachedInputTokens: 0,
            },
          },
        },
      ],
    },
    onChatRequest: (body) => {
      chatRequest = body;
    },
    chunks: [
      { type: "start", messageId: "assistant-tools-and-usage" },
      { type: "start-step" },
      { type: "text-start", id: "text-tools-and-usage" },
      {
        type: "text-delta",
        id: "text-tools-and-usage",
        delta: "The selected calculator is available for this turn.",
      },
      { type: "text-end", id: "text-tools-and-usage" },
      { type: "finish-step" },
      {
        type: "finish",
        messageMetadata: {
          usage: {
            inputTokens: 10_000,
            outputTokens: 2_800,
            totalTokens: 12_800,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          },
        },
      },
    ],
  });

  await page.goto(parityWidgetUrl);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          sessionStorage.setItem("sidechat-e2e-copied-text", text);
          return Promise.resolve();
        },
      },
    });
  });
  await page.getByText("gpt-5.6-luna", { exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Light" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Medium" })).toBeVisible();
  await page.getByRole("button", { name: "High" }).click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Add context and tools" }).click();
  const toolsPopup = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(page.getByText("Available tools")).toBeVisible();
  await expect(page.getByText("Mock web search", { exact: true })).toBeVisible();
  await expect(toolsPopup).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: resolve(parityEvidenceDirectory, "tools-menu.png"),
    fullPage: true,
  });

  const webSearchRow = page.getByRole("menuitemcheckbox", { name: /Mock web search/u });
  await expect(webSearchRow).toHaveAttribute("aria-checked", "true");
  await webSearchRow.locator(".sc-switch-root").click();
  await expect(webSearchRow).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expect(toolsPopup).toHaveCount(0);
  await page.getByLabel("Message").fill("Calculate the selected total");
  await page.getByRole("button", { name: "Send" }).click();

  const answer = "The selected calculator is available for this turn.";
  await expect(page.getByText(answer)).toBeVisible();
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("sidechat-e2e-copied-text")))
    .toBe(answer);
  await expect
    .poll(() => chatRequest)
    .toMatchObject({
      modelPreference: "gpt-5.6-luna",
      reasoningEffort: "high",
      enabledToolNames: ["calculator"],
    });
  const contextMeter = page.getByRole("meter", { name: "Context used" });
  await expect(contextMeter).toHaveAttribute("aria-valuetext", "12,800 / 372,000 tokens (3%)");
  await contextMeter.hover();
  const usageTooltip = page.getByText("12,800 / 372,000 tokens (3%)", {
    exact: true,
  });
  await expect(usageTooltip).toBeVisible();
  await expect(usageTooltip).toHaveCSS("opacity", "1");
  await waitForBrowserPaint(page);
  await page.screenshot({
    animations: "disabled",
    path: resolve(parityEvidenceDirectory, "usage-meter.png"),
    fullPage: true,
  });
});

test("discards a stale recovery cursor without routing to or selecting another chat", async ({
  page,
}) => {
  const stateRequests: string[] = [];
  await seedWorkflowRecoveryCursor(page, parityRecoveryStorageKey, {
    conversationId: "conversation-stale",
    runId: "run-stale",
  });
  await page.route("**/side-chat-api/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "GET" && path.endsWith("/state")) {
      stateRequests.push(path);
      await route.fulfill({ status: 200, json: { messages: [], activeTurn: null } });
      return;
    }
    const fulfilled = await fulfillWorkflowRead(route, path, {
      activeTurn: null,
      conversations: [
        {
          id: "conversation-recovered",
          title: "Recovered",
          lastMessageAt: "2026-07-13T11:00:00Z",
        },
      ],
      messages: [],
      tools: [],
    });
    if (!fulfilled) await route.abort("failed");
  });

  await page.goto(
    `/side-chat-frame/?mode=service&workspaceId=${parityWorkspaceId}&conversationId=conversation-routed`,
  );

  await expect(page.getByText("How can I help with this page?")).toBeVisible();
  await expect(page.getByText("Recovered conversation")).toHaveCount(0);
  await expect(page.getByText("The requested resource is unavailable.")).toHaveCount(0);
  expect(stateRequests.length).toBeGreaterThanOrEqual(1);
  expect(new Set(stateRequests)).toEqual(
    new Set(["/side-chat-api/api/conversations/conversation-stale/state"]),
  );
  await expect
    .poll(() => page.evaluate((key) => sessionStorage.getItem(key), parityRecoveryStorageKey))
    .toBeNull();
  expect(new URL(page.url()).searchParams.get("conversationId")).toBe("conversation-routed");
});

test("opens the settings view from the header gear and returns to the chat", async ({ page }) => {
  await routeWorkflowIdle(page);

  await page.goto(parityWidgetUrl);
  await page.getByRole("button", { name: "Settings" }).click();

  const back = page.getByRole("button", { name: "Back to chat" });
  await expect(back).toBeVisible();
  await page.screenshot({
    path: resolve(parityEvidenceDirectory, "settings-view.png"),
    fullPage: true,
  });

  await back.click();
  await expect(page.getByText("How can I help with this page?")).toBeVisible();
});

test("lists workspace conversations in the sidebar and opens a different one", async ({ page }) => {
  await page.route("**/side-chat-api/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const messages = path.includes("/conversation-refund/state")
      ? [
          {
            id: "u-refund",
            role: "user",
            parts: [{ type: "text", text: "What is the refund window?" }],
          },
        ]
      : [];
    const fulfilled = await fulfillWorkflowRead(route, path, {
      activeTurn: null,
      conversations: [
        {
          id: "conversation-parity",
          title: "Billing bug",
          lastMessageAt: "2026-07-13T10:00:00Z",
        },
        {
          id: "conversation-refund",
          title: "Refund policy",
          lastMessageAt: "2026-07-13T09:00:00Z",
        },
      ],
      messages,
      tools: [],
    });
    if (!fulfilled) await route.abort("failed");
  });

  await page.goto(parityWidgetUrl);

  await expect(page.getByText("Billing bug")).toBeVisible();
  await expect(page.getByText("Refund policy")).toBeVisible();
  await page.screenshot({
    path: resolve(parityEvidenceDirectory, "sidebar.png"),
    fullPage: true,
  });

  // Selecting another conversation remounts the session against its history.
  await page.getByText("Refund policy").click();
  await expect(page.getByText("What is the refund window?")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("conversationId")).toBeNull();

  await page.reload();
  await expect(page.getByText("What is the refund window?")).toBeVisible();

  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await expect(page.getByText("How can I help with this page?")).toBeVisible();
  await page.reload();
  await expect(page.getByText("How can I help with this page?")).toBeVisible();
  await expect(page.getByText("What is the refund window?")).toHaveCount(0);
});

async function seedWorkflowRecoveryCursor(
  page: Page,
  storageKey: string,
  cursor: Readonly<{ conversationId: string; runId: string }>,
): Promise<void> {
  await page.addInitScript(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), {
    key: storageKey,
    value: cursor,
  });
}

function readConversationId(body: string | null): string | undefined {
  if (!body) return undefined;
  return /"conversationId"\s*:\s*"([^"]+)"/u.exec(body)?.[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A run-less conversation: empty history, no active turn, and no other workspace
// conversations, so the widget rests on its empty state.
async function routeWorkflowIdle(page: Page): Promise<void> {
  await page.route("**/side-chat-api/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const fulfilled = await fulfillWorkflowRead(route, path, {
      activeTurn: null,
      conversations: [],
      messages: [],
      tools: [],
    });
    if (!fulfilled) await route.abort("failed");
  });
}

type WorkflowReadFixture = Readonly<{
  activeTurn: Readonly<Record<string, unknown>> | null;
  conversations: readonly Readonly<Record<string, unknown>>[];
  messages: readonly Readonly<Record<string, unknown>>[];
  runningConversationIds?: readonly string[] | undefined;
  tools: readonly Readonly<Record<string, unknown>>[];
}>;

async function fulfillWorkflowRead(
  route: Route,
  path: string,
  fixture: WorkflowReadFixture,
): Promise<boolean> {
  if (route.request().method() !== "GET") return false;
  if (path.endsWith("/activity")) {
    await route.fulfill({
      body: `data: ${JSON.stringify({
        type: "sidechat.turn-activity-sync",
        activeTurns: [],
      })}\n\n`,
      contentType: "text/event-stream",
      status: 200,
    });
    return true;
  }
  if (path.endsWith("/conversations")) {
    await route.fulfill({
      json: {
        conversations: fixture.conversations,
        runningConversationIds: fixture.runningConversationIds ?? [],
      },
    });
    return true;
  }
  if (path.endsWith("/models")) {
    await route.fulfill({ json: modelCatalog });
    return true;
  }
  if (path.endsWith("/tools")) {
    await route.fulfill({ json: { tools: fixture.tools } });
    return true;
  }
  if (path.endsWith("/messages")) {
    await route.fulfill({ json: { messages: fixture.messages } });
    return true;
  }
  if (path.endsWith("/state")) {
    await route.fulfill({
      json: { messages: fixture.messages, activeTurn: fixture.activeTurn },
    });
    return true;
  }
  return false;
}

type WorkflowRouteScenario = Readonly<{
  readonly chunks: readonly Readonly<Record<string, unknown>>[];
  readonly failActivityReads?: boolean | undefined;
  readonly runId: string;
  readonly stateAfterStart?: WorkflowRouteState | undefined;
  readonly stateAfterToolOutput?: WorkflowRouteState | undefined;
  readonly onApproval?: ((body: unknown) => void) | undefined;
  readonly onActivityRead?: (() => void) | undefined;
  readonly onChatRequest?: ((body: unknown) => void) | undefined;
  readonly onToolOutput?: ((body: unknown) => void) | undefined;
  readonly conversationTitleSequence?: readonly string[] | undefined;
  readonly onConversationTitleRead?: ((title: string) => void) | undefined;
  readonly tools?: readonly Readonly<Record<string, unknown>>[] | undefined;
}>;

type WorkflowRouteState = Readonly<{
  activeTurn: Readonly<Record<string, unknown>> | null;
  messages: readonly Readonly<Record<string, unknown>>[];
}>;

async function routeWorkflowApi(page: Page, scenario: WorkflowRouteScenario): Promise<void> {
  const runtime: WorkflowRouteRuntime = {
    chatStarted: false,
    conversationId: undefined,
    conversationTitleReadCount: 0,
    toolOutputPosted: false,
  };
  await page.route("**/side-chat-api/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (await abortConfiguredActivityRead(route, path, scenario)) return;
    const stateAfterStart = selectWorkflowRouteState(scenario, runtime);
    const conversations = workflowScenarioConversations(path, scenario, runtime);
    const readWasFulfilled = await fulfillWorkflowRead(route, path, {
      activeTurn: stateAfterStart?.activeTurn ?? null,
      conversations,
      messages: stateAfterStart?.messages ?? [],
      tools: scenario.tools ?? [],
    });
    if (readWasFulfilled) return;
    if (runtime.chatStarted && route.request().method() === "GET" && path.endsWith("/stream")) {
      await fulfillWorkflowStream(route, scenario);
      return;
    }
    if (await fulfillWorkflowMutation(route, path, scenario, runtime)) return;
    await route.abort("failed");
  });
}

async function abortConfiguredActivityRead(
  route: Route,
  path: string,
  scenario: WorkflowRouteScenario,
): Promise<boolean> {
  if (scenario.failActivityReads !== true) return false;
  if (route.request().method() !== "GET") return false;
  if (!path.endsWith("/activity")) return false;
  scenario.onActivityRead?.();
  await route.abort("connectionfailed");
  return true;
}

function selectWorkflowRouteState(
  scenario: WorkflowRouteScenario,
  runtime: WorkflowRouteRuntime,
): WorkflowRouteState | undefined {
  if (!runtime.chatStarted) return undefined;
  if (runtime.toolOutputPosted) {
    return scenario.stateAfterToolOutput ?? scenario.stateAfterStart;
  }
  return scenario.stateAfterStart;
}

async function fulfillWorkflowMutation(
  route: Route,
  path: string,
  scenario: WorkflowRouteScenario,
  runtime: WorkflowRouteRuntime,
): Promise<boolean> {
  const request = route.request();
  if (request.method() !== "POST") return false;
  if (path.endsWith("/api/chat")) {
    runtime.chatStarted = true;
    const body: unknown = request.postDataJSON();
    if (isRecord(body) && typeof body["conversationId"] === "string") {
      runtime.conversationId = body["conversationId"];
    }
    scenario.onChatRequest?.(body);
    await fulfillWorkflowStream(route, scenario);
    return true;
  }
  if (path.endsWith("/output")) {
    runtime.toolOutputPosted = true;
    scenario.onToolOutput?.(request.postDataJSON());
    await route.fulfill({ json: { accepted: true } });
    return true;
  }
  if (!path.includes("/approvals/")) return false;
  scenario.onApproval?.(request.postDataJSON());
  await route.fulfill({
    json: {
      accepted: true,
      approvalId: path.split("/").at(-1),
      resumed: true,
      state: "approved",
    },
  });
  return true;
}

type WorkflowRouteRuntime = {
  chatStarted: boolean;
  conversationId: string | undefined;
  conversationTitleReadCount: number;
  toolOutputPosted: boolean;
};

function workflowScenarioConversations(
  path: string,
  scenario: WorkflowRouteScenario,
  runtime: WorkflowRouteRuntime,
): readonly Readonly<Record<string, unknown>>[] {
  const titles = scenario.conversationTitleSequence;
  if (!runtime.chatStarted || !runtime.conversationId || !titles?.length) return [];
  if (!path.endsWith("/conversations")) return [];
  const title = titles[Math.min(runtime.conversationTitleReadCount, titles.length - 1)];
  runtime.conversationTitleReadCount += 1;
  if (title === undefined) return [];
  scenario.onConversationTitleRead?.(title);
  return [
    {
      id: runtime.conversationId,
      title,
      lastMessageAt: "2026-07-15T10:00:00Z",
    },
  ];
}

type WorkflowRecoveryScenario = Readonly<{
  readonly runId: string;
  readonly activeTurn: Readonly<Record<string, unknown>>;
  readonly history: readonly Readonly<Record<string, unknown>>[];
  readonly streamChunks: readonly Readonly<Record<string, unknown>>[];
}>;

async function routeWorkflowRecovery(
  page: Page,
  scenario: WorkflowRecoveryScenario,
): Promise<void> {
  await page.route("**/side-chat-api/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const fulfilled = await fulfillWorkflowRead(route, url.pathname, {
      activeTurn: scenario.activeTurn,
      conversations: [],
      messages: scenario.history,
      tools: [],
    });
    if (fulfilled) return;
    if (request.method() === "GET" && url.pathname.endsWith("/stream")) {
      await fulfillWorkflowStream(route, {
        chunks: scenario.streamChunks,
        runId: scenario.runId,
      });
      return;
    }
    await route.abort("failed");
  });
}

async function waitForBrowserPaint(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolvePaint) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint()));
      }),
  );
}

async function fulfillWorkflowStream(route: Route, scenario: WorkflowRouteScenario): Promise<void> {
  const body =
    scenario.chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
    "data: [DONE]\n\n";
  await route.fulfill({
    body,
    headers: {
      "content-type": "text/event-stream",
      "x-workflow-run-id": scenario.runId,
    },
    status: 200,
  });
}

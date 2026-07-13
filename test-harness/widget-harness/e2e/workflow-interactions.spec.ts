import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page, type Route } from "playwright/test";

const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../plan/v7/evidence/task-15-widget-interactions",
);
const workflowWidgetUrl =
  "/side-chat-frame/?mode=workflow-service&conversationId=conversation-task-15";
const recoveryEvidenceDirectory = resolve(
  import.meta.dirname,
  "../../../plan/v7/evidence/task-16-widget-recovery",
);
const recoveryWidgetUrl =
  "/side-chat-frame/?mode=workflow-service&conversationId=conversation-task-16";
const parityEvidenceDirectory = resolve(
  import.meta.dirname,
  "../../../plan/v7/evidence/task-16a-widget-parity",
);
const parityWidgetUrl =
  "/side-chat-frame/?mode=workflow-service&conversationId=conversation-parity";

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
  mkdirSync(recoveryEvidenceDirectory, { recursive: true });
  mkdirSync(parityEvidenceDirectory, { recursive: true });
});

test("dispatches a native client tool through the host and posts one durable output", async ({
  page,
}) => {
  let postedOutput: unknown;
  await routeWorkflowApi(page, {
    runId: "run-client-tool",
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
  await page.screenshot({
    path: resolve(evidenceDirectory, "client-tool-dispatched.png"),
    fullPage: true,
  });
});

test("posts an approval decision and updates the existing approval row in place", async ({
  page,
}) => {
  let postedDecision: unknown;
  await routeWorkflowApi(page, {
    runId: "run-approval",
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
  await page.getByLabel("Reason (optional)").fill("Needed for the current task");
  await page.getByRole("button", { name: "Approve" }).click();

  await expect
    .poll(() => postedDecision)
    .toEqual({
      approved: true,
      reason: "Needed for the current task",
    });
  await expect(approval).toHaveCount(1);
  await expect(approval).toHaveAttribute("data-state", "approved");
  await expect(approval.getByText("Approved", { exact: true })).toBeVisible();
  await approval.screenshot({
    path: resolve(evidenceDirectory, "approval-approved.png"),
  });
});

test("reattaches to an in-progress run on cold load and reassembles the answer", async ({
  page,
}) => {
  await routeWorkflowRecovery(page, {
    runId: "run-refresh",
    activeTurn: { turnId: "turn-refresh", runId: "run-refresh", status: "running" },
    history: [
      { id: "user-refresh", role: "user", parts: [{ type: "text", text: "Summarize the ticket" }] },
    ],
    streamChunks: [
      { type: "start", messageId: "assistant-refresh" },
      { type: "start-step" },
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "The ticket reports a billing error." },
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
  await page.screenshot({
    path: resolve(parityEvidenceDirectory, "empty-state.png"),
    fullPage: true,
  });
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

// A run-less conversation: empty history and no active turn, so the widget rests on
// its empty state.
async function routeWorkflowIdle(page: Page): Promise<void> {
  await page.route("**/side-chat-api/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.endsWith("/messages")) {
      await route.fulfill({ json: { messages: [] } });
      return;
    }
    if (request.method() === "GET" && url.pathname.endsWith("/active-turn")) {
      await route.fulfill({ json: { activeTurn: null } });
      return;
    }
    await route.abort("failed");
  });
}

type WorkflowRouteScenario = Readonly<{
  readonly chunks: readonly Readonly<Record<string, unknown>>[];
  readonly runId: string;
  readonly onApproval?: ((body: unknown) => void) | undefined;
  readonly onToolOutput?: ((body: unknown) => void) | undefined;
}>;

async function routeWorkflowApi(page: Page, scenario: WorkflowRouteScenario): Promise<void> {
  await page.route("**/side-chat-api/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.endsWith("/messages")) {
      await route.fulfill({ json: { messages: [] } });
      return;
    }
    if (request.method() === "POST" && url.pathname.endsWith("/api/chat")) {
      await fulfillWorkflowStream(route, scenario);
      return;
    }
    if (request.method() === "POST" && url.pathname.endsWith("/output")) {
      scenario.onToolOutput?.(request.postDataJSON());
      await route.fulfill({ json: { accepted: true } });
      return;
    }
    if (request.method() === "POST" && url.pathname.includes("/approvals/")) {
      scenario.onApproval?.(request.postDataJSON());
      await route.fulfill({
        json: {
          accepted: true,
          approvalId: url.pathname.split("/").at(-1),
          resumed: true,
          state: "approved",
        },
      });
      return;
    }
    await route.abort("failed");
  });
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
    if (request.method() === "GET" && url.pathname.endsWith("/messages")) {
      await route.fulfill({ json: { messages: scenario.history } });
      return;
    }
    if (request.method() === "GET" && url.pathname.endsWith("/active-turn")) {
      await route.fulfill({ json: { activeTurn: scenario.activeTurn } });
      return;
    }
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

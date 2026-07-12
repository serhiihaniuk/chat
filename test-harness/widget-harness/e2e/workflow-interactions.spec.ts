import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page, type Route } from "playwright/test";

const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../plan/v7/evidence/task-15-widget-interactions",
);
const workflowWidgetUrl =
  "/side-chat-frame/?mode=workflow-service&conversationId=conversation-task-15";

test.beforeAll(() => mkdirSync(evidenceDirectory, { recursive: true }));

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

  await expect(page.getByTestId("demo-host-assistant-count")).toHaveText(
    "Assistant actions: 1",
  );
  await expect
    .poll(() => postedOutput)
    .toMatchObject({
      output: { status: "applied", resultCode: "harness_local_only" },
    });
  await expect(
    page.getByTestId("demo-host-log").getByText("open_resource"),
  ).toBeVisible();
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
  await page
    .getByLabel("Reason (optional)")
    .fill("Needed for the current task");
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

type WorkflowRouteScenario = Readonly<{
  readonly chunks: readonly Readonly<Record<string, unknown>>[];
  readonly runId: string;
  readonly onApproval?: ((body: unknown) => void) | undefined;
  readonly onToolOutput?: ((body: unknown) => void) | undefined;
}>;

async function routeWorkflowApi(
  page: Page,
  scenario: WorkflowRouteScenario,
): Promise<void> {
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

async function fulfillWorkflowStream(
  route: Route,
  scenario: WorkflowRouteScenario,
): Promise<void> {
  const body =
    scenario.chunks
      .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
      .join("") + "data: [DONE]\n\n";
  await route.fulfill({
    body,
    headers: {
      "content-type": "text/event-stream",
      "x-workflow-run-id": scenario.runId,
    },
    status: 200,
  });
}

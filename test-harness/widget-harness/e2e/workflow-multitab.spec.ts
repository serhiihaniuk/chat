import { expect, test, type APIRequestContext, type Page } from "playwright/test";
import { SIDE_CHAT_ERROR_CODES, SIDE_CHAT_ERROR_VOCABULARY } from "@side-chat/stream-profile";

const fixturePort = readPort("SIDECHAT_WORKFLOW_FIXTURE_PORT", 8788);
const fixtureUrl = `http://127.0.0.1:${String(fixturePort)}`;
const workspaceId = "task-16-multitab";
const widgetUrl = `/side-chat-frame/?mode=service&workspaceId=${workspaceId}`;
const recoveryStorageKey = `side-chat-widget:${workspaceId}:workflow-active-turn`;
const partialAnswer = "Both tabs receive the shared";
const completeAnswer = `${partialAnswer} workflow answer.`;
const FIXTURE_COUNTER_KEYS = ["conversations", "models", "state", "tools"] as const;

test("keeps two workflow tabs isolated while both replay one accepted run", async ({
  context,
  page,
  request,
}) => {
  const pageErrors: string[] = [];
  collectPageErrors(page, pageErrors);
  await request.post(`${fixtureUrl}/__test/reset`);

  const secondTab = await context.newPage();
  collectPageErrors(secondTab, pageErrors);
  await Promise.all([page.goto(widgetUrl), secondTab.goto(widgetUrl)]);
  await expect(page.getByText("How can I help with this page?")).toBeVisible();
  await expect(secondTab.getByText("How can I help with this page?")).toBeVisible();
  await expect
    .poll(() => secondTab.evaluate((key) => sessionStorage.getItem(key), recoveryStorageKey))
    .toBeNull();
  await expect.poll(async () => (await readFixtureCounters(request)).activitySubscribers).toBe(2);

  await page.getByLabel("Message").fill("Share this answer across tabs");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(partialAnswer)).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop generating" })).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => sessionStorage.getItem(key), recoveryStorageKey))
    .toContain("run-multitab");
  expect(new URL(page.url()).searchParams.get("conversationId")).toBeNull();

  // The watcher was already open before the first tab submitted. Activity must
  // discover the run without creating a local recovery cursor or auto-selecting it.
  await expect(secondTab.getByLabel("Generating")).toBeVisible();
  await expect
    .poll(() => secondTab.evaluate((key) => sessionStorage.getItem(key), recoveryStorageKey))
    .toBeNull();
  expect(new URL(secondTab.url()).searchParams.get("conversationId")).toBeNull();

  await secondTab.getByText("Shared running chat").click();
  await expect(secondTab.getByText("Share this answer across tabs")).toHaveCount(1);
  await expect(secondTab.getByText(partialAnswer)).toBeVisible();
  await expect.poll(async () => (await readFixtureCounters(request)).subscribers).toBe(2);

  const beforeHardReload = await readFixtureCounters(request);
  await page.reload();
  await expect(page.getByText("Share this answer across tabs")).toHaveCount(1);
  await expect(page.getByText(partialAnswer)).toHaveCount(1);
  await expect
    .poll(async () => (await readFixtureCounters(request)).replayConnections)
    .toBe(beforeHardReload.replayConnections + 1);
  await expect.poll(async () => (await readFixtureCounters(request)).subscribers).toBe(2);
  await expect
    .poll(() => page.evaluate((key) => sessionStorage.getItem(key), recoveryStorageKey))
    .toContain("run-multitab");

  const selectedRunningRow = secondTab.locator("button").filter({
    hasText: "Shared running chat",
  });
  await expect(selectedRunningRow).toBeEnabled();
  await secondTab.getByRole("button", { name: "New chat", exact: true }).click();
  await expect(secondTab.getByText("How can I help with this page?")).toBeVisible();
  await expect(secondTab.getByText("Reference conversation history.")).toHaveCount(0);
  await selectedRunningRow.click();
  await expect(secondTab.getByText(partialAnswer)).toBeVisible();

  await secondTab.getByText("Reference chat", { exact: true }).click();
  await expect(secondTab.getByText("Reference conversation history.")).toBeVisible();
  await selectedRunningRow.click();
  await expect(secondTab.getByText(partialAnswer)).toBeVisible();

  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Workspace Assistant" })).toBeVisible();
  await page.getByRole("button", { name: "Workspace Assistant" }).click();
  await expect(page.getByText(partialAnswer)).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop generating" })).toBeVisible();

  const beforeRefresh = await readFixtureCounters(request);
  await secondTab.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(async () => didEveryWorkflowReadAdvance(request, beforeRefresh)).toBe(true);
  await expect
    .poll(async () => (await readFixtureCounters(request)).replayConnections)
    .toBe(beforeRefresh.replayConnections);
  await expect.poll(async () => (await readFixtureCounters(request)).subscribers).toBe(2);
  await expect(secondTab.getByText(partialAnswer)).toBeVisible();

  await request.post(`${fixtureUrl}/__test/complete`);
  await expect(page.getByText(completeAnswer)).toBeVisible();
  await expect(secondTab.getByText(completeAnswer)).toBeVisible();
  await expect(page.getByLabel("Generating")).toHaveCount(0);
  await expect(secondTab.getByLabel("Generating")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate((key) => sessionStorage.getItem(key), recoveryStorageKey))
    .toBeNull();
  // Terminal reconciliation clears only the active-run cursor. The separately
  // persisted view selection must keep the completed conversation visible.
  await page.reload();
  await expect(page.getByText(completeAnswer)).toBeVisible();
  expect(new URL(page.url()).searchParams.get("conversationId")).toBeNull();
  expect(new URL(secondTab.url()).searchParams.get("conversationId")).toBeNull();
  expect(pageErrors).toEqual([]);
});

test("lets only one simultaneous tab start a turn and keeps the conflict bounded", async ({
  context,
  page,
  request,
}) => {
  const pageErrors: string[] = [];
  collectPageErrors(page, pageErrors);
  await request.post(`${fixtureUrl}/__test/reset`);
  const secondTab = await context.newPage();
  collectPageErrors(secondTab, pageErrors);
  await Promise.all([page.goto(widgetUrl), secondTab.goto(widgetUrl)]);

  await Promise.all([
    page.getByText("Conflict chat", { exact: true }).click(),
    secondTab.getByText("Conflict chat", { exact: true }).click(),
  ]);
  await Promise.all([
    expect(page.getByText("Conflict conversation history.")).toBeVisible(),
    expect(secondTab.getByText("Conflict conversation history.")).toBeVisible(),
  ]);
  await Promise.all([
    page.getByLabel("Message").fill("Start from tab one"),
    secondTab.getByLabel("Message").fill("Start from tab two"),
  ]);
  await Promise.all([
    page.getByRole("button", { name: "Send" }).click(),
    secondTab.getByRole("button", { name: "Send" }).click(),
  ]);

  const conflictMessage = SIDE_CHAT_ERROR_VOCABULARY[SIDE_CHAT_ERROR_CODES.CONFLICT].safeMessage;
  await expect
    .poll(
      async () =>
        Number(await isVisible(page, conflictMessage)) +
        Number(await isVisible(secondTab, conflictMessage)),
    )
    .toBe(1);
  await expect
    .poll(
      async () =>
        Number(await isVisible(page, partialAnswer)) +
        Number(await isVisible(secondTab, partialAnswer)),
    )
    .toBe(1);
  const counters = await readFixtureCounters(request);
  expect(counters.chatAccepted).toBe(1);
  expect(counters.chatConflicts).toBe(1);

  await request.post(`${fixtureUrl}/__test/complete`);
  await expect
    .poll(
      async () =>
        Number(await isVisible(page, completeAnswer)) +
        Number(await isVisible(secondTab, completeAnswer)),
    )
    .toBeGreaterThanOrEqual(1);
  expect(pageErrors.filter((message) => !message.includes("status of 409 (Conflict)"))).toEqual([]);
});

type FixtureCounters = Readonly<{
  activitySubscribers: number;
  chatAccepted: number;
  chatConflicts: number;
  conversations: number;
  models: number;
  replayConnections: number;
  state: number;
  subscribers: number;
  tools: number;
}>;

async function didEveryWorkflowReadAdvance(
  request: APIRequestContext,
  before: FixtureCounters,
): Promise<boolean> {
  const current = await readFixtureCounters(request);
  return FIXTURE_COUNTER_KEYS.every((key) => current[key] > before[key]);
}

async function readFixtureCounters(request: APIRequestContext): Promise<FixtureCounters> {
  const response = await request.get(`${fixtureUrl}/__test/state`);
  const value: unknown = await response.json();
  if (!isRecord(value) || !isRecord(value["counters"])) {
    throw new Error("Invalid multi-tab fixture state.");
  }
  const counters = value["counters"];
  return {
    activitySubscribers: readCounter(value, "activitySubscribers"),
    chatAccepted: readCounter(counters, "chatAccepted"),
    chatConflicts: readCounter(counters, "chatConflicts"),
    conversations: readCounter(counters, "conversations"),
    models: readCounter(counters, "models"),
    replayConnections: readCounter(counters, "replayConnections"),
    state: readCounter(counters, "state"),
    subscribers: readCounter(value, "subscribers"),
    tools: readCounter(counters, "tools"),
  };
}

async function isVisible(page: Page, text: string): Promise<boolean> {
  return page
    .getByText(text, { exact: true })
    .isVisible()
    .catch(() => false);
}

function readCounter(value: Record<string, unknown>, key: string): number {
  const counter = value[key];
  if (typeof counter !== "number") throw new Error(`Invalid multi-tab counter: ${key}.`);
  return counter;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectPageErrors(page: Page, errors: string[]): void {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
}

function readPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

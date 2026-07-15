import { expect, test, type APIRequestContext, type Page } from "playwright/test";

const fixturePort = readPort("SIDECHAT_WORKFLOW_FIXTURE_PORT", 8788);
const fixtureUrl = `http://127.0.0.1:${String(fixturePort)}`;
const workspaceId = "task-16-multitab";
const widgetUrl = `/side-chat-frame/?mode=workflow-service&workspaceId=${workspaceId}`;
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
  await page.goto(widgetUrl);
  await page.getByLabel("Message").fill("Share this answer across tabs");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(partialAnswer)).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => sessionStorage.getItem(key), recoveryStorageKey))
    .toContain("run-multitab");
  expect(new URL(page.url()).searchParams.get("conversationId")).toBeNull();

  const beforeHardReload = await readFixtureCounters(request);
  await page.reload();
  await expect(page.getByText("Share this answer across tabs")).toHaveCount(1);
  await expect(page.getByText(partialAnswer)).toHaveCount(1);
  await expect
    .poll(async () => (await readFixtureCounters(request)).replayConnections)
    .toBe(beforeHardReload.replayConnections + 1);
  await expect.poll(async () => (await readFixtureCounters(request)).subscribers).toBe(1);
  await expect
    .poll(() => page.evaluate((key) => sessionStorage.getItem(key), recoveryStorageKey))
    .toContain("run-multitab");

  const secondTab = await context.newPage();
  collectPageErrors(secondTab, pageErrors);
  await secondTab.goto(widgetUrl);
  await expect(secondTab.getByText("How can I help with this page?")).toBeVisible();
  await expect(secondTab.getByLabel("Generating")).toBeVisible();
  await expect
    .poll(() => secondTab.evaluate((key) => sessionStorage.getItem(key), recoveryStorageKey))
    .toBeNull();
  expect(new URL(secondTab.url()).searchParams.get("conversationId")).toBeNull();

  await secondTab.getByText("Shared running chat").click();
  await expect(secondTab.getByText("Share this answer across tabs")).toHaveCount(1);
  await expect(secondTab.getByText(partialAnswer)).toBeVisible();
  await expect.poll(async () => (await readFixtureCounters(request)).subscribers).toBe(2);
  const selectedRunningRow = secondTab.locator("button").filter({
    hasText: "Shared running chat",
  });
  await expect(selectedRunningRow).toBeEnabled();
  await secondTab.getByRole("button", { name: "New chat", exact: true }).click();
  await expect(secondTab.getByText("How can I help with this page?")).toBeVisible();
  await selectedRunningRow.click();
  await expect(secondTab.getByText(partialAnswer)).toBeVisible();

  const beforeRefresh = await readFixtureCounters(request);
  await secondTab.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(async () => didEveryWorkflowReadAdvance(request, beforeRefresh)).toBe(true);
  await expect
    .poll(async () => (await readFixtureCounters(request)).replayConnections)
    .toBe(beforeRefresh.replayConnections + 1);
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
  expect(new URL(page.url()).searchParams.get("conversationId")).toBeNull();
  expect(new URL(secondTab.url()).searchParams.get("conversationId")).toBeNull();
  expect(pageErrors).toEqual([]);
});

type FixtureCounters = Readonly<{
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
    conversations: readCounter(counters, "conversations"),
    models: readCounter(counters, "models"),
    replayConnections: readCounter(counters, "replayConnections"),
    state: readCounter(counters, "state"),
    subscribers: readCounter(value, "subscribers"),
    tools: readCounter(counters, "tools"),
  };
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

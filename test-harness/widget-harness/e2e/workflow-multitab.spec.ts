import { expect, test, type APIRequestContext } from "playwright/test";

const fixtureUrl = "http://127.0.0.1:8788";
const workspaceId = "task-16-multitab";
const widgetUrl = `/side-chat-frame/?mode=workflow-service&workspaceId=${workspaceId}`;
const recoveryStorageKey = `side-chat-widget:${workspaceId}:workflow-active-turn`;
const partialAnswer = "Both tabs receive the shared";
const completeAnswer = `${partialAnswer} workflow answer.`;
const FIXTURE_COUNTER_KEYS = [
  "activeTurn",
  "conversations",
  "messages",
  "models",
  "replayConnections",
  "tools",
] as const;

test("keeps two workflow tabs isolated while both replay one accepted run", async ({
  context,
  page,
  request,
}) => {
  await request.post(`${fixtureUrl}/__test/reset`);
  await page.goto(widgetUrl);
  await page.getByLabel("Message").fill("Share this answer across tabs");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(partialAnswer)).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => sessionStorage.getItem(key), recoveryStorageKey))
    .toContain("run-multitab");
  expect(new URL(page.url()).searchParams.get("conversationId")).toBeNull();

  const secondTab = await context.newPage();
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
  const selectedRunningRow = secondTab.locator("button").filter({
    hasText: "Shared running chat",
  });
  await expect(selectedRunningRow).toBeDisabled();

  const beforeRefresh = await readFixtureCounters(request);
  await secondTab.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(async () => didEveryWorkflowReadAdvance(request, beforeRefresh)).toBe(true);
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
});

type FixtureCounters = Readonly<{
  activeTurn: number;
  conversations: number;
  messages: number;
  models: number;
  replayConnections: number;
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
    activeTurn: readCounter(counters, "activeTurn"),
    conversations: readCounter(counters, "conversations"),
    messages: readCounter(counters, "messages"),
    models: readCounter(counters, "models"),
    replayConnections: readCounter(counters, "replayConnections"),
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

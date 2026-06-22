import { expect, test, type APIRequestContext, type Page } from "playwright/test";

const serviceBaseUrl = process.env["SIDECHAT_PERSISTENT_SERVICE_URL"] ?? "http://127.0.0.1:3102";
const authToken = process.env["SIDECHAT_PERSISTENT_AUTH_TOKEN"] ?? "persistent-e2e-token";
const workspaceId = process.env["SIDECHAT_PERSISTENT_WORKSPACE_ID"] ?? "workspace_persistent_e2e";

test("persists send, history, reset, and usage through public widget and service seams", async ({
  page,
  request,
}) => {
  await expectPersistentServiceHealth(request);
  await openPersistentWidget(page);

  const firstTurn = await sendAndReadTurn(page, "My project codename is Blue Lynx.");
  const conversationId = firstTurn.conversationId;
  expect(firstTurn.totalTokens).toBeGreaterThan(0);
  await expect(page.getByText("Fake response: My project codename is Blue Lynx.")).toBeVisible({
    timeout: 15_000,
  });

  const followUp = await sendAndReadTurn(page, "What is my project codename?");
  const followUpTokens = followUp.totalTokens;
  await expect(page.getByText("Your project codename is Blue Lynx.")).toBeVisible({
    timeout: 15_000,
  });

  const history = await readHistory(request, conversationId);
  expect(history.messages.map((message) => message.content)).toEqual([
    "My project codename is Blue Lynx.",
    "Fake response: My project codename is Blue Lynx.",
    "What is my project codename?",
    "Your project codename is Blue Lynx.",
  ]);
  await expectPersistentUsage(request, firstTurn.totalTokens + followUpTokens);

  const reset = await request.delete(`${serviceBaseUrl}/chat/history/${conversationId}`, {
    headers: authHeaders(),
  });
  expect(reset.ok()).toBe(true);
  await expect(reset.json()).resolves.toMatchObject({
    conversationId,
    status: "reset",
  });
  await expect(readHistory(request, conversationId)).resolves.toMatchObject({
    messages: [],
  });
});

const openPersistentWidget = async (page: Page) => {
  await page.goto(`/?mode=local-service&authToken=${authToken}&workspaceId=${workspaceId}`);
  await expect(page.getByRole("region", { name: "Workspace Assistant" })).toBeVisible();
};

const expectPersistentServiceHealth = async (request: APIRequestContext) => {
  const response = await request.get(`${serviceBaseUrl}/healthz`);
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    persistence: "postgres-drizzle",
    providerId: "fake",
    status: "ok",
  });
};

/**
 * Send one message and read its turn identity + usage from the resumable flow.
 *
 * `POST /chat/runs` returns the conversation id as JSON; the usage total arrives
 * on the `completed` event in the `GET /chat/turns/:id/stream` SSE body. Waiting
 * on both responses mirrors how the widget drives a turn.
 */
const sendAndReadTurn = async (
  page: Page,
  message: string,
): Promise<{ readonly conversationId: string; readonly totalTokens: number }> => {
  const runResponse = page.waitForResponse((response) =>
    response.url().includes("/side-chat-api/chat/runs"),
  );
  const streamResponse = page.waitForResponse((response) =>
    /\/side-chat-api\/chat\/turns\/[^/]+\/stream/u.test(response.url()),
  );

  await page.getByLabel("Message").fill(message);
  await page.getByRole("button", { name: "Send" }).click();

  const conversationId = readConversationId(await (await runResponse).text());
  const totalTokens = readTotalTokens(await (await streamResponse).text());
  return { conversationId, totalTokens };
};

const readConversationId = (body: string): string => {
  const match = /"conversationId":"([^"]+)"/u.exec(body);
  if (!match?.[1]) throw new Error("Expected the run response to include a conversation id.");
  return match[1];
};

const readTotalTokens = (body: string): number => {
  const match = /"totalTokens":(?<totalTokens>\d+)/u.exec(body);
  if (!match?.groups?.["totalTokens"]) {
    throw new Error("Expected the turn stream to include usage total tokens.");
  }
  return Number(match.groups["totalTokens"]);
};

const readHistory = async (
  request: APIRequestContext,
  conversationId: string,
): Promise<{ readonly messages: readonly { readonly content: string }[] }> => {
  const response = await request.get(`${serviceBaseUrl}/chat/history/${conversationId}`, {
    headers: authHeaders(),
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as { readonly messages: readonly { readonly content: string }[] };
};

const expectPersistentUsage = async (request: APIRequestContext, totalTokens: number) => {
  const response = await request.get(`${serviceBaseUrl}/usage`, {
    headers: authHeaders(),
  });
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    totalTokens,
  });
};

const authHeaders = () => ({
  authorization: `Bearer ${authToken}`,
});

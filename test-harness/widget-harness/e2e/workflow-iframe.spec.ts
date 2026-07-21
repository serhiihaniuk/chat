import { isRecord } from "@side-chat/shared";
import { expect, test } from "playwright/test";

const hostPort = readPort("SIDECHAT_WORKFLOW_HOST_PORT", 5181);
const hostBaseUrl = `http://127.0.0.1:${String(hostPort)}`;
const workflowFixturePort = readPort("SIDECHAT_WORKFLOW_FIXTURE_PORT", 8788);
const workflowFixtureUrl = `http://127.0.0.1:${String(workflowFixturePort)}`;
const workspaceId = "workspace_iframe_context";
const authToken = "iframe-local-test-token";

test("collects opted-in page context through the public iframe adapter", async ({
  page,
  request,
}) => {
  await request.post(`${workflowFixtureUrl}/__test/reset`);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto(
    `${hostBaseUrl}/workbench-embed.html?open=true` +
      `&authToken=${encodeURIComponent(authToken)}` +
      `&workspaceId=${encodeURIComponent(workspaceId)}` +
      `&apiBaseUrl=${encodeURIComponent("/side-chat-api")}` +
      `&framePath=${encodeURIComponent("/side-chat-frame/")}`,
  );

  const frame = page.frameLocator('iframe[title="Workspace Assistant"]');
  await expect(frame.getByRole("region", { name: "Workspace Assistant" })).toBeVisible({
    timeout: 15_000,
  });
  await frame.getByRole("button", { name: "Add context and tools" }).click();
  const contextToggle = frame.getByRole("menuitemcheckbox", { name: /Include page context/u });
  await expect(contextToggle).toBeVisible();
  await expect(contextToggle).toHaveAttribute("aria-checked", "false");
  await contextToggle.click();
  await expect(contextToggle).toHaveAttribute("aria-checked", "true");
  await contextToggle.press("Escape");
  await expect(contextToggle).toBeHidden();

  const turnRequest = page.waitForRequest((candidate) =>
    /\/side-chat-api\/api\/chat(?:\?|$)/u.test(candidate.url()),
  );
  await frame.getByLabel("Message").fill("iframe context contract");
  await frame.getByRole("button", { name: "Send" }).click();

  const body: unknown = (await turnRequest).postDataJSON();
  expect(isRecord(body)).toBe(true);
  if (!isRecord(body)) throw new Error("Expected a workflow request object.");
  const hostContext = body["hostContext"];
  expect(isRecord(hostContext)).toBe(true);
  if (!isRecord(hostContext)) throw new Error("Expected opted-in host context.");
  expect(hostContext["origin"]).toBe(hostBaseUrl);
  expect(hostContext["url"]).toBe(`${hostBaseUrl}/workbench-embed.html`);
  expect(hostContext["title"]).toBe("Workbench Embed Harness");
  expect(JSON.stringify(hostContext)).not.toContain(authToken);

  const metadata = hostContext["metadata"];
  expect(isRecord(metadata)).toBe(true);
  if (!isRecord(metadata)) throw new Error("Expected host-context metadata.");
  expect(metadata["requestId"]).toBe(body["requestId"]);
  expect(metadata["workspaceId"]).toBe(workspaceId);
  expect(metadata["collectedAt"]).toEqual(expect.any(String));
  expect(metadata["surface"]).toEqual({
    resourceType: "workbench",
    surfaceId: "workbench-record-list",
  });

  await request.post(`${workflowFixtureUrl}/__test/complete`);
  await expect(frame.getByText(/workflow answer/u)).toBeVisible();
  expect(pageErrors).toEqual([]);
});

function readPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

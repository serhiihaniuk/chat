import { afterEach, describe, expect, it, vi } from "vitest";
import type { SidechatRequest } from "@side-chat/shared-protocol";
import { createFakeModelAdapter } from "#adapters/ai/fake-model.js";

const request = {
  workspaceId: "demo-workspace",
  message: { id: "msg-1", role: "user", content: "explain this report" },
  model: { provider: "openai", id: "gpt-4.1-mini" },
} satisfies SidechatRequest;

describe("fakeModelAdapter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits before emitting mocked chunks so streaming is visible", async () => {
    vi.useFakeTimers();
    const iterator = createFakeModelAdapter({ chunkDelayMs: 50 })
      .stream(request)
      [Symbol.asyncIterator]();
    let firstChunkSettled = false;
    const firstChunk = iterator.next().then((result) => {
      firstChunkSettled = true;
      return result;
    });

    await Promise.resolve();
    expect(firstChunkSettled).toBe(false);

    await vi.advanceTimersByTimeAsync(49);
    expect(firstChunkSettled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(firstChunk).resolves.toMatchObject({
      value: { kind: "delta", text: "# Assistant answer\n" },
      done: false,
    });

    await iterator.return?.();
  });

  it("streams a rich deterministic markdown response", async () => {
    const chunks = [];

    for await (const chunk of createFakeModelAdapter({
      chunkDelayMs: 0,
    }).stream(request)) {
      chunks.push(chunk);
    }

    const deltas = chunks.filter((chunk) => chunk.kind === "delta");
    const done = chunks.find((chunk) => chunk.kind === "done");
    const content = deltas.map((chunk) => chunk.text).join("");

    expect(deltas).toHaveLength(10);
    expect(content).toContain("## Mocked streaming process");
    expect(content).toContain("| Feature | Demo value |");
    expect(content).toContain("1. Parse the workspace context.");
    expect(content).toContain("```ts");
    expect(content).toContain("- [ ] Review the highlighted metrics");
    expect(done).toMatchObject({
      kind: "done",
      usage: {
        inputTokens: 3,
        outputTokens: expect.any(Number),
        totalTokens: expect.any(Number),
      },
    });
    if (done?.kind === "done") {
      expect(done.usage.outputTokens).toBeGreaterThan(18);
      expect(done.usage.totalTokens).toBe(
        done.usage.inputTokens + done.usage.outputTokens,
      );
    }
  });

  it("asks for report choices before generating a generic report", async () => {
    const chunks = [];

    for await (const chunk of createFakeModelAdapter({
      chunkDelayMs: 0,
    }).stream({
      ...request,
      message: { id: "msg-report", role: "user", content: "generate a report" },
    })) {
      chunks.push(chunk);
    }

    const content = chunks
      .filter((chunk) => chunk.kind === "delta")
      .map((chunk) => chunk.text)
      .join("");

    expect(chunks.some((chunk) => chunk.kind === "tool")).toBe(false);
    expect(content).toContain("use defaults");
    expect(content).toContain("Focus:");
    expect(content).toContain("Sections:");
    expect(content).toContain("Risk review");
    expect(content).toContain("Client coverage");
    expect(content).toContain("Custom wording");
    expect(content).not.toContain("Suitability");
    expect(content).not.toMatch(
      /executive_summary|risk_review|client_coverage|portfolio_allocation|biggest_clients|risk_accounts|product_allocation|net_new_money_trend/,
    );
  });

  it("generates the report when the user asks to use defaults", async () => {
    const generated = vi.fn(async () => ({
      reportId: "report-1",
      fileName: "report-1.pdf",
      reportUrl: "http://127.0.0.1:3000/reports/report-1.pdf",
      title: "Advisory Dashboard Briefing",
      pages: 1 as const,
      sections: ["kpis", "biggest_clients", "risk_accounts"] as const,
    }));
    const chunks = [];

    for await (const chunk of createFakeModelAdapter({
      chunkDelayMs: 0,
    }).stream({
      ...request,
      message: {
        id: "msg-report-default",
        role: "user",
        content: "use defaults for the report",
      },
      workbenchReports: { generate: generated },
      workbenchTools: {
        async query({ query }) {
          return {
            query: query.query,
            workspaceId: "demo-workspace",
            data: {},
            sources: [],
          };
        },
      },
      userId: "local-user",
    })) {
      chunks.push(chunk);
    }

    expect(generated).toHaveBeenCalledOnce();
    expect(generated).toHaveBeenCalledWith(
      expect.objectContaining({
        report: expect.objectContaining({
          noteKind: "next_action",
          note: expect.stringContaining("RM handoff"),
        }),
      }),
    );
    expect(
      chunks.some(
        (chunk) =>
          chunk.kind === "tool" &&
          chunk.toolName === "generate_workbench_report" &&
          chunk.status === "completed",
      ),
    ).toBe(true);
  });

  it("gathers risk data before generating a specific top-risk report", async () => {
    const generated = vi.fn(async () => ({
      reportId: "report-risk",
      fileName: "report-risk.pdf",
      reportUrl: "http://127.0.0.1:3000/reports/report-risk.pdf",
      title: "Top Risk Portfolios - Risk Report",
      pages: 1 as const,
      sections: ["kpis", "risk_accounts", "biggest_clients", "net_new_money_trend"] as const,
    }));
    const queried = vi.fn(async ({ query }) => ({
      query: query.query,
      workspaceId: "demo-workspace",
      data: [],
      sources: [],
    }));
    const chunks = [];

    for await (const chunk of createFakeModelAdapter({
      chunkDelayMs: 0,
    }).stream({
      ...request,
      message: {
        id: "msg-risk-report",
        role: "user",
        content:
          "gather data about our top risk portfolios then generate a risk report",
      },
      workbenchReports: { generate: generated },
      workbenchTools: { query: queried },
      userId: "local-user",
    })) {
      chunks.push(chunk);
    }

    expect(queried).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { query: "top_risk_accounts" },
      }),
    );
    expect(generated).toHaveBeenCalledWith(
      expect.objectContaining({
        report: expect.objectContaining({
          title: "Top Risk Portfolios - Risk Report",
          focus: "risk_review",
          noteKind: "risk_rationale",
          sections: ["kpis", "risk_accounts", "biggest_clients", "net_new_money_trend"],
        }),
      }),
    );
    expect(
      chunks
        .filter((chunk) => chunk.kind === "delta")
        .map((chunk) => chunk.text)
        .join(""),
    ).toBe("Report ready.");
  });

  it("does not generate a report for unrelated workbench questions", async () => {
    const generated = vi.fn();
    const queried = vi.fn(async ({ query }) => ({
      query: query.query,
      workspaceId: "demo-workspace",
      data: {},
      sources: [],
    }));
    const chunks = [];

    for await (const chunk of createFakeModelAdapter({
      chunkDelayMs: 0,
    }).stream({
      ...request,
      message: {
        id: "msg-biggest-client",
        role: "user",
        content: "Who is our biggest client?",
      },
      workbenchReports: { generate: generated },
      workbenchTools: { query: queried },
      userId: "local-user",
    })) {
      chunks.push(chunk);
    }

    expect(generated).not.toHaveBeenCalled();
    expect(
      chunks.some(
        (chunk) =>
          chunk.kind === "tool" &&
          chunk.toolName === "generate_workbench_report",
      ),
    ).toBe(false);
  });

  it("uses a workbench lookup for natural biggest-client questions", async () => {
    const queried = vi.fn(async ({ query }) => ({
      query: query.query,
      workspaceId: "demo-workspace",
      data: [],
      sources: [],
    }));
    const chunks = [];

    for await (const chunk of createFakeModelAdapter({
      chunkDelayMs: 0,
    }).stream({
      ...request,
      message: {
        id: "msg-biggest-client-natural",
        role: "user",
        content: "Who is our biggest client?",
      },
      workbenchTools: { query: queried },
      userId: "local-user",
    })) {
      chunks.push(chunk);
    }

    expect(queried).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { query: "client_portfolio_review" },
      }),
    );
    expect(
      chunks.some(
        (chunk) =>
          chunk.kind === "tool" &&
          chunk.toolName === "workbench_query" &&
          chunk.status === "completed",
      ),
    ).toBe(true);
  });

  it("uses multiple backend lookups for the source-backed risk brief quick action", async () => {
    const queried = vi.fn(async ({ query }) => ({
      query: query.query,
      workspaceId: "demo-workspace",
      data: [],
      sources: [],
    }));
    const surfaceContext = vi.fn(async () => ({
      resourceId: "advisoryWorklist",
      label: "Portfolio Worklist",
      workspaceId: "demo-workspace",
      rowCount: 12,
      totalRowCount: 102,
      rows: [],
      sources: [],
    }));
    const chunks = [];

    for await (const chunk of createFakeModelAdapter({
      chunkDelayMs: 0,
    }).stream({
      ...request,
      message: {
        id: "msg-risk-brief",
        role: "user",
        content:
          "Build a source-backed command-center brief for the Advisory Dashboard.",
      },
      workbenchTools: { query: queried, surfaceContext },
      userId: "local-user",
    })) {
      chunks.push(chunk);
    }

    expect(queried.mock.calls.map(([input]) => input.query.query)).toEqual([
      "dashboard_snapshot",
      "client_portfolio_review",
      "top_risk_accounts",
      "product_allocation",
      "net_new_money_trend",
    ]);
    expect(surfaceContext).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: "advisoryWorklist",
        limit: 12,
      }),
    );
    expect(
      chunks.filter(
        (chunk) => chunk.kind === "tool" && chunk.status === "completed",
      ),
    ).toHaveLength(6);
  });

  it("emits a host command for dashboard sorting requests", async () => {
    const chunks = [];

    for await (const chunk of createFakeModelAdapter({
      chunkDelayMs: 0,
    }).stream({
      ...request,
      message: {
        id: "msg-best-performing",
        role: "user",
        content: "show best performing portfolios",
      },
    })) {
      chunks.push(chunk);
    }

    expect(chunks[0]).toMatchObject({
        kind: "host-command",
        command: {
          type: "grid.applyView",
          resourceId: "advisoryWorklist",
          view: {
            sort: [{ columnId: "netFlow30dChf", direction: "desc" }],
          },
      },
    });
    expect(
      chunks
        .filter((chunk) => chunk.kind === "delta")
        .map((chunk) => chunk.text)
        .join(""),
    ).toContain("Portfolio Worklist");
  });
});

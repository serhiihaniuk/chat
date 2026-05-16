import { describe, expect, it } from "vitest";

import { createWorkbenchTools } from "#adapters/workbench/workbench-tools-adapter.js";
import { createMemoryHostSurfaceState } from "#inbound/hono/composition/host-surface-state.js";

describe("workbench tools adapter", () => {
  it("uses deterministic fallback data when no database url is configured", async () => {
    const tools = createWorkbenchTools();

    const result = await tools.query({
      workspaceId: "demo-workspace",
      userId: "local-user",
      query: { query: "client_portfolio_review" },
    });

    expect(result.query).toBe("client_portfolio_review");
    expect(result.workspaceId).toBe("demo-workspace");
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.sources[0]).toMatchObject({
      dataset: "client_portfolio_review",
      label: expect.stringContaining("Ackermann Family Office"),
    });
  });

  it("derives current surface context from backend host surface state", async () => {
    const hostSurfaceState = createMemoryHostSurfaceState();
    const tools = createWorkbenchTools(undefined, hostSurfaceState);

    await hostSurfaceState.applyCommand({
      workspaceId: "demo-workspace",
      userId: "local-user",
      conversationId: "demo-conversation-001",
      command: {
        type: "grid.applyView",
        resourceId: "advisoryWorklist",
        view: {
          filters: [
            {
              columnId: "priority",
              operator: "equals",
              value: "High",
            },
          ],
          sort: [{ columnId: "dueDate", direction: "asc" }],
        },
      },
    });

    const context = await tools.surfaceContext?.({
      workspaceId: "demo-workspace",
      userId: "local-user",
      conversationId: "demo-conversation-001",
      pageContext: undefined,
      resourceId: "Portfolio Worklist",
      limit: 5,
    });

    expect(context).toMatchObject({
      resourceId: "advisoryWorklist",
      label: "Portfolio Worklist",
      rowCount: 2,
      filters: [{ columnId: "priority", operator: "equals", value: "High" }],
      sort: [{ columnId: "dueDate", direction: "asc" }],
    });
    expect(context?.rows.map((row) => row.cells.priority)).toEqual([
      "High",
      "High",
    ]);
  });

  it("applies visible worklist filters with the same semantics as host commands", async () => {
    const hostSurfaceState = createMemoryHostSurfaceState();
    const tools = createWorkbenchTools(undefined, hostSurfaceState);

    await hostSurfaceState.applyCommand({
      workspaceId: "demo-workspace",
      userId: "local-user",
      conversationId: "demo-conversation-001",
      command: {
        type: "grid.applyView",
        resourceId: "advisoryWorklist",
        view: {
          filters: [
            {
              columnId: "client",
              operator: "contains",
              value: "medtech",
            },
            {
              columnId: "riskExposureChf",
              operator: "greaterThanOrEqual",
              value: 100_000_000,
            },
            {
              columnId: "dueDate",
              operator: "between",
              value: ["2025-07-01", "2025-07-09"],
            },
          ],
          sort: [{ columnId: "client", direction: "asc" }],
        },
      },
    });

    const context = await tools.surfaceContext?.({
      workspaceId: "demo-workspace",
      userId: "local-user",
      conversationId: "demo-conversation-001",
      pageContext: undefined,
      resourceId: "advisoryWorklist",
      limit: 5,
    });

    expect(context).toMatchObject({
      resourceId: "advisoryWorklist",
      rowCount: 1,
      totalRowCount: 7,
      filters: [
        { columnId: "client", operator: "contains", value: "medtech" },
        {
          columnId: "riskExposureChf",
          operator: "greaterThanOrEqual",
          value: 100_000_000,
        },
        {
          columnId: "dueDate",
          operator: "between",
          value: ["2025-07-01", "2025-07-09"],
        },
      ],
    });
    expect(context?.rows).toEqual([
      expect.objectContaining({
        id: "review-global-medtech-inc",
        label: "Global MedTech Inc.",
        cells: expect.objectContaining({
          riskIssue: "Liquidity gap",
          dueDate: "2025-07-08",
        }),
      }),
    ]);
  });
});

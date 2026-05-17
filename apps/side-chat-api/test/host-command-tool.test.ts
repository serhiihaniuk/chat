import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  hostCommandToolDescription,
  hostCommandInputSchema,
  toHostCommand,
} from "#adapters/workbench/host-command-tool.js";

const defaultCommandBarFields = {
  workbenchViewQueue: "default",
  clientSegment: "all",
  priority: "all",
  riskCategory: "all",
  dueStatus: "all",
  relationshipManager: "all",
  sortBy: "aumDesc",
  quickFilters: [],
} as const;

describe("host command tool adapter", () => {
  it("uses a flat host command input schema that OpenAI tool calling accepts", () => {
    const jsonSchema = JSON.stringify(z.toJSONSchema(hostCommandInputSchema));

    expect(jsonSchema).not.toContain("oneOf");
    expect(jsonSchema).not.toContain("anyOf");
    expect(jsonSchema).not.toContain("allOf");
  });

  it("teaches the model to prefer the Workbench command bar for page controls", () => {
    expect(hostCommandToolDescription).toContain("top Workbench command bar");
    expect(hostCommandToolDescription).toContain("largest outflow");
    expect(hostCommandToolDescription).toContain("quickFilters largestOutflow");
    expect(hostCommandToolDescription).toContain("sortBy riskExposureDesc");
    expect(hostCommandToolDescription).toContain("generic apply_grid_view only");
  });

  it("maps model-facing host command input to the protocol command shape", () => {
    expect(
      toHostCommand({
        action: "apply_grid_view",
        resourceId: "advisoryWorklist",
        ...defaultCommandBarFields,
        filters: [
          {
            columnId: "dueDate",
            operator: "notBlank",
            value: "",
          },
        ],
        sort: [{ columnId: "dueDate", direction: "asc" }],
        highlightRowIds: [],
        reason: "Show rows with a due date.",
      }),
    ).toEqual({
      type: "grid.applyView",
      resourceId: "advisoryWorklist",
      view: {
        filters: [{ columnId: "dueDate", operator: "notBlank" }],
        sort: [{ columnId: "dueDate", direction: "asc" }],
        highlightRowIds: [],
      },
    });
  });

  it("canonicalizes host resource and column labels to ids", () => {
    expect(
      toHostCommand(
        {
          action: "apply_grid_view",
          resourceId: "Portfolio Worklist",
          ...defaultCommandBarFields,
          filters: [],
          sort: [{ columnId: "Segment", direction: "asc" }],
          highlightRowIds: [],
          reason: "Sort the visible worklist.",
        },
        {
          pageId: "advisory-workbench",
          title: "Advisory Workbench",
          resources: [
            {
              id: "advisoryWorklist",
              kind: "grid",
              label: "Portfolio Worklist",
              columns: [{ id: "segment", label: "Segment", type: "text" }],
            },
          ],
        },
      ),
    ).toEqual({
      type: "grid.applyView",
      resourceId: "advisoryWorklist",
      view: {
        filters: [],
        sort: [{ columnId: "segment", direction: "asc" }],
        highlightRowIds: [],
      },
    });
  });

  it("maps command bar controls to the same grid view command the host applies", () => {
    expect(
      toHostCommand({
        action: "apply_workbench_controls",
        resourceId: "Workbench Command Bar",
        filters: [],
        sort: [],
        highlightRowIds: [],
        workbenchViewQueue: "riskQueue",
        clientSegment: "Corporate",
        priority: "High",
        riskCategory: "liquidity",
        dueStatus: "Overdue",
        relationshipManager: "R. Li",
        sortBy: "outflowAsc",
        quickFilters: ["largestOutflow"],
        reason: "Show high-priority overdue liquidity names with outflows.",
      }),
    ).toEqual({
      type: "grid.applyView",
      resourceId: "advisoryWorklist",
      view: {
        filters: [
          { columnId: "priority", operator: "notEquals", value: "None" },
          { columnId: "segment", operator: "equals", value: "Corporate" },
          { columnId: "priority", operator: "equals", value: "High" },
          { columnId: "riskIssue", operator: "contains", value: "liquidity" },
          { columnId: "dueStatus", operator: "equals", value: "Overdue" },
          {
            columnId: "relationshipManager",
            operator: "equals",
            value: "R. Li",
          },
          { columnId: "netFlow30dChf", operator: "lessThan", value: 0 },
        ],
        sort: [{ columnId: "netFlow30dChf", direction: "asc" }],
        highlightRowIds: [],
      },
    });
  });

  it("combines command bar queue, quick filters, and sort intent", () => {
    expect(
      toHostCommand({
        action: "apply_workbench_controls",
        resourceId: "advisoryWorkbenchControls",
        filters: [],
        sort: [],
        highlightRowIds: [],
        workbenchViewQueue: "priorityFirst",
        clientSegment: "all",
        priority: "all",
        riskCategory: "all",
        dueStatus: "all",
        relationshipManager: "all",
        sortBy: "riskExposureDesc",
        quickFilters: ["overdue", "highPriority"],
        reason: "Show overdue high-priority names in priority order.",
      }),
    ).toEqual({
      type: "grid.applyView",
      resourceId: "advisoryWorklist",
      view: {
        filters: [
          { columnId: "dueStatus", operator: "equals", value: "Overdue" },
          { columnId: "priority", operator: "equals", value: "High" },
        ],
        sort: [
          { columnId: "priority", direction: "asc" },
          { columnId: "dueDate", direction: "asc" },
        ],
        highlightRowIds: [],
      },
    });
  });
});

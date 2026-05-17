import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  hostCommandInputSchema,
  toHostCommand,
} from "#adapters/workbench/host-command-tool.js";

describe("host command tool adapter", () => {
  it("uses a flat host command input schema that OpenAI tool calling accepts", () => {
    const jsonSchema = JSON.stringify(z.toJSONSchema(hostCommandInputSchema));

    expect(jsonSchema).not.toContain("oneOf");
    expect(jsonSchema).not.toContain("anyOf");
    expect(jsonSchema).not.toContain("allOf");
  });

  it("maps model-facing host command input to the protocol command shape", () => {
    expect(
      toHostCommand({
        action: "apply_grid_view",
        resourceId: "advisoryWorklist",
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
});

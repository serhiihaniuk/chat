import type {
  HostCommand,
  HostCommandResult,
  HostContextSnapshot,
} from "@side-chat/shared-protocol";
import type { HostSurfaceRegistration } from "../../../shared/host-surface/HostSurfaceProvider.js";
import type { AdvisoryDashboardSnapshot } from "./advisory-dashboard.types.js";
import { isAdvisoryGridResourceId } from "./grid-view-state.js";

const createAdvisoryWorkbenchHostContext = (
  snapshot: AdvisoryDashboardSnapshot | null,
): HostContextSnapshot => ({
  pageId: "advisory-workbench",
  title: "UBS Partner Advisory Workbench",
  summary:
    "Single-page advisory dashboard with KPIs and a unified portfolio worklist combining relationship, portfolio performance, risk, due-date, and next-action fields.",
  resources: [
    {
      id: "advisoryWorklist",
      kind: "grid",
      label: "Portfolio Worklist",
      rowCount: snapshot?.clientPortfolioReview.length,
      columns: [
        { id: "client", label: "Client", type: "text", filterable: true },
        { id: "segment", label: "Segment", type: "text", filterable: true },
        { id: "aumChf", label: "AUM", type: "currency", sortable: true },
        {
          id: "netFlow30dChf",
          label: "30D Net Flow",
          type: "currency",
          sortable: true,
        },
        {
          id: "riskScore",
          label: "Risk Score",
          type: "number",
          sortable: true,
          filterable: true,
        },
        {
          id: "coverageStatus",
          label: "Coverage Status",
          type: "text",
          filterable: true,
        },
        {
          id: "hasAlert",
          label: "Alert",
          type: "boolean",
          sortable: true,
          filterable: true,
        },
        {
          id: "riskIssue",
          label: "Risk / Task",
          type: "text",
          filterable: true,
        },
        {
          id: "riskExposureChf",
          label: "Risk Exposure",
          type: "currency",
          sortable: true,
          filterable: true,
        },
        {
          id: "priority",
          label: "Priority",
          type: "text",
          sortable: true,
          filterable: true,
        },
        {
          id: "relationshipManager",
          label: "RM",
          type: "text",
          filterable: true,
        },
        {
          id: "dueDate",
          label: "Due Date",
          type: "date",
          sortable: true,
          filterable: true,
        },
        {
          id: "dueStatus",
          label: "Due Status",
          type: "text",
          sortable: true,
          filterable: true,
        },
        { id: "nextAction", label: "Next Action", type: "text" },
      ],
    },
  ],
  capabilities: [
    {
      id: "grid-view-control",
      label: "Grid view control",
      description:
        "Active surface can apply validated grid filters, sorts, focus, and row highlights.",
      commandTypes: ["grid.applyView", "grid.clearView", "ui.focusResource"],
    },
  ],
});

const dispatchAdvisoryWorkbenchHostCommand = async (
  command: HostCommand,
): Promise<HostCommandResult> => {
  if (
    (command.type === "grid.applyView" ||
      command.type === "grid.clearView" ||
      command.type === "ui.focusResource") &&
    !isAdvisoryGridResourceId(command.resourceId)
  ) {
    return {
      status: "unsupported",
      message: `Unknown host resource: ${command.resourceId}`,
    };
  }

  window.dispatchEvent(
    new CustomEvent("sidechat:host-command", { detail: command }),
  );
  return { status: "applied" };
};

export const createAdvisoryWorkbenchHostSurface = (
  snapshot: AdvisoryDashboardSnapshot | null,
): HostSurfaceRegistration => ({
  id: "advisory-workbench",
  getContext: () => createAdvisoryWorkbenchHostContext(snapshot),
  dispatchCommand: dispatchAdvisoryWorkbenchHostCommand,
});

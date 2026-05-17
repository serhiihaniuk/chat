import type {
  HostCommand,
  HostCommandResult,
  HostContextSnapshot,
} from "@side-chat/shared-protocol";
import type { HostSurfaceRegistration } from "../../../shared/host-surface/HostSurfaceProvider.js";
import type { AdvisoryDashboardSnapshot } from "./advisory-dashboard.types.js";
import type { AdvisoryGridViewState } from "./grid-view-state.js";
import { isAdvisoryGridResourceId } from "./grid-view-state.js";
import {
  formatWorkbenchControlSummary,
  type WorkbenchControlState,
} from "./workbench-controls.js";

/**
 * Host-context adapter for the Workbench page. It tells the assistant what UI
 * resources exist without giving the widget direct access to host internals.
 */
const createAdvisoryWorkbenchHostContext = (
  snapshot: AdvisoryDashboardSnapshot | null,
  controls: WorkbenchControlState,
  worklistView: AdvisoryGridViewState | undefined,
): HostContextSnapshot => ({
  pageId: "advisory-workbench",
  title: "UBS Partner Advisory Workbench",
  summary: [
    "Single-page advisory dashboard with a top command bar and a unified portfolio worklist combining relationship, portfolio performance, risk, due-date, and next-action fields.",
    `Current command bar: ${formatWorkbenchControlSummary(controls)}.`,
  ].join(" "),
  resources: [
    {
      id: "advisoryWorkbenchControls",
      kind: "custom",
      label: "Workbench Command Bar",
      description:
        "Human and AI control bar for queue/view, client segment, priority, risk category, due status, RM/advisor, sort, and quick filters.",
      metadata: {
        currentControls: controls,
        currentControlSummary: formatWorkbenchControlSummary(controls),
      },
    },
    {
      id: "advisoryWorklist",
      kind: "grid",
      label: "Portfolio Worklist",
      rowCount: snapshot?.clientPortfolioReview.length,
      metadata: {
        currentControls: controls,
        currentControlSummary: formatWorkbenchControlSummary(controls),
        ...(worklistView
          ? { currentView: toHostContextGridView(worklistView) }
          : {}),
      },
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
          label: "Risk / Issue",
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
      id: "workbench-command-bar",
      label: "Workbench command bar",
      description:
        "Apply the same top-bar controls a human can click: queue/view, client segment, priority, risk category, due status, RM/advisor, sorting, and quick active filters.",
      commandTypes: ["grid.applyView", "grid.clearView", "ui.focusResource"],
    },
    {
      id: "grid-view-control",
      label: "Portfolio Worklist view control",
      description:
        "Active surface can apply validated grid filters, sorts, focus, and row highlights. Prefer the Workbench command bar controls for common dashboard operations.",
      commandTypes: ["grid.applyView", "grid.clearView", "ui.focusResource"],
    },
  ],
  metadata: {
    asOfDate: snapshot?.asOfDate,
    dateRangeLabel: snapshot?.dateRange.label,
  },
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

/**
 * Registration consumed by HostSurfaceProvider. This is the boundary between
 * reusable widget commands and the concrete Workbench page.
 */
export const createAdvisoryWorkbenchHostSurface = (
  snapshot: AdvisoryDashboardSnapshot | null,
  controls: WorkbenchControlState,
  worklistView?: AdvisoryGridViewState,
): HostSurfaceRegistration => ({
  id: "advisory-workbench",
  getContext: () =>
    createAdvisoryWorkbenchHostContext(snapshot, controls, worklistView),
  dispatchCommand: dispatchAdvisoryWorkbenchHostCommand,
});

const toHostContextGridView = (view: AdvisoryGridViewState) => ({
  filters: view.filters,
  sort: view.sort,
  highlightRowIds: view.highlightRowIds,
});

export type QuickAction = {
  readonly disabled?: boolean;
  readonly displayContent?: string;
  readonly icon?: QuickActionIcon;
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
};

export type QuickActionIcon =
  | "calendar"
  | "database"
  | "file"
  | "list"
  | "trophy"
  | "warning";

export const sourceBackedBriefPrompt =
  "Build a source-backed command-center brief for the Advisory Dashboard. Before answering, check the approved dashboard sources for KPIs, the current Portfolio Worklist view, top risk accounts, product allocation, and Net New Money trend. Then answer with: 1) executive readout, 2) top 3 risk portfolios with RM, due date, exposure, and 30D flow, 3) allocation or money-flow signal, and 4) next actions.";

export const defaultQuickActions: readonly QuickAction[] = [
  {
    displayContent: "Summary",
    icon: "list",
    id: "summary",
    label: "Summary",
    prompt: "Summarize this page",
  },
  {
    displayContent: "Risk brief",
    icon: "database",
    id: "risk-brief",
    label: "Risk brief",
    prompt: sourceBackedBriefPrompt,
  },
  {
    displayContent: "Report",
    icon: "file",
    id: "report",
    label: "Report",
    prompt: "Generate a report",
  },
  {
    displayContent: "Top client",
    icon: "trophy",
    id: "top-client",
    label: "Top client",
    prompt: "Who is our biggest client?",
  },
  {
    icon: "warning",
    id: "risk",
    label: "Risk",
    prompt:
      "Filter the table to the highest risk portfolios and tell me the highlights.",
  },
  {
    icon: "calendar",
    id: "due",
    label: "Due",
    prompt:
      "Filter the table to overdue tasks due first and tell me the highlights.",
  },
];

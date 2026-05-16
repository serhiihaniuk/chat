import type { PageContextPort } from "#ports/index.js";

export const createDefaultPageContext = (): PageContextPort => ({
  async resolve({ workspaceId }) {
    if (workspaceId !== "demo-workspace") return undefined;

    return {
      pageId: "advisory-workbench",
      title: "UBS Partner Advisory Workbench",
      summary:
        "A single-page UBS Partner dashboard for relationship, portfolio performance, advisory coverage, risk, and compliance review.",
      facts: [
        "Top KPIs include Total AUM CHF 24.8B, Net New Money CHF 562M, Advisory Coverage 78%, At-Risk Accounts 52, Client Meetings 212, and Compliance Alerts 7.",
        "The primary table is Portfolio Worklist, a unified AG Grid surface combining client segment, AUM, 30D net flow, risk score, coverage status, priority, risk/task, exposure, due date, due status, relationship manager, next action, and alert state.",
        "The assistant can request filters and sorts on the Portfolio Worklist, including due-date, due-status, risk, flow, coverage, priority, relationship-manager, and alert views.",
        "The visual direction is UBS-inspired: restrained white, charcoal, light gray dividers, and red accent.",
      ],
    };
  },
});

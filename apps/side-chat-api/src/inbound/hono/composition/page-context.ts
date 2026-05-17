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
        "The top command bar is the primary interaction layer for both humans and the assistant: View / Queue, Client Segment, Priority, Risk Category, Due Status, RM / Advisor, Sort by, and quick filters for Largest outflow, Overdue, and High priority.",
        "Common page-control intents should use the top command bar: risk queue, priority first, due soon, overdue, high priority, largest outflow, biggest AUM, due-first sorting, risk-exposure sorting, relationship manager, segment, priority, risk category, and due status.",
        "The primary table is Portfolio Worklist, a unified AG Grid surface combining client segment, AUM, 30D net flow, risk score, coverage status, priority, risk/task, exposure, due date, due status, relationship manager, next action, and alert state.",
        "The assistant should use the command bar controls for common worklist views and only fall back to lower-level grid filters for views not expressible by the top controls.",
        "The visual direction is UBS-inspired: restrained white, charcoal, light gray dividers, and red accent.",
      ],
    };
  },
});

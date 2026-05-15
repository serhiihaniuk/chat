# UBS Partner Dashboard Data Plan

## Goal

Build a realistic single-page UBS Partner advisory workbench in `apps/embedded-host-app` backed by the existing Postgres database. The same stored-procedure-backed data access path should later be usable by assistant tools, so the dashboard and AI tool layer can answer questions about the exact same data.

This plan focuses on the demo page and data foundation. Assistant behavior should remain secondary until the dashboard and data path are solid.

## Target Architecture

```txt
Postgres 16
  -> UBS advisory schema, seed data, stored functions
    -> packages/db advisory dashboard functions
      -> apps/dashboard-data-api small read-only Hono service
        -> apps/embedded-host-app UBS Partner dashboard
      -> later assistant tools using the same packages/db functions
```

The existing `apps/side-chat-api` remains focused on chat streaming. The new dashboard data service is deliberately separate, small, read-only, and boring.

## Non-Negotiables

- Browser code must not connect directly to Postgres.
- Runtime DB access must go through `packages/db`.
- `packages/db` must call stored functions/procedures only.
- No direct runtime table selects or DML outside init SQL and tests.
- The dashboard data service must not become the assistant/chat backend.
- The embedded host app remains a single page with no real routes.
- Fake navigation, filters, export, table links, pagination, and secondary actions must be inert or no-op.

## App And Package Changes

### Add `apps/dashboard-data-api`

Purpose: read-only Hono service for UBS Partner dashboard data.

Suggested files:

```txt
apps/dashboard-data-api/
  package.json
  tsconfig.json
  src/
    server.ts
    app.ts
    config.ts
    routes/
      health.ts
      advisory-dashboard.ts
```

Suggested port: `3100`.

Root scripts can stay minimal, but useful workspace scripts:

```json
{
  "scripts": {
    "dev": "tsx src/server.ts",
    "build": "tsc -b"
  }
}
```

### Extend `packages/db`

Add advisory dashboard types and procedure wrappers.

Suggested files:

```txt
packages/db/src/
  advisory-dashboard.ts
  advisory-dashboard.types.ts
```

Suggested exported functions:

```ts
getAdvisoryDashboardSnapshot(workspaceId: string): Promise<AdvisoryDashboardSnapshot>
listClientPortfolioReview(workspaceId: string): Promise<ClientPortfolioReviewRow[]>
listTopRiskAccounts(workspaceId: string): Promise<TopRiskAccountRow[]>
listProductAllocation(workspaceId: string): Promise<ProductAllocationRow[]>
listNetNewMoneyTrend(workspaceId: string): Promise<NetNewMoneyTrendPoint[]>
```

Each function should call a stored function, for example:

```sql
select * from ubs_list_client_portfolio_review($1)
```

No dashboard SQL should be embedded in the API app.

### Extend `apps/embedded-host-app`

Replace the current generic dashboard with a UBS Partner advisory workbench.

Suggested structure:

```txt
apps/embedded-host-app/src/features/advisory-workbench/
  api/
    advisory-dashboard-client.ts
  model/
    advisory-dashboard.types.ts
  ui/
    AdvisoryWorkbenchPage.tsx
    Sidebar.tsx
    HeaderControls.tsx
    KpiGrid.tsx
    ClientPortfolioReviewTable.tsx
    TopRiskAccountsTable.tsx
    ProductAllocationTable.tsx
    NetNewMoneyTrendChart.tsx
```

Vite should proxy dashboard data calls:

```ts
server: {
  proxy: {
    "/advisory-dashboard": "http://127.0.0.1:3100",
    "/dashboard-health": "http://127.0.0.1:3100"
  }
}
```

## API Contract

Prefer one snapshot endpoint for the page render:

```txt
GET /advisory-dashboard/snapshot?workspaceId=demo-workspace
```

Response:

```ts
type AdvisoryDashboardSnapshot = {
  workspaceId: string;
  asOfDate: string;
  dateRange: {
    from: string;
    to: string;
    label: string;
  };
  kpis: AdvisoryKpi[];
  clientPortfolioReview: ClientPortfolioReviewRow[];
  topRiskAccounts: TopRiskAccountRow[];
  productAllocation: ProductAllocationRow[];
  netNewMoneyTrend: NetNewMoneyTrendPoint[];
};
```

Optional narrow endpoints for later tool demos and debugging:

```txt
GET /advisory-dashboard/clients?workspaceId=demo-workspace
GET /advisory-dashboard/risk-accounts?workspaceId=demo-workspace
GET /advisory-dashboard/product-allocation?workspaceId=demo-workspace
GET /advisory-dashboard/net-new-money-trend?workspaceId=demo-workspace
```

## Data Model

Seed deterministic UBS Partner demo data into the existing Postgres init flow.

Suggested schema namespace: `ubs_partner`.

Core tables:

```txt
ubs_partner.workspaces
ubs_partner.relationship_managers
ubs_partner.clients
ubs_partner.client_portfolio_reviews
ubs_partner.risk_accounts
ubs_partner.product_allocation
ubs_partner.net_new_money_trend
ubs_partner.dashboard_kpis
```

Use stable IDs:

```txt
workspace: demo-workspace
clients: client-ackermann-family-office, client-bauhaus-enterprises, ...
relationship managers: rm-s-meier, rm-m-keller, ...
```

Amounts should be numeric and presentation formatting should happen in the frontend, not in SQL.

## Stored Functions

Add functions to `docker/postgres/init/001_schema.sql`:

```sql
ubs_get_advisory_dashboard_snapshot(workspace_id text)
ubs_list_client_portfolio_review(workspace_id text)
ubs_list_top_risk_accounts(workspace_id text)
ubs_list_product_allocation(workspace_id text)
ubs_list_net_new_money_trend(workspace_id text)
```

Add deterministic rows to `docker/postgres/init/002_seed.sql`.

Grant only function execution to runtime role:

```sql
grant execute on function ... to sidechat_app;
```

Do not grant direct table read/write access to `sidechat_app`.

## Dashboard UI Content

Product label: `UBS Partner`.

Title: `Advisory Workbench`.

Subtitle: `Real-time overview of relationships, portfolio performance, advisory coverage, and risk.`

Top controls:

- date range
- filters
- export
- overflow

All controls are visual/no-op for now.

KPI cards:

- Total AUM
- Net New Money
- Advisory Coverage
- At-Risk Accounts
- Client Meetings
- Compliance Alerts

Main table: `Client Portfolio Review`.

Columns:

- Client
- Segment
- AUM
- 30D Net Flow
- Risk Profile
- Suitability Score
- Coverage Status
- Last Review
- RM
- Next Action
- Alert

Secondary table: `Top Risk Accounts`.

Columns:

- Client
- Issue
- Exposure
- Priority
- Owner
- Due Date

Secondary table: `Product Allocation Overview`.

Columns:

- Asset Class
- Current %
- Target %
- Drift
- Recommended Action

Chart:

- restrained red line chart: `Net New Money Trend`.

## Styling Direction

UBS-inspired, not startup/SaaS:

- white surfaces
- charcoal text
- light gray dividers
- red accent
- compact but readable financial tables
- thin borders
- small radius
- no gradients
- no playful blue accents
- no marketing hero layout

The dashboard should feel like an internal/partner-facing wealth platform.

## Detailed Styling Plan

The visual target is a dense UBS Partner workbench like the provided reference: a left vertical rail, a large white workspace, premium editorial title typography, restrained cards/tables, and red accent states.

### Overall Layout

- Full viewport app shell with a fixed-width left sidebar and a scrollable main workspace.
- Body background: very light neutral gray, close to `#f7f7f6`.
- Main content surface: white or near-white.
- Left rail width: about `96px` to `112px`.
- Main content padding: about `32px` to `40px` desktop, `20px` tablet, `16px` mobile.
- Max content width can be wide; this is an enterprise dashboard, not a centered marketing page.
- Use thin dividers instead of heavy shadows.
- Avoid nested cards inside cards; use cards for repeated KPI/table/chart surfaces only.

Suggested shell:

```txt
| sidebar | main workspace                                                       |
|  104px  | header controls                                                       |
|         | KPI grid                                                              |
|         | large client portfolio table                                          |
|         | bottom grid: risk table | allocation table | trend chart              |
```

### Color Tokens

Use a restrained UBS-inspired palette:

```css
--ubs-red: #e60000;
--ubs-red-dark: #b00000;
--ubs-red-soft: #fff1f1;
--ink: #171717;
--ink-muted: #5f6673;
--border: #e4e7eb;
--border-strong: #d7dce2;
--surface: #ffffff;
--surface-subtle: #f7f8f9;
--positive: #12805c;
--warning: #f59e0b;
--danger: #e60000;
```

Do not use blue as the primary accent. Blue may appear only as browser focus rings if unavoidable, but the designed accent should be red/charcoal.

### Typography

- Product label: small uppercase sans-serif, semibold, tracking subtle but not exaggerated.
- Page title: large serif or serif-like display if available, matching the reference. If no font is introduced, use `Georgia` or a system serif fallback for the page title only.
- Tables and operational UI: sans-serif, compact, precise.
- Numeric KPI values: large sans-serif, regular/medium weight, strong contrast.
- Avoid oversized SaaS-style headings inside cards.

Suggested scale:

```txt
Product label: 13px, 700
Page title: 42px-52px, serif, 400
Subtitle: 16px, muted
KPI label: 14px, 700
KPI value: 28px-34px
Table headers: 13px, 700
Table cells: 14px
Section titles: 18px-20px, 700
```

### Sidebar

The sidebar is visual-only navigation.

- White background.
- Right border `1px solid var(--border)`.
- UBS-like mark area at top. Use a simple text/monogram/icon placeholder if no logo asset exists.
- Items stacked vertically with icon + label.
- Active page: red icon/text and a red vertical indicator on the far left.
- Inactive items: muted charcoal/gray.
- Sidebar buttons must be `button` elements, not fake `<a href>`.
- Non-active items should be `disabled` or no-op with `aria-disabled`.
- Bottom collapse/admin item can be visual-only.

Items:

- Home active
- Clients
- Portfolio
- Analytics
- Tasks
- Compliance
- Reports
- Admin
- Collapse

### Header And Controls

Header left:

- Product label `UBS Partner`.
- Title `Advisory Workbench`.
- Subtitle `Real-time overview of relationships, performance and risk.`

Header right:

- Date range pill: `Apr 1 - Jun 30, 2025`
- Filters button
- Export button
- Overflow icon button

All controls are inert/no-op. Use disabled or no-op buttons with proper labels. The controls should still look credible.

Control styling:

- White background.
- Thin gray border.
- Small radius, about `6px` to `8px`.
- Height around `44px` to `52px`.
- Icons from `lucide-react`.
- Hover may be subtle only if no-op; do not imply routing.

### KPI Cards

Six cards in a responsive grid.

Desktop:

```txt
repeat(6, minmax(0, 1fr))
```

Tablet:

```txt
repeat(3, minmax(0, 1fr))
```

Mobile:

```txt
repeat(1 or 2, minmax(0, 1fr))
```

Card styling:

- White surface.
- Border `1px solid var(--border)`.
- Radius `6px` to `8px`.
- Padding `20px` to `24px`.
- Minimal shadow or none.
- Label row with info icon on the right.
- Value large and clear.
- Delta line below with green/red arrow and concise text.

KPI examples:

- `Total AUM` -> `CHF 24.8B` -> green `6.4% vs prior quarter`
- `Net New Money` -> `CHF 562M` -> green `3.1% vs prior quarter`
- `Advisory Coverage` -> `78%` -> green `4pp vs prior quarter`
- `At-Risk Accounts` -> `52` -> red `8 vs prior quarter`
- `Client Meetings` -> `212` -> green `12% vs prior quarter`
- `Compliance Alerts` -> `7` -> red `3 vs prior quarter`

### Table Cards

All tables should be dense and financial-operational.

Common table card styling:

- White card with border and small radius.
- Header row: section title on left, count badge next to title.
- Optional controls on right: search input, columns button, export icon. These are visual/no-op.
- Table header background: `#f7f8f9`.
- Row borders: `1px solid var(--border)`.
- Cell padding compact, about `12px 16px`.
- No zebra striping unless extremely subtle.
- Row hover can be disabled or very subtle because rows are not interactive.
- Pagination: show page `1` only; previous/next disabled.

#### Client Portfolio Review Table

This is the central table and should dominate the page.

Columns:

- Client
- Segment
- AUM (CHF)
- 30D Net Flow (CHF)
- Risk Profile
- Suitability Score
- Coverage Status
- Last Review
- RM
- Next Action
- Alert

Styling details:

- Positive flows green.
- Negative flows red and wrapped in parentheses.
- Coverage status uses small colored dots:
  - Covered: green
  - Watch: amber
  - At Risk: red
- Alert column uses red warning triangle for flagged accounts and muted dash otherwise.
- Keep numeric columns aligned consistently.

#### Bottom Grid

Three-column bottom grid on desktop:

```txt
Top Risk Accounts | Product Allocation Overview | Net New Money Trend
```

On narrower screens, stack or use two columns.

### Top Risk Accounts

Columns:

- Client
- Issue
- Exposure (CHF)
- Priority
- Owner
- Due Date

Priority styling:

- High: red
- Medium: amber
- Low, if any: muted or green

Footer action:

- `View all risk accounts` in red with chevron.
- It should be a disabled/no-op button, not a route.

### Product Allocation Overview

Columns:

- Asset Class
- Current %
- Target %
- Drift
- Recommended Action

Drift styling:

- Positive drift green with `+pp`.
- Negative drift red with `-pp`.
- Neutral drift muted.

Footer action:

- `View full asset allocation` in red with chevron.
- Disabled/no-op.

### Net New Money Trend Chart

Use a restrained red line chart.

Preferred:

- Recharts via shadcn chart conventions if dependency is already acceptable.
- If avoiding dependency churn at first, use a simple SVG line chart with labeled axes.

Chart styling:

- Red line.
- Small circular points.
- Light gray horizontal gridlines.
- Minimal legend.
- No gradient fills.
- No bright blue/purple.
- Y-axis labels like `0`, `200M`, `400M`, `600M`, `800M`.
- X-axis labels `Jan '25` through `Jun '25`.
- Optional top-right period selector visual-only: `Monthly`.

### Controls And Inert Behavior

Use `button` for fake controls. Do not use clickable anchors for fake navigation.

Patterns:

```tsx
<button type="button" aria-disabled="true" onClick={(event) => event.preventDefault()}>
  Export
</button>
```

or:

```tsx
<button type="button" disabled>
  Next
</button>
```

Do not wire navigation for:

- sidebar inactive items
- table rows
- pagination
- export
- filters
- columns
- view all
- footer links

### Responsive Behavior

Desktop first because this is an enterprise workbench.

Breakpoints:

- Large desktop: sidebar + 6 KPI cards + wide table + 3 bottom panels.
- Medium: 3 KPI cards per row, bottom panels can become 2 columns.
- Small: sidebar may compress or become top/hidden if necessary, but do not build a full mobile nav unless asked.

Keep table overflow controlled:

- Main table may horizontally scroll inside its card on smaller widths.
- Avoid page-level horizontal scrolling.
- Avoid nested vertical scrollbars unless table overflow absolutely requires it.

### Visual QA Checklist

- Page reads as UBS/wealth/advisory, not generic SaaS.
- Red is the primary accent.
- No gradients or decorative blobs.
- Table density is high but readable.
- KPI cards are compact and aligned.
- Fake controls do not navigate.
- Main dashboard remains the visual priority.
- Assistant, when present, does not dominate the page.

## Assistant Tool Readiness

The important future handoff is that AI tools should call the same `packages/db` functions as the dashboard data API.

Future tool examples:

```txt
getAdvisoryDashboardSnapshot(workspaceId)
findAtRiskAccounts(workspaceId)
summarizeClientCoverage(workspaceId)
compareAllocationDrift(workspaceId)
getClientPortfolioReview(workspaceId, clientId)
```

Avoid building separate assistant-only data fixtures. The dashboard and tools must share the Postgres seed plus stored-function boundary.

## Implementation Steps

1. Add UBS Partner schema, stored functions, grants, and seed data.
2. Add `packages/db` advisory dashboard types and stored-function wrappers.
3. Add unit tests proving DB wrappers call functions and parse returned DTOs.
4. Add `apps/dashboard-data-api` with health and snapshot routes.
5. Add Vite proxy from embedded host to dashboard data API.
6. Build the UBS Partner single-page dashboard from the snapshot endpoint.
7. Keep all fake navigation/actions inert.
8. Run visual browser verification against the embedded host app.
9. Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Open Decisions

- Whether dashboard stored functions return rowsets only or one JSON snapshot function plus rowset functions.
- Whether `apps/dashboard-data-api` should be included in Docker Compose immediately or started locally first.
- Whether the chart uses Recharts/shadcn chart now or a lightweight SVG/HTML rendering until the dashboard data path is stable.
- Whether to add a dedicated `dashboard_user` DB role later or reuse `sidechat_app` for the combined demo database.

## Acceptance Checks

- `apps/embedded-host-app` renders UBS Partner dashboard data from `apps/dashboard-data-api`.
- `apps/dashboard-data-api` reads only through `packages/db`.
- `packages/db` reads only through stored functions/procedures.
- The same `packages/db` advisory functions can be reused by future assistant tools.
- No browser-to-Postgres connection exists.
- No fake navigation routes exist.
- Dashboard controls that are not part of the demo are disabled or no-op.
- Governance lint still passes.

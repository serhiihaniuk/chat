select * from sidechat_create_or_get_conversation('demo-workspace', 'demo-user', 'demo-conversation-001');
select * from sidechat_append_assistant_message('demo-conversation-001', 'demo-assistant-msg-001', '# Seeded report\n- Revenue is up', 'openai', 'gpt-4.1-mini');

insert into ubs_partner.workspaces (id, name, as_of_date, range_from, range_to, range_label)
values ('demo-workspace', 'UBS Partner Demo Workspace', '2025-06-30', '2025-04-01', '2025-06-30', 'Apr 1 - Jun 30, 2025')
on conflict (id) do update set
  name = excluded.name,
  as_of_date = excluded.as_of_date,
  range_from = excluded.range_from,
  range_to = excluded.range_to,
  range_label = excluded.range_label;

insert into ubs_partner.relationship_managers (id, workspace_id, display_name) values
  ('rm-s-meier', 'demo-workspace', 'S. Meier'),
  ('rm-m-keller', 'demo-workspace', 'M. Keller'),
  ('rm-l-rossi', 'demo-workspace', 'L. Rossi'),
  ('rm-t-nguyen', 'demo-workspace', 'T. Nguyen'),
  ('rm-a-patel', 'demo-workspace', 'A. Patel'),
  ('rm-c-weber', 'demo-workspace', 'C. Weber'),
  ('rm-r-li', 'demo-workspace', 'R. Li'),
  ('rm-d-schmid', 'demo-workspace', 'D. Schmid'),
  ('rm-e-martin', 'demo-workspace', 'E. Martin'),
  ('rm-j-colombo', 'demo-workspace', 'J. Colombo')
on conflict (id) do update set display_name = excluded.display_name;

insert into ubs_partner.clients (id, workspace_id, relationship_manager_id, name, segment) values
  ('client-ackermann-family-office', 'demo-workspace', 'rm-s-meier', 'Ackermann Family Office', 'UHNW'),
  ('client-bauhaus-enterprises-ag', 'demo-workspace', 'rm-m-keller', 'Bauhaus Enterprises AG', 'Corporate'),
  ('client-chen-private-wealth', 'demo-workspace', 'rm-l-rossi', 'Chen Private Wealth', 'HNW'),
  ('client-delaunay-holdings', 'demo-workspace', 'rm-t-nguyen', 'Delaunay Holdings', 'Corporate'),
  ('client-equinox-partners-llp', 'demo-workspace', 'rm-a-patel', 'Equinox Partners LLP', 'Institutional'),
  ('client-fischer-family', 'demo-workspace', 'rm-c-weber', 'Fischer Family', 'HNW'),
  ('client-global-medtech-inc', 'demo-workspace', 'rm-r-li', 'Global MedTech Inc.', 'Corporate'),
  ('client-horvath-foundation', 'demo-workspace', 'rm-d-schmid', 'Horvath Foundation', 'Institutional'),
  ('client-iverson-family-trust', 'demo-workspace', 'rm-e-martin', 'Iverson Family Trust', 'HNW'),
  ('client-jasper-retail-group', 'demo-workspace', 'rm-j-colombo', 'Jasper Retail Group', 'Corporate')
on conflict (id) do update set
  relationship_manager_id = excluded.relationship_manager_id,
  name = excluded.name,
  segment = excluded.segment;

insert into ubs_partner.dashboard_kpis (id, workspace_id, label, value, delta, trend, sort_order) values
  ('kpi-total-aum', 'demo-workspace', 'Total AUM', 'CHF 24.8B', '6.4% vs prior quarter', 'positive', 1),
  ('kpi-net-new-money', 'demo-workspace', 'Net New Money', 'CHF 562M', '3.1% vs prior quarter', 'positive', 2),
  ('kpi-advisory-coverage', 'demo-workspace', 'Advisory Coverage', '78%', '4pp vs prior quarter', 'positive', 3),
  ('kpi-at-risk-accounts', 'demo-workspace', 'At-Risk Accounts', '52', '8 vs prior quarter', 'negative', 4),
  ('kpi-client-meetings', 'demo-workspace', 'Client Meetings', '212', '12% vs prior quarter', 'positive', 5),
  ('kpi-compliance-alerts', 'demo-workspace', 'Compliance Alerts', '7', '3 vs prior quarter', 'negative', 6)
on conflict (id) do update set
  label = excluded.label,
  value = excluded.value,
  delta = excluded.delta,
  trend = excluded.trend,
  sort_order = excluded.sort_order;

insert into ubs_partner.client_portfolio_reviews (id, workspace_id, client_id, aum_chf, net_flow_30d_chf, risk_profile, suitability_score, coverage_status, last_review, next_action, has_alert) values
  ('review-ackermann-family-office', 'demo-workspace', 'client-ackermann-family-office', 3428000000, 120400000, 'Balanced', 92, 'Covered', '2025-06-12', 'Portfolio review', false),
  ('review-bauhaus-enterprises-ag', 'demo-workspace', 'client-bauhaus-enterprises-ag', 1980000000, -45200000, 'Moderate', 86, 'Covered', '2025-06-03', 'Cash sweep', false),
  ('review-chen-private-wealth', 'demo-workspace', 'client-chen-private-wealth', 1450000000, 32800000, 'Growth', 79, 'Watch', '2025-05-28', 'Rebalance', true),
  ('review-delaunay-holdings', 'demo-workspace', 'client-delaunay-holdings', 1210000000, -18700000, 'Balanced', 74, 'Watch', '2025-05-20', 'Derivatives review', false),
  ('review-equinox-partners-llp', 'demo-workspace', 'client-equinox-partners-llp', 982000000, 67500000, 'Moderate', 90, 'Covered', '2025-06-10', 'Performance update', false),
  ('review-fischer-family', 'demo-workspace', 'client-fischer-family', 768000000, 5300000, 'Conservative', 88, 'Covered', '2025-06-05', 'Insurance review', false),
  ('review-global-medtech-inc', 'demo-workspace', 'client-global-medtech-inc', 654000000, -7600000, 'Balanced', 68, 'At Risk', '2025-05-15', 'Liquidity plan', true),
  ('review-horvath-foundation', 'demo-workspace', 'client-horvath-foundation', 602000000, 26100000, 'Conservative', 95, 'Covered', '2025-06-09', 'Impact review', false),
  ('review-iverson-family-trust', 'demo-workspace', 'client-iverson-family-trust', 511000000, 11700000, 'Balanced', 82, 'Watch', '2025-05-26', 'Tax optimization', false),
  ('review-jasper-retail-group', 'demo-workspace', 'client-jasper-retail-group', 487000000, -3200000, 'Moderate', 71, 'At Risk', '2025-05-18', 'Credit review', true)
on conflict (id) do update set
  aum_chf = excluded.aum_chf,
  net_flow_30d_chf = excluded.net_flow_30d_chf,
  risk_profile = excluded.risk_profile,
  suitability_score = excluded.suitability_score,
  coverage_status = excluded.coverage_status,
  last_review = excluded.last_review,
  next_action = excluded.next_action,
  has_alert = excluded.has_alert;

insert into ubs_partner.risk_accounts (id, workspace_id, client_id, issue, exposure_chf, priority, owner_relationship_manager_id, due_date) values
  ('risk-global-medtech-liquidity-gap', 'demo-workspace', 'client-global-medtech-inc', 'Liquidity gap', 112000000, 'High', 'rm-r-li', '2025-07-08'),
  ('risk-jasper-credit-concentration', 'demo-workspace', 'client-jasper-retail-group', 'Credit concentration', 78000000, 'High', 'rm-j-colombo', '2025-07-04'),
  ('risk-delaunay-margin-utilization', 'demo-workspace', 'client-delaunay-holdings', 'Margin utilization', 64000000, 'Medium', 'rm-t-nguyen', '2025-07-10'),
  ('risk-novatek-covenant-breach', 'demo-workspace', 'client-equinox-partners-llp', 'Covenant breach risk', 52000000, 'Medium', 'rm-a-patel', '2025-07-11'),
  ('risk-chen-equity-concentration', 'demo-workspace', 'client-chen-private-wealth', 'Equity concentration', 46000000, 'Medium', 'rm-l-rossi', '2025-07-07')
on conflict (id) do update set
  issue = excluded.issue,
  exposure_chf = excluded.exposure_chf,
  priority = excluded.priority,
  owner_relationship_manager_id = excluded.owner_relationship_manager_id,
  due_date = excluded.due_date;

insert into ubs_partner.product_allocation (id, workspace_id, asset_class, current_percent, target_percent, drift_pp, recommended_action, sort_order) values
  ('allocation-equities', 'demo-workspace', 'Equities', 48, 50, -2, 'Increase allocation', 1),
  ('allocation-fixed-income', 'demo-workspace', 'Fixed Income', 28, 25, 3, 'Reduce allocation', 2),
  ('allocation-multi-asset', 'demo-workspace', 'Multi-Asset', 12, 10, 2, 'Slightly reduce', 3),
  ('allocation-alternatives', 'demo-workspace', 'Alternatives', 7, 8, -1, 'Increase allocation', 4),
  ('allocation-cash', 'demo-workspace', 'Cash', 4, 5, -1, 'Use for opportunities', 5),
  ('allocation-other', 'demo-workspace', 'Other', 1, 2, -1, 'Rebalance', 6)
on conflict (id) do update set
  current_percent = excluded.current_percent,
  target_percent = excluded.target_percent,
  drift_pp = excluded.drift_pp,
  recommended_action = excluded.recommended_action,
  sort_order = excluded.sort_order;

insert into ubs_partner.net_new_money_trend (id, workspace_id, month, label, net_new_money_chf, sort_order) values
  ('nnm-2025-01', 'demo-workspace', '2025-01-01', 'Jan ''25', 255000000, 1),
  ('nnm-2025-02', 'demo-workspace', '2025-02-01', 'Feb ''25', 455000000, 2),
  ('nnm-2025-03', 'demo-workspace', '2025-03-01', 'Mar ''25', 572000000, 3),
  ('nnm-2025-04', 'demo-workspace', '2025-04-01', 'Apr ''25', 506000000, 4),
  ('nnm-2025-05', 'demo-workspace', '2025-05-01', 'May ''25', 582000000, 5),
  ('nnm-2025-06', 'demo-workspace', '2025-06-01', 'Jun ''25', 621000000, 6)
on conflict (id) do update set
  net_new_money_chf = excluded.net_new_money_chf,
  sort_order = excluded.sort_order;

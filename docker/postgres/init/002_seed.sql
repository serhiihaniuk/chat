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

insert into ubs_partner.relationship_managers (id, workspace_id, display_name) values
  ('rm-n-brunner', 'demo-workspace', 'N. Brunner'),
  ('rm-v-kapoor', 'demo-workspace', 'V. Kapoor'),
  ('rm-h-mueller', 'demo-workspace', 'H. Mueller'),
  ('rm-e-dubois', 'demo-workspace', 'E. Dubois'),
  ('rm-p-stein', 'demo-workspace', 'P. Stein'),
  ('rm-y-tanaka', 'demo-workspace', 'Y. Tanaka')
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

insert into ubs_partner.clients (id, workspace_id, relationship_manager_id, name, segment) values
  ('client-nordstern-capital', 'demo-workspace', 'rm-n-brunner', 'Nordstern Capital', 'Institutional'),
  ('client-alpine-private-trust', 'demo-workspace', 'rm-s-meier', 'Alpine Private Trust', 'UHNW'),
  ('client-rhein-wealth-partners', 'demo-workspace', 'rm-v-kapoor', 'Rhein Wealth Partners', 'HNW'),
  ('client-helvetic-robotics-ag', 'demo-workspace', 'rm-h-mueller', 'Helvetic Robotics AG', 'Corporate'),
  ('client-zurich-growth-office', 'demo-workspace', 'rm-e-dubois', 'Zurich Growth Office', 'UHNW'),
  ('client-lakeview-foundation', 'demo-workspace', 'rm-d-schmid', 'Lakeview Foundation', 'Institutional'),
  ('client-matterhorn-holdings', 'demo-workspace', 'rm-p-stein', 'Matterhorn Holdings', 'Corporate'),
  ('client-cobalt-medical-group', 'demo-workspace', 'rm-r-li', 'Cobalt Medical Group', 'Corporate'),
  ('client-st-gallen-family-office', 'demo-workspace', 'rm-c-weber', 'St. Gallen Family Office', 'UHNW'),
  ('client-meridian-shipping-sa', 'demo-workspace', 'rm-y-tanaka', 'Meridian Shipping SA', 'Corporate'),
  ('client-summit-ventures', 'demo-workspace', 'rm-m-keller', 'Summit Ventures', 'HNW'),
  ('client-arbon-manufacturing', 'demo-workspace', 'rm-h-mueller', 'Arbon Manufacturing', 'Corporate'),
  ('client-limmat-opportunity-fund', 'demo-workspace', 'rm-a-patel', 'Limmat Opportunity Fund', 'Institutional'),
  ('client-cedar-lake-trust', 'demo-workspace', 'rm-e-martin', 'Cedar Lake Trust', 'HNW'),
  ('client-bellvue-enterprises', 'demo-workspace', 'rm-t-nguyen', 'Bellvue Enterprises', 'Corporate'),
  ('client-redwood-pharma-ag', 'demo-workspace', 'rm-r-li', 'Redwood Pharma AG', 'Corporate'),
  ('client-orion-family-trust', 'demo-workspace', 'rm-n-brunner', 'Orion Family Trust', 'UHNW'),
  ('client-silverline-retail-holding', 'demo-workspace', 'rm-j-colombo', 'Silverline Retail Holding', 'Corporate'),
  ('client-aare-endowment', 'demo-workspace', 'rm-d-schmid', 'Aare Endowment', 'Institutional'),
  ('client-terracotta-properties', 'demo-workspace', 'rm-p-stein', 'Terracotta Properties', 'Corporate'),
  ('client-verbier-private-wealth', 'demo-workspace', 'rm-l-rossi', 'Verbier Private Wealth', 'HNW'),
  ('client-aurora-energy-sa', 'demo-workspace', 'rm-y-tanaka', 'Aurora Energy SA', 'Corporate'),
  ('client-crescent-family-office', 'demo-workspace', 'rm-s-meier', 'Crescent Family Office', 'UHNW'),
  ('client-kestrel-industries', 'demo-workspace', 'rm-m-keller', 'Kestrel Industries', 'Corporate')
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

insert into ubs_partner.client_portfolio_reviews (id, workspace_id, client_id, aum_chf, net_flow_30d_chf, risk_profile, suitability_score, coverage_status, last_review, next_action, has_alert) values
  ('review-nordstern-capital', 'demo-workspace', 'client-nordstern-capital', 1620000000, 91000000, 'Balanced', 89, 'Covered', '2025-06-11', 'Quarterly mandate review', false),
  ('review-alpine-private-trust', 'demo-workspace', 'client-alpine-private-trust', 1330000000, 148000000, 'Growth', 84, 'Watch', '2025-06-02', 'Concentration review', true),
  ('review-rhein-wealth-partners', 'demo-workspace', 'client-rhein-wealth-partners', 1080000000, 73500000, 'Balanced', 91, 'Covered', '2025-06-14', 'Mandate renewal', false),
  ('review-helvetic-robotics-ag', 'demo-workspace', 'client-helvetic-robotics-ag', 940000000, -62000000, 'Moderate', 63, 'At Risk', '2025-05-12', 'Liquidity covenant update', true),
  ('review-zurich-growth-office', 'demo-workspace', 'client-zurich-growth-office', 880000000, 126000000, 'Growth', 78, 'Watch', '2025-06-06', 'Options overlay review', true),
  ('review-lakeview-foundation', 'demo-workspace', 'client-lakeview-foundation', 736000000, 18400000, 'Conservative', 96, 'Covered', '2025-06-18', 'Impact allocation review', false),
  ('review-matterhorn-holdings', 'demo-workspace', 'client-matterhorn-holdings', 704000000, -31500000, 'Balanced', 69, 'At Risk', '2025-05-22', 'Margin remediation', true),
  ('review-cobalt-medical-group', 'demo-workspace', 'client-cobalt-medical-group', 681000000, 54000000, 'Moderate', 83, 'Covered', '2025-06-13', 'Treasury sweep', false),
  ('review-st-gallen-family-office', 'demo-workspace', 'client-st-gallen-family-office', 657000000, 66500000, 'Conservative', 93, 'Covered', '2025-06-17', 'Estate planning sync', false),
  ('review-meridian-shipping-sa', 'demo-workspace', 'client-meridian-shipping-sa', 629000000, -54000000, 'Moderate', 66, 'At Risk', '2025-05-19', 'FX collateral review', true),
  ('review-summit-ventures', 'demo-workspace', 'client-summit-ventures', 604000000, 118000000, 'Growth', 76, 'Watch', '2025-06-07', 'Liquidity window', false),
  ('review-arbon-manufacturing', 'demo-workspace', 'client-arbon-manufacturing', 586000000, -24800000, 'Balanced', 72, 'Watch', '2025-05-24', 'Cash conversion plan', true),
  ('review-limmat-opportunity-fund', 'demo-workspace', 'client-limmat-opportunity-fund', 552000000, 95000000, 'Growth', 87, 'Covered', '2025-06-19', 'Performance attribution', false),
  ('review-cedar-lake-trust', 'demo-workspace', 'client-cedar-lake-trust', 506000000, 21200000, 'Conservative', 90, 'Covered', '2025-06-04', 'Beneficiary update', false),
  ('review-bellvue-enterprises', 'demo-workspace', 'client-bellvue-enterprises', 472000000, -18800000, 'Moderate', 70, 'Watch', '2025-05-27', 'Loan repricing', true),
  ('review-redwood-pharma-ag', 'demo-workspace', 'client-redwood-pharma-ag', 438000000, -44500000, 'Balanced', 61, 'At Risk', '2025-05-14', 'Alert resolution', true),
  ('review-orion-family-trust', 'demo-workspace', 'client-orion-family-trust', 421000000, 33800000, 'Balanced', 88, 'Covered', '2025-06-20', 'Tax optimization', false),
  ('review-silverline-retail-holding', 'demo-workspace', 'client-silverline-retail-holding', 398000000, -27100000, 'Moderate', 67, 'At Risk', '2025-05-21', 'Credit exposure review', true),
  ('review-aare-endowment', 'demo-workspace', 'client-aare-endowment', 376000000, 17100000, 'Conservative', 94, 'Covered', '2025-06-16', 'Grant liquidity review', false),
  ('review-terracotta-properties', 'demo-workspace', 'client-terracotta-properties', 349000000, -12200000, 'Balanced', 73, 'Watch', '2025-05-31', 'Real estate leverage review', true),
  ('review-verbier-private-wealth', 'demo-workspace', 'client-verbier-private-wealth', 327000000, 49300000, 'Growth', 81, 'Covered', '2025-06-09', 'Alternatives pacing', false),
  ('review-aurora-energy-sa', 'demo-workspace', 'client-aurora-energy-sa', 302000000, -36500000, 'Moderate', 64, 'At Risk', '2025-05-16', 'Commodity hedge review', true),
  ('review-crescent-family-office', 'demo-workspace', 'client-crescent-family-office', 286000000, 77100000, 'Balanced', 86, 'Covered', '2025-06-15', 'Mandate expansion', false),
  ('review-kestrel-industries', 'demo-workspace', 'client-kestrel-industries', 244000000, -9400000, 'Moderate', 75, 'Watch', '2025-06-01', 'Working-capital update', false)
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

insert into ubs_partner.risk_accounts (id, workspace_id, client_id, issue, exposure_chf, priority, owner_relationship_manager_id, due_date) values
  ('risk-helvetic-liquidity-covenant', 'demo-workspace', 'client-helvetic-robotics-ag', 'Liquidity covenant pressure', 91000000, 'High', 'rm-h-mueller', '2025-06-24'),
  ('risk-redwood-alert-resolution', 'demo-workspace', 'client-redwood-pharma-ag', 'Unresolved compliance alert', 84000000, 'High', 'rm-r-li', '2025-06-18'),
  ('risk-meridian-fx-collateral', 'demo-workspace', 'client-meridian-shipping-sa', 'FX collateral shortfall', 73000000, 'High', 'rm-y-tanaka', '2025-06-28'),
  ('risk-alpine-single-name', 'demo-workspace', 'client-alpine-private-trust', 'Single-name concentration', 69000000, 'High', 'rm-s-meier', '2025-07-02'),
  ('risk-silverline-credit-line', 'demo-workspace', 'client-silverline-retail-holding', 'Credit line utilization', 58000000, 'Medium', 'rm-j-colombo', '2025-07-06'),
  ('risk-matterhorn-margin-buffer', 'demo-workspace', 'client-matterhorn-holdings', 'Margin buffer erosion', 56000000, 'Medium', 'rm-p-stein', '2025-06-26'),
  ('risk-aurora-commodity-hedge', 'demo-workspace', 'client-aurora-energy-sa', 'Commodity hedge mismatch', 51000000, 'Medium', 'rm-y-tanaka', '2025-07-09'),
  ('risk-bellvue-loan-repricing', 'demo-workspace', 'client-bellvue-enterprises', 'Loan repricing exposure', 43000000, 'Medium', 'rm-t-nguyen', '2025-07-12'),
  ('risk-zurich-options-overlay', 'demo-workspace', 'client-zurich-growth-office', 'Options overlay review', 41000000, 'Medium', 'rm-e-dubois', '2025-07-01'),
  ('risk-arbon-cash-conversion', 'demo-workspace', 'client-arbon-manufacturing', 'Cash conversion delay', 38000000, 'Medium', 'rm-h-mueller', '2025-06-27'),
  ('risk-terracotta-leverage', 'demo-workspace', 'client-terracotta-properties', 'Real estate leverage drift', 34000000, 'Low', 'rm-p-stein', '2025-07-15'),
  ('risk-kestrel-working-capital', 'demo-workspace', 'client-kestrel-industries', 'Working-capital drawdown', 28000000, 'Low', 'rm-m-keller', '2025-07-18')
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

insert into ubs_partner.risk_exposure_trend (
  id,
  workspace_id,
  period_date,
  label,
  no_risk_aum_chf,
  low_risk_aum_chf,
  medium_risk_aum_chf,
  high_risk_aum_chf,
  net_new_money_chf,
  event_label,
  sort_order
) values
  ('risk-trend-2025-04-01', 'demo-workspace', '2025-04-01', 'Apr ''25', 12300000000, 3600000000, 5200000000, 3600000000, -520000000, null, 1),
  ('risk-trend-2025-04-08', 'demo-workspace', '2025-04-08', 'Apr 08', 12800000000, 3400000000, 5500000000, 3700000000, -170000000, null, 2),
  ('risk-trend-2025-04-15', 'demo-workspace', '2025-04-15', 'Apr 15', 12700000000, 3500000000, 5400000000, 3500000000, 240000000, 'Market volatility', 3),
  ('risk-trend-2025-04-22', 'demo-workspace', '2025-04-22', 'Apr 22', 12500000000, 3600000000, 5300000000, 3300000000, 120000000, null, 4),
  ('risk-trend-2025-04-30', 'demo-workspace', '2025-04-30', 'Apr 30', 13100000000, 3700000000, 5200000000, 3400000000, -430000000, null, 5),
  ('risk-trend-2025-05-07', 'demo-workspace', '2025-05-07', 'May 07', 13200000000, 3800000000, 5300000000, 3600000000, -610000000, null, 6),
  ('risk-trend-2025-05-12', 'demo-workspace', '2025-05-12', 'May 12', 13400000000, 3900000000, 5400000000, 3700000000, -220000000, 'Policy update', 7),
  ('risk-trend-2025-05-20', 'demo-workspace', '2025-05-20', 'May 20', 13900000000, 4000000000, 5500000000, 3800000000, 640000000, null, 8),
  ('risk-trend-2025-05-31', 'demo-workspace', '2025-05-31', 'May 31', 13700000000, 4000000000, 5400000000, 3700000000, 520000000, null, 9),
  ('risk-trend-2025-06-07', 'demo-workspace', '2025-06-07', 'Jun 07', 14000000000, 4100000000, 5500000000, 3800000000, -50000000, null, 10),
  ('risk-trend-2025-06-14', 'demo-workspace', '2025-06-14', 'Jun 14', 14300000000, 4000000000, 5600000000, 3700000000, 160000000, 'Fee guidance', 11),
  ('risk-trend-2025-06-23', 'demo-workspace', '2025-06-23', 'Jun 23', 14600000000, 4100000000, 5700000000, 3900000000, 710000000, null, 12),
  ('risk-trend-2025-06-30', 'demo-workspace', '2025-06-30', 'Jun 30', 14800000000, 4200000000, 5800000000, 4000000000, 790000000, null, 13)
on conflict (id) do update set
  period_date = excluded.period_date,
  label = excluded.label,
  no_risk_aum_chf = excluded.no_risk_aum_chf,
  low_risk_aum_chf = excluded.low_risk_aum_chf,
  medium_risk_aum_chf = excluded.medium_risk_aum_chf,
  high_risk_aum_chf = excluded.high_risk_aum_chf,
  net_new_money_chf = excluded.net_new_money_chf,
  event_label = excluded.event_label,
  sort_order = excluded.sort_order;

insert into ubs_partner.segment_risk_scores (id, workspace_id, segment, risk_axis, score, sort_order) values
  ('segment-risk-corporate-liquidity', 'demo-workspace', 'Corporate', 'Liquidity', 82, 1),
  ('segment-risk-uhnw-liquidity', 'demo-workspace', 'UHNW', 'Liquidity', 52, 1),
  ('segment-risk-institutional-liquidity', 'demo-workspace', 'Institutional', 'Liquidity', 34, 1),
  ('segment-risk-corporate-credit', 'demo-workspace', 'Corporate', 'Credit', 72, 2),
  ('segment-risk-uhnw-credit', 'demo-workspace', 'UHNW', 'Credit', 49, 2),
  ('segment-risk-institutional-credit', 'demo-workspace', 'Institutional', 'Credit', 38, 2),
  ('segment-risk-corporate-concentration', 'demo-workspace', 'Corporate', 'Concentration', 79, 3),
  ('segment-risk-uhnw-concentration', 'demo-workspace', 'UHNW', 'Concentration', 60, 3),
  ('segment-risk-institutional-concentration', 'demo-workspace', 'Institutional', 'Concentration', 44, 3),
  ('segment-risk-corporate-margin', 'demo-workspace', 'Corporate', 'Margin', 58, 4),
  ('segment-risk-uhnw-margin', 'demo-workspace', 'UHNW', 'Margin', 64, 4),
  ('segment-risk-institutional-margin', 'demo-workspace', 'Institutional', 'Margin', 46, 4),
  ('segment-risk-corporate-covenant', 'demo-workspace', 'Corporate', 'Covenant', 69, 5),
  ('segment-risk-uhnw-covenant', 'demo-workspace', 'UHNW', 'Covenant', 72, 5),
  ('segment-risk-institutional-covenant', 'demo-workspace', 'Institutional', 'Covenant', 35, 5),
  ('segment-risk-corporate-collateral', 'demo-workspace', 'Corporate', 'Collateral', 65, 6),
  ('segment-risk-uhnw-collateral', 'demo-workspace', 'UHNW', 'Collateral', 46, 6),
  ('segment-risk-institutional-collateral', 'demo-workspace', 'Institutional', 'Collateral', 41, 6)
on conflict (id) do update set
  segment = excluded.segment,
  risk_axis = excluded.risk_axis,
  score = excluded.score,
  sort_order = excluded.sort_order;

insert into ubs_partner.risk_driver_exposure (id, workspace_id, driver, exposure_chf, sort_order) values
  ('risk-driver-liquidity-gap', 'demo-workspace', 'Liquidity gap', 1400000000, 1),
  ('risk-driver-margin-pressure', 'demo-workspace', 'Margin pressure', 1100000000, 2),
  ('risk-driver-credit-concentration', 'demo-workspace', 'Credit concentration', 1000000000, 3),
  ('risk-driver-collateral-shortfall', 'demo-workspace', 'Collateral shortfall', 600000000, 4),
  ('risk-driver-market-volatility', 'demo-workspace', 'Market volatility', 800000000, 5),
  ('risk-driver-other', 'demo-workspace', 'Other', 800000000, 6)
on conflict (id) do update set
  driver = excluded.driver,
  exposure_chf = excluded.exposure_chf,
  sort_order = excluded.sort_order;

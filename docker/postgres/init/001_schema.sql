do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'sidechat_app') then
    create role sidechat_app login password 'sidechat_app';
  end if;
end $$;
create schema if not exists sidechat;
create schema if not exists ubs_partner;
create extension if not exists pgcrypto;

create table if not exists sidechat.conversations (id text primary key, workspace_id text not null, user_id text not null, created_at timestamptz default now());
create table if not exists sidechat.messages (id text primary key, conversation_id text references sidechat.conversations(id), role text not null, content text not null, metadata jsonb not null default '{}'::jsonb, model_provider text, model_id text, created_at timestamptz default now());
alter table sidechat.messages add column if not exists metadata jsonb not null default '{}'::jsonb;
create table if not exists sidechat.usage_records (request_id text primary key, conversation_id text not null, message_id text not null, model_provider text not null, model_id text not null, input_tokens int not null, output_tokens int not null, total_tokens int not null, reasoning_tokens int, cached_input_tokens int, cache_write_tokens int, estimated_cost_usd numeric(12, 6), created_at timestamptz default now());
alter table sidechat.usage_records add column if not exists reasoning_tokens int;
alter table sidechat.usage_records add column if not exists cached_input_tokens int;
alter table sidechat.usage_records add column if not exists cache_write_tokens int;
alter table sidechat.usage_records add column if not exists estimated_cost_usd numeric(12, 6);

create table if not exists ubs_partner.workspaces (
  id text primary key,
  name text not null,
  as_of_date date not null,
  range_from date not null,
  range_to date not null,
  range_label text not null
);

create table if not exists ubs_partner.relationship_managers (
  id text primary key,
  workspace_id text not null references ubs_partner.workspaces(id),
  display_name text not null
);

create table if not exists ubs_partner.clients (
  id text primary key,
  workspace_id text not null references ubs_partner.workspaces(id),
  relationship_manager_id text not null references ubs_partner.relationship_managers(id),
  name text not null,
  segment text not null
);

create table if not exists ubs_partner.client_portfolio_reviews (
  id text primary key,
  workspace_id text not null references ubs_partner.workspaces(id),
  client_id text not null references ubs_partner.clients(id),
  aum_chf numeric(18, 2) not null,
  net_flow_30d_chf numeric(18, 2) not null,
  risk_profile text not null,
  suitability_score int not null,
  coverage_status text not null,
  last_review date not null,
  next_action text not null,
  has_alert boolean not null default false
);

create table if not exists ubs_partner.risk_accounts (
  id text primary key,
  workspace_id text not null references ubs_partner.workspaces(id),
  client_id text not null references ubs_partner.clients(id),
  issue text not null,
  exposure_chf numeric(18, 2) not null,
  priority text not null,
  owner_relationship_manager_id text not null references ubs_partner.relationship_managers(id),
  due_date date not null
);

create table if not exists ubs_partner.product_allocation (
  id text primary key,
  workspace_id text not null references ubs_partner.workspaces(id),
  asset_class text not null,
  current_percent numeric(6, 2) not null,
  target_percent numeric(6, 2) not null,
  drift_pp numeric(6, 2) not null,
  recommended_action text not null,
  sort_order int not null
);

create table if not exists ubs_partner.net_new_money_trend (
  id text primary key,
  workspace_id text not null references ubs_partner.workspaces(id),
  month date not null,
  label text not null,
  net_new_money_chf numeric(18, 2) not null,
  sort_order int not null
);

create table if not exists ubs_partner.risk_exposure_trend (
  id text primary key,
  workspace_id text not null references ubs_partner.workspaces(id),
  period_date date not null,
  label text not null,
  no_risk_aum_chf numeric(18, 2) not null,
  low_risk_aum_chf numeric(18, 2) not null,
  medium_risk_aum_chf numeric(18, 2) not null,
  high_risk_aum_chf numeric(18, 2) not null,
  net_new_money_chf numeric(18, 2) not null,
  event_label text,
  sort_order int not null
);

create table if not exists ubs_partner.segment_risk_scores (
  id text primary key,
  workspace_id text not null references ubs_partner.workspaces(id),
  segment text not null,
  risk_axis text not null,
  score numeric(6, 2) not null,
  sort_order int not null
);

create table if not exists ubs_partner.risk_driver_exposure (
  id text primary key,
  workspace_id text not null references ubs_partner.workspaces(id),
  driver text not null,
  exposure_chf numeric(18, 2) not null,
  sort_order int not null
);

create table if not exists ubs_partner.dashboard_kpis (
  id text primary key,
  workspace_id text not null references ubs_partner.workspaces(id),
  label text not null,
  value text not null,
  delta text not null,
  trend text not null,
  sort_order int not null
);

create or replace function sidechat_create_or_get_conversation(p_workspace_id text, p_user_id text, p_conversation_id text default null) returns table(conversation_id text) language plpgsql security definer as $$
declare cid text := coalesce(p_conversation_id, 'conv-' || gen_random_uuid()::text);
begin
  insert into sidechat.conversations(id, workspace_id, user_id) values (cid, p_workspace_id, p_user_id) on conflict (id) do nothing;
  return query select cid as conversation_id;
end $$;

create or replace function sidechat_append_user_message(p_conversation_id text, p_message_id text, p_content text) returns void language sql security definer as $$
  insert into sidechat.messages(id, conversation_id, role, content) values (p_message_id, p_conversation_id, 'user', p_content) on conflict (id) do nothing;
$$;

drop function if exists sidechat_append_assistant_message(text, text, text, text, text);
drop function if exists sidechat_append_assistant_message(text, text, text, text, text, jsonb);
create or replace function sidechat_append_assistant_message(p_conversation_id text, p_message_id text, p_content text, p_model_provider text, p_model_id text, p_metadata jsonb default '{}'::jsonb) returns void language sql security definer as $$
  insert into sidechat.messages(id, conversation_id, role, content, model_provider, model_id, metadata) values (p_message_id, p_conversation_id, 'assistant', p_content, p_model_provider, p_model_id, coalesce(p_metadata, '{}'::jsonb)) on conflict (id) do nothing;
$$;

drop function if exists sidechat_read_seeded_history(text, text);
create or replace function sidechat_read_seeded_history(p_workspace_id text, p_conversation_id text) returns table(id text, role text, content text, metadata jsonb) language sql security definer as $$
  select m.id, m.role, m.content, m.metadata from sidechat.messages m join sidechat.conversations c on c.id = m.conversation_id where c.workspace_id = p_workspace_id and c.id = p_conversation_id order by m.created_at;
$$;

create or replace function sidechat_reset_conversation_history(p_workspace_id text, p_user_id text, p_conversation_id text)
returns table("deletedMessages" int) language sql security definer as $$
  with target_conversation as (
    select id from sidechat.conversations
    where workspace_id = p_workspace_id and user_id = p_user_id and id = p_conversation_id
  ),
  deleted as (
    delete from sidechat.messages m
    using target_conversation c
    where m.conversation_id = c.id
    returning 1
  )
  select count(*)::int as "deletedMessages" from deleted;
$$;

drop function if exists sidechat_record_usage(text, text, text, text, text, int, int, int);
create or replace function sidechat_record_usage(p_request_id text, p_conversation_id text, p_message_id text, p_model_provider text, p_model_id text, p_input_tokens int, p_output_tokens int, p_total_tokens int, p_reasoning_tokens int default null, p_cached_input_tokens int default null, p_cache_write_tokens int default null, p_estimated_cost_usd numeric default null) returns void language sql security definer as $$
  insert into sidechat.usage_records(request_id, conversation_id, message_id, model_provider, model_id, input_tokens, output_tokens, total_tokens, reasoning_tokens, cached_input_tokens, cache_write_tokens, estimated_cost_usd) values (p_request_id, p_conversation_id, p_message_id, p_model_provider, p_model_id, p_input_tokens, p_output_tokens, p_total_tokens, p_reasoning_tokens, p_cached_input_tokens, p_cache_write_tokens, p_estimated_cost_usd) on conflict (request_id) do nothing;
$$;

create or replace function sidechat_reset_conversation_usage(p_workspace_id text, p_user_id text, p_conversation_id text)
returns table("deletedUsageRecords" int) language sql security definer as $$
  with target_conversation as (
    select id from sidechat.conversations
    where workspace_id = p_workspace_id and user_id = p_user_id and id = p_conversation_id
  ),
  deleted as (
    delete from sidechat.usage_records u
    using target_conversation c
    where u.conversation_id = c.id
    returning 1
  )
  select count(*)::int as "deletedUsageRecords" from deleted;
$$;

create or replace function sidechat_get_latest_usage(p_workspace_id text, p_user_id text, p_conversation_id text)
returns table(
  "inputTokens" int,
  "outputTokens" int,
  "totalTokens" int,
  "reasoningTokens" int,
  "cachedInputTokens" int,
  "cacheWriteTokens" int,
  "estimatedCostUsd" double precision
) language sql security definer as $$
  select
    sum(u.input_tokens)::int as "inputTokens",
    sum(u.output_tokens)::int as "outputTokens",
    sum(u.total_tokens)::int as "totalTokens",
    nullif(sum(coalesce(u.reasoning_tokens, 0)), 0)::int as "reasoningTokens",
    nullif(sum(coalesce(u.cached_input_tokens, 0)), 0)::int as "cachedInputTokens",
    nullif(sum(coalesce(u.cache_write_tokens, 0)), 0)::int as "cacheWriteTokens",
    nullif(sum(coalesce(u.estimated_cost_usd, 0)), 0)::double precision as "estimatedCostUsd"
  from sidechat.usage_records u
  join sidechat.conversations c on c.id = u.conversation_id
  where c.workspace_id = p_workspace_id
    and c.id = p_conversation_id
  group by c.id;
$$;

create or replace function sidechat_get_workspace_context(p_workspace_id text, p_user_id text)
returns table(
  conversation_count bigint,
  message_count bigint,
  last_used timestamp with time zone
) language sql security definer as $$
  with conversation_scope as (
    select id from sidechat.conversations where workspace_id = p_workspace_id and user_id = p_user_id
  )
  select
    count(*)::bigint as conversation_count,
    (
      select count(*)::bigint
      from sidechat.messages m
      where m.conversation_id in (select id from conversation_scope)
    ) as message_count,
    (
      select max(m.created_at)
      from sidechat.messages m
      where m.conversation_id in (select id from conversation_scope)
    ) as last_used
  from sidechat.conversations c
  where c.workspace_id = p_workspace_id and c.user_id = p_user_id;
$$;

create or replace function ubs_list_client_portfolio_review(p_workspace_id text)
returns table(
  "id" text,
  "clientId" text,
  "client" text,
  "segment" text,
  "aumChf" double precision,
  "netFlow30dChf" double precision,
  "riskProfile" text,
  "suitabilityScore" int,
  "coverageStatus" text,
  "lastReview" text,
  "relationshipManager" text,
  "nextAction" text,
  "hasAlert" boolean
) language sql security definer as $$
  select
    r.id,
    c.id as "clientId",
    c.name as client,
    c.segment,
    r.aum_chf::double precision as "aumChf",
    r.net_flow_30d_chf::double precision as "netFlow30dChf",
    r.risk_profile as "riskProfile",
    r.suitability_score as "suitabilityScore",
    r.coverage_status as "coverageStatus",
    to_char(r.last_review, 'Mon DD, YYYY') as "lastReview",
    rm.display_name as "relationshipManager",
    r.next_action as "nextAction",
    r.has_alert as "hasAlert"
  from ubs_partner.client_portfolio_reviews r
  join ubs_partner.clients c on c.id = r.client_id
  join ubs_partner.relationship_managers rm on rm.id = c.relationship_manager_id
  where r.workspace_id = p_workspace_id
  order by r.aum_chf desc;
$$;

create or replace function ubs_list_top_risk_accounts(p_workspace_id text)
returns table(
  "id" text,
  "clientId" text,
  "client" text,
  "issue" text,
  "exposureChf" double precision,
  "priority" text,
  "owner" text,
  "dueDate" text
) language sql security definer as $$
  select
    r.id,
    c.id as "clientId",
    c.name as client,
    r.issue,
    r.exposure_chf::double precision as "exposureChf",
    r.priority,
    rm.display_name as owner,
    to_char(r.due_date, 'Mon DD, YYYY') as "dueDate"
  from ubs_partner.risk_accounts r
  join ubs_partner.clients c on c.id = r.client_id
  join ubs_partner.relationship_managers rm on rm.id = r.owner_relationship_manager_id
  where r.workspace_id = p_workspace_id
  order by r.exposure_chf desc;
$$;

create or replace function ubs_list_product_allocation(p_workspace_id text)
returns table(
  "id" text,
  "assetClass" text,
  "currentPercent" double precision,
  "targetPercent" double precision,
  "driftPp" double precision,
  "recommendedAction" text
) language sql security definer as $$
  select
    id,
    asset_class as "assetClass",
    current_percent::double precision as "currentPercent",
    target_percent::double precision as "targetPercent",
    drift_pp::double precision as "driftPp",
    recommended_action as "recommendedAction"
  from ubs_partner.product_allocation
  where workspace_id = p_workspace_id
  order by sort_order;
$$;

create or replace function ubs_list_net_new_money_trend(p_workspace_id text)
returns table(
  "id" text,
  "month" text,
  "label" text,
  "netNewMoneyChf" double precision
) language sql security definer as $$
  select
    id,
    to_char(month, 'YYYY-MM-DD') as month,
    label,
    net_new_money_chf::double precision as "netNewMoneyChf"
  from ubs_partner.net_new_money_trend
  where workspace_id = p_workspace_id
  order by sort_order;
$$;

create or replace function ubs_list_risk_exposure_trend(p_workspace_id text)
returns table(
  "id" text,
  "date" text,
  "label" text,
  "noRiskAumChf" double precision,
  "lowRiskAumChf" double precision,
  "mediumRiskAumChf" double precision,
  "highRiskAumChf" double precision,
  "netNewMoneyChf" double precision,
  "eventLabel" text
) language sql security definer as $$
  select
    id,
    to_char(period_date, 'YYYY-MM-DD') as date,
    label,
    no_risk_aum_chf::double precision as "noRiskAumChf",
    low_risk_aum_chf::double precision as "lowRiskAumChf",
    medium_risk_aum_chf::double precision as "mediumRiskAumChf",
    high_risk_aum_chf::double precision as "highRiskAumChf",
    net_new_money_chf::double precision as "netNewMoneyChf",
    event_label as "eventLabel"
  from ubs_partner.risk_exposure_trend
  where workspace_id = p_workspace_id
  order by sort_order;
$$;

create or replace function ubs_list_segment_risk_scores(p_workspace_id text)
returns table(
  "id" text,
  "segment" text,
  "riskAxis" text,
  "score" double precision
) language sql security definer as $$
  select
    id,
    segment,
    risk_axis as "riskAxis",
    score::double precision as score
  from ubs_partner.segment_risk_scores
  where workspace_id = p_workspace_id
  order by sort_order, segment;
$$;

create or replace function ubs_list_risk_driver_exposure(p_workspace_id text)
returns table(
  "id" text,
  "driver" text,
  "exposureChf" double precision
) language sql security definer as $$
  select
    id,
    driver,
    exposure_chf::double precision as "exposureChf"
  from ubs_partner.risk_driver_exposure
  where workspace_id = p_workspace_id
  order by sort_order;
$$;

create or replace function ubs_get_advisory_dashboard_snapshot(p_workspace_id text)
returns table("snapshot" jsonb) language sql security definer as $$
  select jsonb_build_object(
    'workspaceId', w.id,
    'asOfDate', to_char(w.as_of_date, 'YYYY-MM-DD'),
    'dateRange', jsonb_build_object(
      'from', to_char(w.range_from, 'YYYY-MM-DD'),
      'to', to_char(w.range_to, 'YYYY-MM-DD'),
      'label', w.range_label
    ),
    'kpis', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', k.id,
        'label', k.label,
        'value', k.value,
        'delta', k.delta,
        'trend', k.trend,
        'sortOrder', k.sort_order
      ) order by k.sort_order), '[]'::jsonb)
      from ubs_partner.dashboard_kpis k
      where k.workspace_id = w.id
    ),
    'clientPortfolioReview', (
      select coalesce(jsonb_agg(to_jsonb(cpr)), '[]'::jsonb)
      from ubs_list_client_portfolio_review(w.id) cpr
    ),
    'topRiskAccounts', (
      select coalesce(jsonb_agg(to_jsonb(risk)), '[]'::jsonb)
      from ubs_list_top_risk_accounts(w.id) risk
    ),
    'productAllocation', (
      select coalesce(jsonb_agg(to_jsonb(allocation)), '[]'::jsonb)
      from ubs_list_product_allocation(w.id) allocation
    ),
    'netNewMoneyTrend', (
      select coalesce(jsonb_agg(to_jsonb(trend)), '[]'::jsonb)
      from ubs_list_net_new_money_trend(w.id) trend
    ),
    'riskExposureTrend', (
      select coalesce(jsonb_agg(to_jsonb(exposure_trend)), '[]'::jsonb)
      from ubs_list_risk_exposure_trend(w.id) exposure_trend
    ),
    'segmentRiskScores', (
      select coalesce(jsonb_agg(to_jsonb(segment_risk)), '[]'::jsonb)
      from ubs_list_segment_risk_scores(w.id) segment_risk
    ),
    'riskDriverExposure', (
      select coalesce(jsonb_agg(to_jsonb(driver_exposure)), '[]'::jsonb)
      from ubs_list_risk_driver_exposure(w.id) driver_exposure
    )
  ) as snapshot
  from ubs_partner.workspaces w
  where w.id = p_workspace_id;
$$;

grant execute on function sidechat_create_or_get_conversation(text, text, text) to sidechat_app;
grant execute on function sidechat_append_user_message(text, text, text) to sidechat_app;
grant execute on function sidechat_append_assistant_message(text, text, text, text, text, jsonb) to sidechat_app;
grant execute on function sidechat_read_seeded_history(text, text) to sidechat_app;
grant execute on function sidechat_reset_conversation_history(text, text, text) to sidechat_app;
grant execute on function sidechat_record_usage(text, text, text, text, text, int, int, int, int, int, int, numeric) to sidechat_app;
grant execute on function sidechat_reset_conversation_usage(text, text, text) to sidechat_app;
grant execute on function sidechat_get_latest_usage(text, text, text) to sidechat_app;
grant execute on function sidechat_get_workspace_context(text, text) to sidechat_app;
grant execute on function ubs_get_advisory_dashboard_snapshot(text) to sidechat_app;
grant execute on function ubs_list_client_portfolio_review(text) to sidechat_app;
grant execute on function ubs_list_top_risk_accounts(text) to sidechat_app;
grant execute on function ubs_list_product_allocation(text) to sidechat_app;
grant execute on function ubs_list_net_new_money_trend(text) to sidechat_app;
grant execute on function ubs_list_risk_exposure_trend(text) to sidechat_app;
grant execute on function ubs_list_segment_risk_scores(text) to sidechat_app;
grant execute on function ubs_list_risk_driver_exposure(text) to sidechat_app;
revoke all on all tables in schema sidechat from sidechat_app;
revoke all on all tables in schema ubs_partner from sidechat_app;

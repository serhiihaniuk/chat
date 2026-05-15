do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'sidechat_app') then
    create role sidechat_app login password 'sidechat_app';
  end if;
end $$;
create schema if not exists sidechat;
create extension if not exists pgcrypto;

create table if not exists sidechat.conversations (id text primary key, workspace_id text not null, user_id text not null, created_at timestamptz default now());
create table if not exists sidechat.messages (id text primary key, conversation_id text references sidechat.conversations(id), role text not null, content text not null, model_provider text, model_id text, created_at timestamptz default now());
create table if not exists sidechat.usage_records (request_id text primary key, conversation_id text not null, message_id text not null, model_provider text not null, model_id text not null, input_tokens int not null, output_tokens int not null, total_tokens int not null, created_at timestamptz default now());

create or replace function sidechat_create_or_get_conversation(p_workspace_id text, p_user_id text, p_conversation_id text default null) returns table(conversation_id text) language plpgsql security definer as $$
declare cid text := coalesce(p_conversation_id, 'conv-' || gen_random_uuid()::text);
begin
  insert into sidechat.conversations(id, workspace_id, user_id) values (cid, p_workspace_id, p_user_id) on conflict (id) do nothing;
  return query select cid as conversation_id;
end $$;

create or replace function sidechat_append_user_message(p_conversation_id text, p_message_id text, p_content text) returns void language sql security definer as $$
  insert into sidechat.messages(id, conversation_id, role, content) values (p_message_id, p_conversation_id, 'user', p_content) on conflict (id) do nothing;
$$;

create or replace function sidechat_append_assistant_message(p_conversation_id text, p_message_id text, p_content text, p_model_provider text, p_model_id text) returns void language sql security definer as $$
  insert into sidechat.messages(id, conversation_id, role, content, model_provider, model_id) values (p_message_id, p_conversation_id, 'assistant', p_content, p_model_provider, p_model_id) on conflict (id) do nothing;
$$;

create or replace function sidechat_read_seeded_history(p_workspace_id text, p_conversation_id text) returns table(id text, role text, content text) language sql security definer as $$
  select m.id, m.role, m.content from sidechat.messages m join sidechat.conversations c on c.id = m.conversation_id where c.workspace_id = p_workspace_id and c.id = p_conversation_id order by m.created_at;
$$;

create or replace function sidechat_record_usage(p_request_id text, p_conversation_id text, p_message_id text, p_model_provider text, p_model_id text, p_input_tokens int, p_output_tokens int, p_total_tokens int) returns void language sql security definer as $$
  insert into sidechat.usage_records(request_id, conversation_id, message_id, model_provider, model_id, input_tokens, output_tokens, total_tokens) values (p_request_id, p_conversation_id, p_message_id, p_model_provider, p_model_id, p_input_tokens, p_output_tokens, p_total_tokens) on conflict (request_id) do nothing;
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

grant execute on function sidechat_create_or_get_conversation(text, text, text) to sidechat_app;
grant execute on function sidechat_append_user_message(text, text, text) to sidechat_app;
grant execute on function sidechat_append_assistant_message(text, text, text, text, text) to sidechat_app;
grant execute on function sidechat_read_seeded_history(text, text) to sidechat_app;
grant execute on function sidechat_record_usage(text, text, text, text, text, int, int, int) to sidechat_app;
grant execute on function sidechat_get_workspace_context(text, text) to sidechat_app;
revoke all on all tables in schema sidechat from sidechat_app;

create role sidechat_app login password 'sidechat_app';
create schema if not exists sidechat;
create table if not exists sidechat.conversations (id text primary key, workspace_id text not null, user_id text not null, created_at timestamptz default now());
create table if not exists sidechat.messages (id text primary key, conversation_id text references sidechat.conversations(id), role text not null, content text not null, model_provider text, model_id text, created_at timestamptz default now());
create table if not exists sidechat.usage_records (request_id text primary key, conversation_id text not null, message_id text not null, model_provider text not null, model_id text not null, input_tokens int not null, output_tokens int not null, total_tokens int not null, created_at timestamptz default now());

create or replace function sidechat_create_or_get_conversation(workspace_id text, user_id text, conversation_id text default null) returns table(conversation_id text) language plpgsql security definer as $$
declare cid text := coalesce(conversation_id, 'conv-' || gen_random_uuid()::text);
begin
  insert into sidechat.conversations(id, workspace_id, user_id) values (cid, workspace_id, user_id) on conflict (id) do nothing;
  return query select cid;
end $$;

create or replace function sidechat_append_user_message(conversation_id text, message_id text, content text) returns void language sql security definer as $$
  insert into sidechat.messages(id, conversation_id, role, content) values (message_id, conversation_id, 'user', content) on conflict (id) do nothing;
$$;

create or replace function sidechat_append_assistant_message(conversation_id text, message_id text, content text, model_provider text, model_id text) returns void language sql security definer as $$
  insert into sidechat.messages(id, conversation_id, role, content, model_provider, model_id) values (message_id, conversation_id, 'assistant', content, model_provider, model_id) on conflict (id) do nothing;
$$;

create or replace function sidechat_read_seeded_history(workspace_id text, conversation_id text) returns table(id text, role text, content text) language sql security definer as $$
  select m.id, m.role, m.content from sidechat.messages m join sidechat.conversations c on c.id = m.conversation_id where c.workspace_id = workspace_id and c.id = conversation_id order by m.created_at;
$$;

create or replace function sidechat_record_usage(request_id text, conversation_id text, message_id text, model_provider text, model_id text, input_tokens int, output_tokens int, total_tokens int) returns void language sql security definer as $$
  insert into sidechat.usage_records(request_id, conversation_id, message_id, model_provider, model_id, input_tokens, output_tokens, total_tokens) values (request_id, conversation_id, message_id, model_provider, model_id, input_tokens, output_tokens, total_tokens) on conflict (request_id) do nothing;
$$;

grant execute on function sidechat_create_or_get_conversation(text, text, text) to sidechat_app;
grant execute on function sidechat_append_user_message(text, text, text) to sidechat_app;
grant execute on function sidechat_append_assistant_message(text, text, text, text, text) to sidechat_app;
grant execute on function sidechat_read_seeded_history(text, text) to sidechat_app;
grant execute on function sidechat_record_usage(text, text, text, text, text, int, int, int) to sidechat_app;
revoke all on all tables in schema sidechat from sidechat_app;

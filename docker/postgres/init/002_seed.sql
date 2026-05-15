-- Deterministic seed data used by app smoke and tests.
insert into sidechat.conversations (id, workspace_id, user_id)
values ('demo-conversation-001', 'demo-workspace', 'demo-user')
on conflict (id) do nothing;

insert into sidechat.messages (id, conversation_id, role, content, model_provider, model_id)
values ('seed-assistant-001', 'demo-conversation-001', 'assistant', '# Seeded report
- Revenue is up', 'openai', 'gpt-4.1-mini')
on conflict (id) do nothing;


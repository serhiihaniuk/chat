select * from sidechat_create_or_get_conversation('demo-workspace', 'demo-user', 'demo-conversation-001');
select * from sidechat_append_assistant_message('demo-conversation-001', 'demo-assistant-msg-001', '# Seeded report\n- Revenue is up', 'openai', 'gpt-4.1-mini');

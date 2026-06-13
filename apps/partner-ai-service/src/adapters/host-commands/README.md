# Host Command Adapters

Read this when: adding service support for host-app UI commands.
Source of truth for: service helpers around host command declarations or
dispatch adapters.
Not source of truth for: backend runtime tools or widget state.

Host commands are browser/host-app interactions declared as
`HostCommandCapability`. They stay separate from `RuntimeTool` implementations
unless the host deliberately also exposes a backend tool with its own policy and
approval path.

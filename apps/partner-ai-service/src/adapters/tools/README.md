# Runtime Tool Adapters

Read this when: adding backend model-callable tools.
Source of truth for: service-owned `RuntimeTool` implementations and matching
`ToolCapability` declaration helpers.
Not source of truth for: host UI commands.

Tool declarations and executable registrations stay separate. A tool should be
declared in the host capability manifest only when the host offers it, and it is
executable only when service composition registers the matching runtime tool.

`mock-web-search-tool.ts` is a local development/test fixture. Enterprise
examples belong under `examples/`.

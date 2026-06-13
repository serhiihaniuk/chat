# Research Agent Adapters

Read this when: adding a pre-answer research implementation.
Source of truth for: service-owned implementations of `ResearchAgentPort`.
Not source of truth for: final runtime executor behavior.

Research agents run during context preparation only when turn policy allows the
declared workflow and source ids. They return context candidates and workflow
artifacts; they do not stream `sidechat.v1` events.

Start with `noop-research-agent.ts` when a service has no research backend yet.

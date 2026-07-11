# Production workflows

Read this when: adding a durable production entry to the v7 service.

Source of truth for: the production-only Workflow scan root.

Not source of truth for: application turn policy or workflow lifecycle order.

Nitro production builds scan only this directory. Durable entries added from Step 05 onward may import `#composition/workflow/production` to initialize workflow-side ports in their physical module instance. Testing workflows belong in the sibling `testing/` directory and are compiled only by the compatibility builder.

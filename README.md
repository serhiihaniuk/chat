# side-chat

Production-base scaffolding for the side-chat assistant.

## Topology
- `apps/side-chat-api`
- `apps/widget-demo`
- `apps/embedded-host-app`
- `packages/shared-protocol`
- `packages/side-chat-widget`
- `packages/db`
- `docker/postgres/init/001_schema.sql`

## Scripts (intended)
- `pnpm install`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm run test:e2e`
- `pnpm build`
- `docker compose up --build`

## Notes
- `pnpm` is the expected workspace tool for this scaffold.
- If `pnpm` is not installed locally, install it first, then run the commands above.

# Demo Deployment

Status: demo deployment path

This deploys the side-chat demo to one DigitalOcean Droplet with Docker Compose and Caddy. It is intentionally not the production architecture. The goal is a stable HTTPS URL that people can open during a demo, while keeping the deployment small enough to understand.

## Shape

```txt
https://$DEMO_DOMAIN
  -> caddy
    -> embedded-host-app:8080
    -> side-chat-api:3000
    -> dashboard-data-api:3100

private Docker network
  -> postgres:5432
```

Only Caddy publishes host ports. Postgres has no public port.

## Files

| File | Purpose |
| --- | --- |
| `compose.demo.yml` | Demo stack for the Droplet. Separate from local `docker-compose.yml`. |
| `deploy/demo/Caddyfile` | Public HTTPS and same-origin path routing. |
| `deploy/demo/embedded-host.Caddyfile` | Internal static server for the built Vite host. |
| `deploy/demo/backup.sh` | Minimal `pg_dump` backup before deploy. |
| `deploy/demo/rollback.sh` | Image-tag rollback helper. |
| `deploy/demo/env.demo.example` | Template for the Droplet `.env.demo`. |
| `docker/postgres/init` | Postgres schema, roles, stored procedures, and deterministic demo seed data. |

## Runtime Contract

Create `/opt/side-chat-demo/.env.demo` on the Droplet:

```sh
DEMO_DOMAIN=demo.example.com
IMAGE_PREFIX=ghcr.io/your-org/side-chat-assistant
IMAGE_TAG=<git-sha>
OPENAI_API_KEY=<real-key>
POSTGRES_PASSWORD=<strong-password>
```

`OPENAI_API_KEY` and `POSTGRES_PASSWORD` must stay outside git.

## Routing

Caddy preserves path prefixes. Do not use `handle_path` here.

| Public path | Target |
| --- | --- |
| `/chat/*` | `side-chat-api:3000` |
| `/models` | `side-chat-api:3000` |
| `/health` | `side-chat-api:3000` |
| `/reports/*` | `side-chat-api:3000` |
| `/advisory-dashboard/*` | `dashboard-data-api:3100` |
| `/dashboard-health` | `dashboard-data-api:3100` |
| everything else | `embedded-host-app:8080` |

## First Droplet Setup

1. Create a small Ubuntu LTS Droplet.
2. Point the domain `A` record to the Droplet IP.
3. Install Docker and the Docker Compose plugin.
4. Create a deploy directory:

```sh
sudo mkdir -p /opt/side-chat-demo
sudo chown "$USER":"$USER" /opt/side-chat-demo
```

5. Copy `compose.demo.yml`, `deploy/demo/Caddyfile`, the helper scripts, and `docker/postgres/init` into that directory.
6. Create `.env.demo` from `deploy/demo/env.demo.example`.
7. Start the stack:

```sh
docker compose --env-file .env.demo -f compose.demo.yml up -d
```

## Backup

Run before deploy:

```sh
deploy/demo/backup.sh
```

The backup uses:

```sh
pg_dump -U postgres -d sidechat -Fc
```

Do not back up as `sidechat_app`; the schema intentionally revokes direct table access from that runtime role.

## Restore

Restore only when needed:

```sh
docker compose --env-file .env.demo -f compose.demo.yml exec -T postgres \
  pg_restore -U postgres -d sidechat --clean --if-exists --no-owner \
  < backups/sidechat-YYYYMMDDTHHMMSSZ.dump
```

## Rollback

Rollback app images to a previous git SHA:

```sh
deploy/demo/rollback.sh <previous-image-tag>
```

Database rollback is separate and manual. Use a dump restore only when the deploy changed data or schema in a way that must be undone.

## Verification

Before deploy:

```sh
npm run verify
docker compose --env-file deploy/demo/env.demo.example -f compose.demo.yml config
```

On the Droplet:

```sh
curl -fsS https://$DEMO_DOMAIN/health
curl -fsS https://$DEMO_DOMAIN/models
curl -fsS https://$DEMO_DOMAIN/dashboard-health
curl -fsS "https://$DEMO_DOMAIN/advisory-dashboard/snapshot?workspaceId=demo-workspace"
```

Smoke the stream:

```sh
curl -iN "https://$DEMO_DOMAIN/chat/stream" \
  -H "X-Sidechat-Protocol: sidechat.v1" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  --data '{
    "workspaceId":"demo-workspace",
    "userId":"demo-user",
    "conversationId":"demo-conversation-001",
    "message":{"id":"smoke-1","role":"user","content":"Summarize the dashboard."},
    "model":{"provider":"openai","id":"gpt-4.1-mini"}
  }'
```

For reports, trigger a report prompt in the UI and verify the returned `/reports/...pdf` URL opens through the public domain.

## Demo Limits

This is not high availability production infrastructure.

- One Droplet is one failure domain.
- Postgres lives on the Droplet.
- Backups are manual `pg_dump` files.
- Reports live on a Docker volume.
- Secrets live in the Droplet `.env.demo`.
- There is no managed observability or autoscaling.

If this stops being a demo, move Postgres to a managed database, reports to object storage, secrets to a managed secret store, and deployment to an infrastructure-as-code path.

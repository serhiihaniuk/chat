FROM node:22-bookworm-slim AS deps

WORKDIR /app

RUN npm install -g npm@11.12.1

COPY package.json package-lock.json ./
COPY apps/side-chat-api/package.json apps/side-chat-api/package.json
COPY apps/dashboard-data-api/package.json apps/dashboard-data-api/package.json
COPY apps/embedded-host-app/package.json apps/embedded-host-app/package.json
COPY apps/widget-demo/package.json apps/widget-demo/package.json
COPY packages/shared-protocol/package.json packages/shared-protocol/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/side-chat-widget/package.json packages/side-chat-widget/package.json

RUN npm ci

FROM deps AS build

COPY . .

RUN npm run build:deploy

FROM node:22-bookworm-slim AS side-chat-api

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/side-chat-api/package.json ./apps/side-chat-api/package.json
COPY --from=build /app/apps/side-chat-api/dist ./apps/side-chat-api/dist
COPY --from=build /app/packages/shared-protocol/package.json ./packages/shared-protocol/package.json
COPY --from=build /app/packages/shared-protocol/dist ./packages/shared-protocol/dist
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/packages/db/dist ./packages/db/dist

RUN npx playwright install --with-deps chromium \
  && mkdir -p /app/.sidechat-reports

EXPOSE 3000
CMD ["node", "apps/side-chat-api/dist/server.js"]

FROM node:22-bookworm-slim AS dashboard-data-api

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/dashboard-data-api/package.json ./apps/dashboard-data-api/package.json
COPY --from=build /app/apps/dashboard-data-api/dist ./apps/dashboard-data-api/dist
COPY --from=build /app/packages/shared-protocol/package.json ./packages/shared-protocol/package.json
COPY --from=build /app/packages/shared-protocol/dist ./packages/shared-protocol/dist
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/packages/db/dist ./packages/db/dist

EXPOSE 3100
CMD ["node", "apps/dashboard-data-api/dist/server.js"]

FROM caddy:2-alpine AS embedded-host-app

COPY deploy/demo/embedded-host.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/embedded-host-app/dist /srv/embedded-host

EXPOSE 8080

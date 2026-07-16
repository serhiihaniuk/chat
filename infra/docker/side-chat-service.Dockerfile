# syntax=docker/dockerfile:1

FROM node:24.16.0-bookworm-slim

WORKDIR /app

RUN npm install --global npm@11.15.0

COPY package.json package-lock.json .npmrc ./
COPY apps/side-chat-service/package.json apps/side-chat-service/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/host-bridge/package.json packages/host-bridge/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/side-chat-widget/package.json packages/side-chat-widget/package.json
COPY packages/stream-profile/package.json packages/stream-profile/package.json
COPY test-harness/widget-harness/package.json test-harness/widget-harness/package.json

RUN npm ci

COPY tsconfig.base.json ./
COPY apps/side-chat-service apps/side-chat-service
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY packages/stream-profile packages/stream-profile
COPY scripts scripts

RUN npm run build --workspace @side-chat/side-chat-service \
  && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8787

CMD ["npm", "run", "start", "--workspace", "@side-chat/side-chat-service"]

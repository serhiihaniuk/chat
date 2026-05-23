# syntax=docker/dockerfile:1

FROM node:24.16.0-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.base.json tsconfig.check.json ./
COPY apps/partner-ai-service/package.json apps/partner-ai-service/package.json
COPY packages/assistant-runtime/package.json packages/assistant-runtime/package.json
COPY packages/backend-core/package.json packages/backend-core/package.json
COPY packages/chat-protocol/package.json packages/chat-protocol/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/testing/package.json packages/testing/package.json

RUN npm ci --include=dev

COPY apps/partner-ai-service apps/partner-ai-service
COPY packages/assistant-runtime packages/assistant-runtime
COPY packages/backend-core packages/backend-core
COPY packages/chat-protocol packages/chat-protocol
COPY packages/db packages/db

RUN npm run typecheck --workspace @side-chat/partner-ai-service \
  && npm prune --omit=dev

USER node

EXPOSE 8787

ENV PORT=8787 \
  SIDECHAT_PROFILE=development \
  SIDECHAT_TENANT_ID=tenant_local \
  SIDECHAT_WORKSPACE_ID=workspace_local \
  SIDECHAT_POLICY_MODE=allow_all

CMD ["node", "apps/partner-ai-service/dist/server.js"]

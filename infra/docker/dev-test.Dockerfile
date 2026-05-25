# syntax=docker/dockerfile:1

FROM node:24.16.0-bookworm

WORKDIR /app

RUN npm install --global npm@11.15.0

COPY package.json package-lock.json .npmrc ./
COPY tsconfig.json tsconfig.base.json tsconfig.check.json ./
COPY .oxfmtrc.json .oxlintrc.json ./
COPY apps/partner-ai-service/package.json apps/partner-ai-service/package.json
COPY packages/agent-runtime/package.json packages/agent-runtime/package.json
COPY packages/partner-ai-core/package.json packages/partner-ai-core/package.json
COPY packages/chat-client/package.json packages/chat-client/package.json
COPY packages/chat-protocol/package.json packages/chat-protocol/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/host-bridge/package.json packages/host-bridge/package.json
COPY packages/side-chat-widget/package.json packages/side-chat-widget/package.json
COPY packages/testing/package.json packages/testing/package.json
COPY test-harness/widget-harness/package.json test-harness/widget-harness/package.json

RUN npm ci --include=dev
RUN npx playwright install --with-deps chromium

COPY . .

RUN npm run build

ENV CI=true

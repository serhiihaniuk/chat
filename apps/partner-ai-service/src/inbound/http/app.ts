import type {
  ObservabilitySinkPort,
  WorkspaceRef,
} from "@side-chat/partner-ai-core";
import type { SidechatRepositories } from "@side-chat/db";
import { Hono } from "hono";

import {
  createServiceAuthVerifier,
  type ServiceAuthConfig,
} from "../../adapters/auth/service-auth.js";
import {
  createServicePolicyPort,
  type ServicePolicyConfig,
} from "../../adapters/policy/service-policy.js";
import {
  composePartnerAiService,
  type PersistenceConfig,
} from "../../composition/service-composition.js";
import {
  authContextMiddleware,
  type AuthContextVariables,
} from "./middleware/auth-context.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { requireAuth } from "./middleware/require-auth.js";
import { registerChatHistoryRoutes } from "./routes/chat-history.js";
import { registerChatStreamRoute } from "./routes/chat-stream.js";
import { registerChatUsageRoute } from "./routes/chat-usage.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerModelsRoute } from "./routes/models.js";

const DEFAULT_WORKSPACE: WorkspaceRef = {
  tenantId: "tenant_local",
  workspaceId: "workspace_local",
};

export type PartnerAiServiceOptions = {
  readonly repositories?: SidechatRepositories;
  readonly auth?: ServiceAuthConfig;
  readonly observability?: ObservabilitySinkPort;
  readonly policies?: ServicePolicyConfig;
  readonly persistence?: PersistenceConfig;
  readonly persistenceLabel?: "memory" | "postgres-drizzle";
  readonly workspace?: WorkspaceRef;
};

export const createPartnerAiServiceApp = (
  options: PartnerAiServiceOptions = {},
) => {
  const app = new Hono<AuthContextVariables>();
  const composition = composePartnerAiService({
    workspace: options.workspace ?? DEFAULT_WORKSPACE,
    ...(options.auth ? { auth: options.auth } : {}),
    ...(options.policies ? { policies: options.policies } : {}),
    ...(options.persistence ? { persistence: options.persistence } : {}),
    ...(options.repositories ? { repositories: options.repositories } : {}),
  });
  const authority = createServiceAuthVerifier(composition.auth);
  const policies = createServicePolicyPort(composition.policies);
  const persistenceLabel =
    options.persistenceLabel ?? composition.persistenceLabel;

  app.use("*", requestIdMiddleware());

  registerHealthRoutes(app, {
    authConfig: composition.auth,
    policyConfig: composition.policies,
    persistenceLabel,
  });

  app.use("/models", authContextMiddleware(authority), requireAuth());
  app.use("/chat/*", authContextMiddleware(authority), requireAuth());
  app.use("/usage", authContextMiddleware(authority), requireAuth());

  registerModelsRoute(app, composition.policies);
  registerChatHistoryRoutes(app, {
    repositories: composition.repositories,
  });
  registerChatUsageRoute(app, composition.repositories);
  registerChatStreamRoute(app, {
    workspace: composition.workspace,
    repositories: composition.repositories,
    policies,
    ...(options.observability ? { observability: options.observability } : {}),
  });

  return app;
};

export type PartnerAiServiceApp = ReturnType<typeof createPartnerAiServiceApp>;

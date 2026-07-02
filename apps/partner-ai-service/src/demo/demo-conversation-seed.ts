import type { WorkspaceRef } from "@side-chat/partner-ai-core";
import {
  createMemorySidechatRepositories,
  REPOSITORY_ADAPTER_KINDS,
  toActorId,
  toConversationId,
  toSubjectId,
  toWorkspaceId,
  type SidechatRepositories,
} from "@side-chat/db";
import type { PartnerAiServiceOptions } from "#inbound/http/app";
import { DEFAULT_TENANT_ID, DEFAULT_WORKSPACE_ID } from "#config/env/service-env-contract";
import { ServiceConfigError } from "#config/service-config-error";

type DemoConversationSeed = {
  readonly id: string;
  readonly title: string;
  readonly minutesAgo: number;
  readonly messages: readonly DemoSeedMessage[];
};

type DemoSeedMessage = {
  readonly role: "user" | "assistant";
  readonly content: string;
};

/**
 * Inject a memory repository preloaded with local showcase conversations.
 *
 * The seed path is only for the no-DB demo server. It writes through the public
 * repository contract so the widget exercises the normal conversation list and
 * history routes instead of receiving mock-only sidebar data.
 */
export const withDemoSeededConversations = async (
  options: PartnerAiServiceOptions,
): Promise<PartnerAiServiceOptions> => {
  if (options.persistence?.kind === "postgres") {
    throw new ServiceConfigError("SIDECHAT_DEMO_SEED_CONVERSATIONS requires memory persistence.");
  }

  const repositories =
    options.repositories ?? createMemorySidechatRepositories({ idPrefix: "demo" });
  if (repositories.adapterKind !== REPOSITORY_ADAPTER_KINDS.MEMORY) {
    throw new ServiceConfigError("SIDECHAT_DEMO_SEED_CONVERSATIONS requires memory repositories.");
  }

  await seedDemoConversations(repositories, options.workspace ?? defaultWorkspace());
  return { ...options, persistence: { kind: "memory" }, repositories };
};

export const seedDemoConversations = async (
  repositories: SidechatRepositories,
  workspace: WorkspaceRef,
): Promise<void> => {
  const startedAt = Date.now();
  for (const seed of DEMO_CONVERSATIONS) {
    await seedConversation(repositories, workspace, seed, startedAt);
  }
};

const seedConversation = async (
  repositories: SidechatRepositories,
  workspace: WorkspaceRef,
  seed: DemoConversationSeed,
  startedAt: number,
): Promise<void> => {
  const conversationId = toConversationId(`demo_${seed.id}`);
  const now = isoMinutesAgo(startedAt, seed.minutesAgo);
  await repositories.createOrGetConversation({
    workspaceId: toWorkspaceId(workspace.workspaceId),
    subjectId: demoSubjectId(workspace),
    actorId: demoActorId(workspace),
    conversationId,
    conversationKey: conversationId,
    now,
  });
  await repositories.prepareConversationTitle({
    workspaceId: toWorkspaceId(workspace.workspaceId),
    subjectId: demoSubjectId(workspace),
    conversationId,
    titleText: seed.title,
    now,
  });

  for (const [index, message] of seed.messages.entries()) {
    await repositories.appendMessage({
      workspaceId: toWorkspaceId(workspace.workspaceId),
      subjectId: demoSubjectId(workspace),
      conversationId,
      role: message.role,
      contentText: message.content,
      metadataJson: { source: "side-chat-demo-seed" },
      idempotencyKey: { value: `${conversationId}:${index}:${message.role}` },
      now: isoMinutesAgo(startedAt, seed.minutesAgo - index),
    });
  }
};

const demoSubjectId = (workspace: WorkspaceRef) => toSubjectId(`${workspace.workspaceId}:subject`);

const demoActorId = (workspace: WorkspaceRef) => toActorId(`${workspace.workspaceId}:subject`);

const isoMinutesAgo = (startedAt: number, minutesAgo: number): string =>
  new Date(startedAt - minutesAgo * 60_000).toISOString();

const defaultWorkspace = (): WorkspaceRef => ({
  tenantId: DEFAULT_TENANT_ID,
  workspaceId: DEFAULT_WORKSPACE_ID,
});

const DEMO_CONVERSATIONS: readonly DemoConversationSeed[] = [
  {
    id: "mission",
    title: "Assistant Mission Overview",
    minutesAgo: 8,
    messages: [
      { role: "user", content: "What is your mission?" },
      {
        role: "assistant",
        content:
          "My mission is to sit inside the workspace, keep context close, and help turn host-app state into concrete next steps.",
      },
    ],
  },
  {
    id: "embed",
    title: "Workbench iframe checklist",
    minutesAgo: 26,
    messages: [
      { role: "user", content: "How should the Workbench embed control the assistant?" },
      {
        role: "assistant",
        content:
          "Host the frame under the Workbench origin, proxy API calls on the same origin, and let the host button own open and closed state.",
      },
    ],
  },
  {
    id: "thinking",
    title: "Thinking levels demo",
    minutesAgo: 44,
    messages: [
      { role: "user", content: "Show how fake thinking levels work." },
      {
        role: "assistant",
        content:
          "Pick low, medium, or high in the model control. The fake provider streams a matching Thinking activity while the app keeps using the real runtime path.",
      },
    ],
  },
  {
    id: "persistence",
    title: "Local persistence smoke",
    minutesAgo: 73,
    messages: [
      { role: "user", content: "Do these fake demo chats use persistence?" },
      {
        role: "assistant",
        content:
          "Yes. They are inserted into the in-memory repositories at startup, so conversation list and history routes behave like the real service.",
      },
    ],
  },
];

export type RepositoryScope = {
  readonly id: string;
  readonly prefixes: readonly string[];
  readonly canonicalDocs: readonly string[];
  readonly workspace?: string;
  readonly browserEvidence?: boolean;
};

export const REPOSITORY_SCOPES: readonly RepositoryScope[] = [
  {
    id: "partner-ai-core",
    prefixes: ["packages/partner-ai-core/"],
    canonicalDocs: [
      "docs/architecture/assistant-turn.md",
      "docs/architecture/effect.md",
      "docs/architecture/package-boundaries.md",
      "docs/operations/verification.md",
    ],
    workspace: "@side-chat/partner-ai-core",
  },
  {
    id: "agent-runtime",
    prefixes: ["packages/agent-runtime/"],
    canonicalDocs: [
      "docs/architecture/runtime-and-protocol-events.md",
      "docs/architecture/effect.md",
      "docs/architecture/package-boundaries.md",
      "docs/operations/verification.md",
    ],
    workspace: "@side-chat/agent-runtime",
  },
  {
    id: "ai-runtime-contract",
    prefixes: ["packages/ai-runtime-contract/"],
    canonicalDocs: [
      "docs/architecture/runtime-and-protocol-events.md",
      "docs/architecture/package-boundaries.md",
      "docs/operations/verification.md",
    ],
    workspace: "@side-chat/ai-runtime-contract",
  },
  {
    id: "chat-protocol",
    prefixes: ["packages/chat-protocol/"],
    canonicalDocs: [
      "docs/architecture/runtime-and-protocol-events.md",
      "docs/architecture/package-boundaries.md",
      "docs/operations/verification.md",
    ],
    workspace: "@side-chat/chat-protocol",
  },
  {
    id: "side-chat-service",
    prefixes: ["apps/side-chat-service/"],
    canonicalDocs: [
      "docs/architecture/assistant-turn.md",
      "docs/architecture/package-boundaries.md",
      "docs/architecture/runtime-and-protocol-events.md",
      "docs/operations/verification.md",
    ],
    workspace: "@side-chat/side-chat-service",
  },
  {
    id: "side-chat-widget",
    prefixes: ["packages/side-chat-widget/"],
    canonicalDocs: [
      "docs/architecture/widget-and-host-integration.md",
      "docs/architecture/package-boundaries.md",
      "docs/operations/verification.md",
    ],
    workspace: "@side-chat/side-chat-widget",
    browserEvidence: true,
  },
  {
    id: "host-bridge",
    prefixes: ["packages/host-bridge/"],
    canonicalDocs: [
      "docs/architecture/widget-and-host-integration.md",
      "docs/architecture/package-boundaries.md",
      "docs/operations/verification.md",
    ],
    workspace: "@side-chat/host-bridge",
    browserEvidence: true,
  },
  {
    id: "stream-profile",
    prefixes: ["packages/stream-profile/"],
    canonicalDocs: [
      "docs/architecture/runtime-and-protocol-events.md",
      "docs/architecture/package-boundaries.md",
      "docs/operations/verification.md",
    ],
    workspace: "@side-chat/stream-profile",
  },
  {
    id: "database",
    prefixes: ["packages/db/"],
    canonicalDocs: [
      "docs/operations/database.md",
      "docs/architecture/package-boundaries.md",
      "docs/operations/verification.md",
    ],
    workspace: "@side-chat/db",
  },
  {
    id: "shared",
    prefixes: ["packages/shared/"],
    canonicalDocs: [
      "docs/architecture/system-map.md",
      "docs/architecture/package-boundaries.md",
      "docs/operations/verification.md",
    ],
    workspace: "@side-chat/shared",
  },
  {
    id: "partner-ai-service",
    prefixes: ["apps/partner-ai-service/"],
    canonicalDocs: [
      "docs/architecture/system-map.md",
      "docs/architecture/assistant-turn.md",
      "docs/architecture/package-boundaries.md",
      "docs/operations/verification.md",
    ],
    workspace: "@side-chat/partner-ai-service",
  },
  {
    id: "widget-harness",
    prefixes: ["test-harness/widget-harness/"],
    canonicalDocs: [
      "docs/architecture/widget-and-host-integration.md",
      "docs/operations/verification.md",
    ],
    workspace: "@side-chat/widget-harness",
    browserEvidence: true,
  },
  {
    id: "architecture-docs",
    prefixes: ["docs/architecture/", "docs/domain/"],
    canonicalDocs: ["docs/README.md"],
  },
  {
    id: "v7-plan",
    prefixes: ["plan/v7/"],
    canonicalDocs: ["plan/v7/STATUS.md", "plan/v7/KNOWLEDGE.md"],
  },
] as const;

export function normalizeRepositoryPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function scopesForPaths(paths: readonly string[]): readonly RepositoryScope[] {
  const normalizedPaths = paths.map(normalizeRepositoryPath);
  return REPOSITORY_SCOPES.filter((scope) =>
    scope.prefixes.some((prefix) =>
      normalizedPaths.some((path) => path === prefix.slice(0, -1) || path.startsWith(prefix)),
    ),
  );
}

export function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

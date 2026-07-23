import { createHash, timingSafeEqual } from "node:crypto";

import type { RequestAuthorizer } from "@side-chat/side-chat-server";

const STATIC_SUBJECT_SUFFIX = "subject";

export type StaticTokenAuthorizerOptions = Readonly<{
  bearerToken: string;
  workspaceId: string;
  now?: () => Date;
}>;

export function createStaticTokenAuthorizer(
  options: StaticTokenAuthorizerOptions,
): RequestAuthorizer {
  const trustedToken = normalizeBearerToken(options.bearerToken);
  return {
    authorize: (request) =>
      Promise.resolve(
        request.bearerToken !== undefined && tokensMatch(request.bearerToken, trustedToken)
          ? {
              workspaceId: options.workspaceId,
              subjectId: staticSubjectId(options.workspaceId),
              issuedAt: (options.now ?? (() => new Date()))().toISOString(),
            }
          : undefined,
      ),
  };
}

export function staticSubjectId(workspaceId: string): string {
  return `${workspaceId}:${STATIC_SUBJECT_SUFFIX}`;
}

export function normalizeBearerToken(token: string): string {
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

function tokensMatch(candidate: string, trusted: string): boolean {
  return timingSafeEqual(sha256(candidate), sha256(trusted));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

import type { WorkflowConversationCatalog, WorkflowUIMessage } from "#entities/workflow-chat";

const TITLE_REFRESH_RETRY_DELAY_MS = 1_500;
export const TITLE_REFRESH_MAX_RETRIES = 8;

type RefreshWorkflowConversationTitleInput = Readonly<{
  conversationId: string;
  initialTitle?: string | undefined;
  readCatalog: () => Promise<WorkflowConversationCatalog>;
}>;

/**
 * Reconcile the catalog with the title workflow that finishes after the turn stream.
 *
 * A new conversation may not exist in the first catalog read yet. In that case,
 * the first observed label becomes the fallback and polling continues until the
 * generated title replaces it or the bounded retry window closes.
 */
export async function refreshWorkflowConversationTitle({
  conversationId,
  initialTitle,
  readCatalog,
}: RefreshWorkflowConversationTitleInput): Promise<boolean> {
  let fallbackTitle = normalizeTitle(initialTitle);
  for (let retry = 0; retry <= TITLE_REFRESH_MAX_RETRIES; retry += 1) {
    const catalog = await readCatalogSafely(readCatalog);
    const currentTitle = normalizeTitle(findConversationTitle(catalog, conversationId));
    if (currentTitle !== undefined) {
      if (fallbackTitle === undefined) fallbackTitle = currentTitle;
      else if (currentTitle !== fallbackTitle) return true;
    }
    if (retry < TITLE_REFRESH_MAX_RETRIES) await delay(TITLE_REFRESH_RETRY_DELAY_MS);
  }
  return false;
}

/** True when the catalog label is still the service's first-user-message fallback. */
export function isWorkflowConversationTitleFallback(
  catalog: WorkflowConversationCatalog | undefined,
  conversationId: string,
  messages: readonly WorkflowUIMessage[] | undefined,
): boolean {
  const catalogTitle = normalizeTitle(findConversationTitle(catalog, conversationId));
  const firstUserTitle = normalizeTitle(firstUserMessageText(messages));
  return catalogTitle !== undefined && catalogTitle === firstUserTitle;
}

export function findConversationTitle(
  catalog: WorkflowConversationCatalog | undefined,
  conversationId: string,
): string | undefined {
  return catalog?.conversations.find((conversation) => conversation.id === conversationId)?.title;
}

async function readCatalogSafely(
  readCatalog: () => Promise<WorkflowConversationCatalog>,
): Promise<WorkflowConversationCatalog | undefined> {
  try {
    return await readCatalog();
  } catch {
    return undefined;
  }
}

function firstUserMessageText(
  messages: readonly WorkflowUIMessage[] | undefined,
): string | undefined {
  const message = messages?.find((candidate) => candidate.role === "user");
  return message?.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function normalizeTitle(title: string | undefined): string | undefined {
  const normalized = title?.trim().replaceAll(/\s+/gu, " ");
  return normalized ? normalized : undefined;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

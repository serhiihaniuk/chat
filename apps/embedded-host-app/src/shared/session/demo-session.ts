const demoConversationStorageKey = "sidechat.demoConversationId";
const demoConversationPrefix = "demo-conversation";

type ConversationIdStorage = Pick<Storage, "getItem" | "setItem">;

const getBrowserStorage = () => {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
};

const isDemoConversationId = (value: string | null | undefined) =>
  Boolean(value?.startsWith(`${demoConversationPrefix}-`));

export const createDemoConversationId = () =>
  `${demoConversationPrefix}-${Date.now().toString(36)}-${crypto.randomUUID()}`;

/**
 * Public demos need shared Workbench data but isolated chat history. A stable
 * browser-local conversation id gives each viewer their own assistant session.
 */
export const resolveDemoConversationId = (
  storage: ConversationIdStorage | undefined = getBrowserStorage(),
) => {
  try {
    const existing = storage?.getItem(demoConversationStorageKey);
    if (isDemoConversationId(existing)) return existing as string;

    const nextConversationId = createDemoConversationId();
    storage?.setItem(demoConversationStorageKey, nextConversationId);
    return nextConversationId;
  } catch {
    return createDemoConversationId();
  }
};


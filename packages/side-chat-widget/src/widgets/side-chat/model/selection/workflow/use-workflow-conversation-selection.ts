import { useCallback, useRef, useState } from "react";

import {
  clearWorkflowActiveTurnCursor,
  readWorkflowActiveTurnCursor,
  writeWorkflowActiveTurnCursor,
  type WorkflowActiveTurnCursor,
} from "../workflow-recovery/workflow-active-turn-cursor.js";

export const WORKFLOW_CONVERSATION_SELECTION_KIND = {
  DRAFT: "draft",
  PERSISTED: "persisted",
} as const;

export type WorkflowConversationSelectionState =
  | Readonly<{ kind: "draft"; conversationId: string }>
  | Readonly<{ kind: "persisted"; conversationId: string }>;

export type WorkflowConversationSelection = Readonly<{
  activeConversationId: string;
  acceptedRun: (conversationId: string, runId: string) => void;
  clearTerminalRun: (runId: string) => void;
  discardInvalidRecovery: (cursor: WorkflowActiveTurnCursor) => void;
  focusActiveRun: (conversationId: string, runId: string) => void;
  isLocalDraft: boolean;
  recoveryCursor: WorkflowActiveTurnCursor | undefined;
  recoveryNeedsValidation: boolean;
  selectConversation: (conversationId: string) => void;
  startNewConversation: () => void;
}>;

export function useWorkflowConversationSelection(
  initialConversationId: string | undefined,
  activeTurnStorageKey: string | undefined,
): WorkflowConversationSelection {
  const initialRecoveryCursor = readWorkflowActiveTurnCursor(activeTurnStorageKey);
  const [recoveryCursor, setRecoveryCursor] = useState(initialRecoveryCursor);
  const [selection, setSelection] = useState(
    createInitialWorkflowConversationSelection(initialConversationId, initialRecoveryCursor),
  );
  const [recoveryNeedsValidation, setRecoveryNeedsValidation] = useState(
    recoveryCursor !== undefined,
  );
  const selectionRef = useRef(selection);
  const recoveryCursorRef = useRef(recoveryCursor);
  selectionRef.current = selection;
  recoveryCursorRef.current = recoveryCursor;

  const updateSelection = useCallback((next: WorkflowConversationSelectionState): void => {
    selectionRef.current = next;
    setSelection(next);
  }, []);
  const clearFocusedRun = useCallback((): void => {
    const cursor = recoveryCursorRef.current;
    if (!cursor) return;
    clearWorkflowActiveTurnCursor(activeTurnStorageKey, cursor.runId);
    recoveryCursorRef.current = undefined;
    setRecoveryCursor(undefined);
    setRecoveryNeedsValidation(false);
  }, [activeTurnStorageKey]);
  const startNewConversation = useCallback((): void => {
    clearFocusedRun();
    updateSelection(createWorkflowDraftSelection());
  }, [clearFocusedRun, updateSelection]);
  const selectConversation = useCallback(
    (conversationId: string): void => {
      if (selectionRef.current.conversationId === conversationId) return;
      clearFocusedRun();
      updateSelection(createPersistedWorkflowSelection(conversationId));
    },
    [clearFocusedRun, updateSelection],
  );
  const focusActiveRun = useCallback(
    (conversationId: string, runId: string): void => {
      if (selectionRef.current.conversationId !== conversationId) return;
      const cursor = { conversationId, runId };
      writeWorkflowActiveTurnCursor(activeTurnStorageKey, cursor);
      recoveryCursorRef.current = cursor;
      setRecoveryCursor(cursor);
      setRecoveryNeedsValidation(false);
    },
    [activeTurnStorageKey],
  );
  const acceptedRun = useCallback(
    (conversationId: string, runId: string): void => {
      if (selectionRef.current.conversationId !== conversationId) return;
      const next = promoteWorkflowSelection(selectionRef.current);
      updateSelection(next);
      focusActiveRun(next.conversationId, runId);
    },
    [focusActiveRun, updateSelection],
  );
  const clearTerminalRun = useCallback(
    (runId: string): void => {
      const cursor = recoveryCursorRef.current;
      if (cursor?.runId !== runId) return;
      clearWorkflowActiveTurnCursor(activeTurnStorageKey, runId);
      recoveryCursorRef.current = undefined;
      setRecoveryCursor(undefined);
      setRecoveryNeedsValidation(false);
    },
    [activeTurnStorageKey],
  );
  const discardInvalidRecovery = useCallback(
    (cursor: WorkflowActiveTurnCursor): void => {
      if (recoveryCursorRef.current?.runId !== cursor.runId) return;
      clearWorkflowActiveTurnCursor(activeTurnStorageKey, cursor.runId);
      recoveryCursorRef.current = undefined;
      setRecoveryCursor(undefined);
      setRecoveryNeedsValidation(false);
    },
    [activeTurnStorageKey],
  );
  return {
    activeConversationId: selection.conversationId,
    acceptedRun,
    clearTerminalRun,
    discardInvalidRecovery,
    focusActiveRun,
    isLocalDraft: selection.kind === WORKFLOW_CONVERSATION_SELECTION_KIND.DRAFT,
    recoveryCursor,
    recoveryNeedsValidation,
    selectConversation,
    startNewConversation,
  };
}

export function createInitialWorkflowConversationSelection(
  initialConversationId: string | undefined,
  recoveryCursor: WorkflowActiveTurnCursor | undefined,
  createId: () => string = () => crypto.randomUUID(),
): WorkflowConversationSelectionState {
  if (recoveryCursor) return createPersistedWorkflowSelection(recoveryCursor.conversationId);
  if (initialConversationId) return createPersistedWorkflowSelection(initialConversationId);
  return createWorkflowDraftSelection(createId);
}

export function createWorkflowDraftSelection(
  createId: () => string = () => crypto.randomUUID(),
): WorkflowConversationSelectionState {
  return { kind: WORKFLOW_CONVERSATION_SELECTION_KIND.DRAFT, conversationId: createId() };
}

export function createPersistedWorkflowSelection(
  conversationId: string,
): WorkflowConversationSelectionState {
  return { kind: WORKFLOW_CONVERSATION_SELECTION_KIND.PERSISTED, conversationId };
}

export function promoteWorkflowSelection(
  selection: WorkflowConversationSelectionState,
): WorkflowConversationSelectionState {
  if (selection.kind === WORKFLOW_CONVERSATION_SELECTION_KIND.PERSISTED) return selection;
  return createPersistedWorkflowSelection(selection.conversationId);
}

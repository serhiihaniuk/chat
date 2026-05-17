import { useEffect, useMemo, useRef, useState, type FormEvent, type CSSProperties } from 'react';
import type { ModelSelection, TokenUsage } from '@side-chat/shared-protocol';
import {
	appearanceStorageKey,
	defaultAppearancePresetId,
	getAppearancePreset,
	isAppearancePresetId,
	type AppearancePresetId
} from '../../domain/appearance/appearance.js';
import {
	defaultModelAliasId,
	fallbackModel,
	resolveModelAliasId
} from '../../domain/model/model-selection.js';
import { panelId } from '../../domain/panel/panel-geometry.js';
import { getVisibleContextCharacters } from '../../domain/message/message-presentation.js';
import { useSideChat, type SideChatError } from '../../adapters/react/use-side-chat.js';
import { ChatComposer } from '../composer/ChatComposer.js';
import { ConversationPanel } from '../conversation-feed/ConversationPanel.js';
import { QuickActions } from '../composer/QuickActions.js';
import { ResizeHandles } from '../panel-shell/ResizeHandles.js';
import { ErrorBanner, StreamingStatus } from '../panel-shell/WidgetStatus.js';
import { WidgetHeader } from '../panel-shell/WidgetHeader.js';
import { usePanelShell } from '../panel-shell/use-panel-shell.js';
import { WidgetLauncher } from './WidgetLauncher.js';
import type {
	SideChatHostBridge,
	SideChatIdentity,
	SideChatTransport
} from '../../ports/widget-contracts.js';

/**
 * Widget shell composition. This file wires ports, domain rules, the React
 * adapter, and presentation slices into the reusable public component.
 */
export {
	getMetadataAttachments,
	inferInlineSourcesFromContent,
	mergeAttachments,
	parseCitationMetadata,
	selectInlineSources
} from '../../domain/message/message-presentation.js';

type SideChatWidgetBaseProps = {
	initialConversationId?: string;
	historyEndpoint?: string;
	host?: SideChatHostBridge;
	title?: string;
	placeholder?: string;
	defaultModel?: ModelSelection;
	availableModels?: ModelSelection[];
	onOpen?: () => void;
	onClose?: () => void;
	onError?: (error: SideChatError) => void;
	onUsage?: (usage: TokenUsage) => void;
};

export type SideChatWidgetProps = SideChatWidgetBaseProps &
	(
		| {
				apiEndpoint: string;
				workspaceId: string;
				transport?: SideChatTransport;
				identity?: SideChatIdentity;
		  }
		| {
				transport: SideChatTransport;
				identity: SideChatIdentity;
				apiEndpoint?: string;
				workspaceId?: string;
		  }
	);

export function SideChatWidget(props: SideChatWidgetProps) {
	const [draft, setDraft] = useState('');
	const [appearanceOpen, setAppearanceOpen] = useState(false);
	const [selectedModelAliasId, setSelectedModelAliasId] = useState(defaultModelAliasId);
	const [appearancePresetId, setAppearancePresetId] =
		useState<AppearancePresetId>(defaultAppearancePresetId);
	const [scrollToBottomSignal, setScrollToBottomSignal] = useState(0);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const panel = usePanelShell({
		onOpen: props.onOpen,
		onClose: props.onClose
	});
	const models = useMemo(
		() => (props.availableModels?.length ? props.availableModels : [fallbackModel]),
		[props.availableModels]
	);
	const apiEndpoint = resolveApiEndpoint(props);
	const workspaceId = resolveWorkspaceId(props);
	const initialConversationId = props.identity?.conversationId ?? props.initialConversationId;
	const historyEndpoint = props.transport?.historyUrl ?? props.historyEndpoint;
	const chat = useSideChat({
		apiEndpoint,
		workspaceId,
		initialConversationId,
		historyEndpoint,
		defaultModel: props.defaultModel ?? models[0],
		getHostContext: props.host?.getContext,
		dispatchHostCommand: props.host?.dispatchCommand,
		onError: props.onError,
		onUsage: props.onUsage
	});

	const selectModelAlias = (aliasId: string) => {
		setSelectedModelAliasId(resolveModelAliasId(aliasId));
		chat.setModel(models[0]);
	};

	const canSend = draft.trim().length > 0 && !chat.isStreaming;
	const visibleContextCharacters = getVisibleContextCharacters(chat.messages);
	const appearancePreset = getAppearancePreset(appearancePresetId);
	const appearanceVars = {
		'--sidechat-accent': appearancePreset.accent,
		'--sidechat-bg': appearancePreset.background,
		'--sidechat-fg': appearancePreset.foreground,
		'--sidechat-surface': appearancePreset.surface,
		'--sidechat-border': appearancePreset.border
	} as CSSProperties;

	useEffect(() => {
		if (panel.open) {
			inputRef.current?.focus({ preventScroll: true });
		}
	}, [panel.open]);

	useEffect(() => {
		if (!panel.open) setAppearanceOpen(false);
	}, [panel.open]);

	useEffect(() => {
		try {
			const stored = window.localStorage.getItem(appearanceStorageKey);
			if (stored && isAppearancePresetId(stored)) {
				setAppearancePresetId(stored);
			}
		} catch {
			// Appearance persistence is optional; ignore unavailable storage.
		}
	}, []);

	const selectAppearancePreset = (presetId: AppearancePresetId) => {
		setAppearancePresetId(presetId);
		setAppearanceOpen(false);
		try {
			window.localStorage.setItem(appearanceStorageKey, presetId);
		} catch {
			// Appearance persistence is optional; ignore unavailable storage.
		}
	};

	const resetAppearancePreset = () => {
		setAppearancePresetId(defaultAppearancePresetId);
		setAppearanceOpen(false);
		try {
			window.localStorage.removeItem(appearanceStorageKey);
		} catch {
			// Appearance persistence is optional; ignore unavailable storage.
		}
	};

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSend) return;
		setScrollToBottomSignal((current) => current + 1);
		void chat.sendMessage(draft);
		setDraft('');
	};

	const sendQuickPrompt = (prompt: string, displayContent = prompt) => {
		if (chat.isStreaming) return;
		setScrollToBottomSignal((current) => current + 1);
		void chat.sendMessage(prompt, { displayContent });
	};

	const retryLastMessage = () => {
		if (chat.isStreaming) return;
		setScrollToBottomSignal((current) => current + 1);
		chat.retryLastMessage();
	};

	const toggleFullscreen = () => {
		setAppearanceOpen(false);
		panel.toggleFullscreen();
	};

	const widgetState = getWidgetState({
		hasError: Boolean(chat.error),
		isHistoryLoading: chat.isHistoryLoading,
		isStreaming: chat.isStreaming,
		messageCount: chat.messages.length
	});

	if (!panel.open) {
		return (
			<WidgetLauncher
				appearanceVars={appearanceVars}
				launcherButtonRef={panel.launcherButtonRef}
				onOpen={panel.openPanel}
			/>
		);
	}

	return (
		<aside
			ref={panel.panelRef}
			id={panelId}
			className={`fixed z-50 flex flex-col overflow-hidden border bg-white text-slate-950 ${
				panel.isFullscreen
					? 'inset-0 max-h-none max-w-none rounded-none border-0 shadow-none'
					: 'right-5 bottom-5 max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] min-w-140 rounded-lg border-slate-300 shadow-xl shadow-slate-950/15 max-sm:right-3 max-sm:bottom-3 max-sm:left-3 max-sm:min-w-0 max-sm:max-w-none'
			}`}
			style={{
				...appearanceVars,
				width: panel.isFullscreen ? '100vw' : `min(${panel.panelSize.width}px, calc(100vw - 2rem))`,
				height: panel.isFullscreen
					? '100vh'
					: `min(${panel.panelSize.height}px, calc(100vh - 2rem))`,
				background: 'var(--sidechat-bg)',
				borderColor: 'var(--sidechat-border)',
				color: 'var(--sidechat-fg)',
				transform: panel.isFullscreen
					? 'none'
					: `translate(${panel.panelOffset.x}px, ${panel.panelOffset.y}px)`,
				willChange: panel.isFullscreen ? 'auto' : 'transform'
			}}
			aria-label={props.title ?? 'Side chat assistant'}
			aria-live="polite"
			data-testid="side-chat-widget"
			data-sidechat-root="true"
			data-state={widgetState}
			onKeyDown={panel.handlePanelKeyDown}
		>
			{!panel.isFullscreen ? <ResizeHandles onResizeStart={panel.startPanelResize} /> : null}
			<WidgetHeader
				appearanceOpen={appearanceOpen}
				appearancePreset={appearancePreset}
				isFullscreen={panel.isFullscreen}
				title={props.title}
				onAppearanceToggle={() => setAppearanceOpen((current) => !current)}
				onClose={panel.closePanel}
				onDragStart={panel.startPanelDrag}
				onFullscreenToggle={toggleFullscreen}
				onResetAppearance={resetAppearancePreset}
				onSelectAppearance={selectAppearancePreset}
			/>
			<ConversationPanel
				activeAssistantMessageId={chat.activeAssistantMessageId}
				apiEndpoint={apiEndpoint}
				error={chat.error}
				historyStatus={chat.historyStatus}
				isHistoryLoading={chat.isHistoryLoading}
				isStreaming={chat.isStreaming}
				messages={chat.messages}
				scrollToBottomSignal={scrollToBottomSignal}
			/>
			{chat.error ? (
				<ErrorBanner error={chat.error} isStreaming={chat.isStreaming} onRetry={retryLastMessage} />
			) : null}
			{chat.isStreaming ? <StreamingStatus /> : null}
			<QuickActions isStreaming={chat.isStreaming} onQuickPrompt={sendQuickPrompt} />
			<ChatComposer
				canSend={canSend}
				draft={draft}
				inputRef={inputRef}
				isStreaming={chat.isStreaming}
				modelAliasId={selectedModelAliasId}
				placeholder={props.placeholder}
				usage={chat.usage}
				visibleContextCharacters={visibleContextCharacters}
				onDraftChange={setDraft}
				onModelAliasChange={selectModelAlias}
				onSubmit={submit}
			/>
		</aside>
	);
}

const resolveApiEndpoint = (props: SideChatWidgetProps) => {
	if (props.transport?.streamUrl) return props.transport.streamUrl;
	if ('apiEndpoint' in props && props.apiEndpoint) return props.apiEndpoint;
	return '';
};

const resolveWorkspaceId = (props: SideChatWidgetProps) => {
	if (props.identity?.workspaceId) return props.identity.workspaceId;
	if ('workspaceId' in props && props.workspaceId) return props.workspaceId;
	return '';
};

type WidgetStateInput = {
	hasError: boolean;
	isHistoryLoading: boolean;
	isStreaming: boolean;
	messageCount: number;
};

const getWidgetState = ({
	hasError,
	isHistoryLoading,
	isStreaming,
	messageCount
}: WidgetStateInput) => {
	if (isHistoryLoading) return 'loading';
	if (hasError) return 'error';
	if (isStreaming) return 'streaming';
	if (messageCount === 0) return 'empty';
	return 'ready';
};

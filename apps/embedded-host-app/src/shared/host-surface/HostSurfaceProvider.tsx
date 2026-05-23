import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  HostCommand,
  HostCommandResult,
  HostContextSnapshot,
} from "@side-chat/shared-protocol";

export type HostSurfaceRegistration = {
  id: string;
  getContext: () => HostContextSnapshot | undefined;
  dispatchCommand?: (
    command: HostCommand,
  ) => HostCommandResult | Promise<HostCommandResult>;
};

type HostSurfaceRegistry = {
  register: (registration: HostSurfaceRegistration) => () => void;
  getContext: () => HostContextSnapshot | undefined;
  dispatchCommand: (command: HostCommand) => Promise<HostCommandResult>;
};

const HostSurfaceContext = createContext<HostSurfaceRegistry | null>(null);

const unsupportedCommand = (): HostCommandResult => ({
  status: "unsupported",
  message: "No active host surface can handle this command.",
});

/**
 * Host-surface registry. It lets pages register current context/commands while
 * keeping the reusable widget unaware of Workbench-specific state.
 */
export function HostSurfaceProvider({ children }: { children: ReactNode }) {
  const registrationsRef = useRef(new Map<string, HostSurfaceRegistration>());
  const activeRegistrationIdRef = useRef<string | undefined>(undefined);

  const getActiveRegistration = useCallback(() => {
    const activeId = activeRegistrationIdRef.current;
    if (!activeId) return undefined;
    return registrationsRef.current.get(activeId);
  }, []);

  const register = useCallback((registration: HostSurfaceRegistration) => {
    registrationsRef.current.set(registration.id, registration);
    activeRegistrationIdRef.current = registration.id;

    return () => {
      registrationsRef.current.delete(registration.id);
      if (activeRegistrationIdRef.current !== registration.id) return;

      activeRegistrationIdRef.current = Array.from(
        registrationsRef.current.keys(),
      ).at(-1);
    };
  }, []);

  const getContext = useCallback(
    () => getActiveRegistration()?.getContext(),
    [getActiveRegistration],
  );

  const dispatchCommand = useCallback(
    async (command: HostCommand): Promise<HostCommandResult> => {
      const registration = getActiveRegistration();
      if (!registration?.dispatchCommand) return unsupportedCommand();
      return await registration.dispatchCommand(command);
    },
    [getActiveRegistration],
  );

  const value = useMemo(
    () => ({ register, getContext, dispatchCommand }),
    [dispatchCommand, getContext, register],
  );

  return (
    <HostSurfaceContext.Provider value={value}>
      {children}
    </HostSurfaceContext.Provider>
  );
}

export function useHostSurfaceRegistration(
  registration: HostSurfaceRegistration,
) {
  const registry = useHostSurfaceRegistry();

  useEffect(
    () => registry.register(registration),
    [registration, registry],
  );
}

type HostConnectedSideChatIframeProps = {
  src: string;
  title: string;
};

type EmbedMessage =
  | {
      type: "sidechat.embed.ready";
    }
  | {
      type: "sidechat.embed.resize";
      height: number;
      width: number;
    }
  | {
      type: "sidechat.host.getContext";
      requestId: string;
    }
  | {
      type: "sidechat.host.dispatchCommand";
      command: HostCommand;
      requestId: string;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isEmbedMessage = (value: unknown): value is EmbedMessage => {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  return value.type.startsWith("sidechat.");
};

const getFrameOrigin = (src: string) => {
  try {
    return new URL(src, window.location.href).origin;
  } catch {
    return "*";
  }
};

const closedFrameSize = { width: 112, height: 112 };

export function HostConnectedSideChatIframe({
  src,
  title,
}: HostConnectedSideChatIframeProps) {
  const registry = useHostSurfaceRegistry();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [frameSize, setFrameSize] = useState(closedFrameSize);
  const targetOrigin = useMemo(() => getFrameOrigin(src), [src]);

  const postToFrame = useCallback(
    (message: unknown) => {
      iframeRef.current?.contentWindow?.postMessage(message, targetOrigin);
    },
    [targetOrigin],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (targetOrigin !== "*" && event.origin !== targetOrigin) return;
      if (!isEmbedMessage(event.data)) return;

      if (event.data.type === "sidechat.embed.ready") {
        postToFrame({
          type: "sidechat.host.context",
          context: registry.getContext(),
        });
        return;
      }

      if (event.data.type === "sidechat.embed.resize") {
        setFrameSize({
          width: Math.max(80, Math.min(event.data.width, window.innerWidth)),
          height: Math.max(80, Math.min(event.data.height, window.innerHeight)),
        });
        return;
      }

      if (event.data.type === "sidechat.host.getContext") {
        postToFrame({
          type: "sidechat.host.context",
          requestId: event.data.requestId,
          context: registry.getContext(),
        });
        return;
      }

      if (event.data.type === "sidechat.host.dispatchCommand") {
        const { command, requestId } = event.data;
        void registry.dispatchCommand(command).then((result) => {
          postToFrame({
            type: "sidechat.host.commandResult",
            requestId,
            result,
          });
        });
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [postToFrame, registry, targetOrigin]);

  return (
    <iframe
      ref={iframeRef}
      allow="clipboard-write"
      className="sidechat-embed-frame"
      src={src}
      style={{
        width: `${frameSize.width}px`,
        height: `${frameSize.height}px`,
      }}
      title={title}
    />
  );
}

const useHostSurfaceRegistry = () => {
  const registry = useContext(HostSurfaceContext);
  if (!registry) {
    throw new Error("Host surface hooks must be used inside HostSurfaceProvider.");
  }
  return registry;
};

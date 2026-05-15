import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  SideChatWidget,
  type SideChatWidgetProps,
} from "@side-chat/side-chat-widget";
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

type HostConnectedSideChatWidgetProps = Omit<
  Extract<SideChatWidgetProps, { transport: unknown; identity: unknown }>,
  "host"
>;

export function HostConnectedSideChatWidget(
  props: HostConnectedSideChatWidgetProps,
) {
  const registry = useHostSurfaceRegistry();
  const host = useMemo(
    () => ({
      getContext: registry.getContext,
      dispatchCommand: registry.dispatchCommand,
    }),
    [registry.dispatchCommand, registry.getContext],
  );

  return <SideChatWidget {...props} host={host} />;
}

const useHostSurfaceRegistry = () => {
  const registry = useContext(HostSurfaceContext);
  if (!registry) {
    throw new Error("Host surface hooks must be used inside HostSurfaceProvider.");
  }
  return registry;
};

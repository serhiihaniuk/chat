import { useEffect } from "react";

/**
 * Resume the active run on the events that mean "the user is back".
 *
 * Mount covers a remount or full reload; `visibilitychange -> visible` and
 * `online` cover a backgrounded tab or a dropped network. Each just asks the
 * controller to reconnect, which is a no-op when there is no resumable run and
 * idempotent by sequence when there is. A reconnect may land on a different
 * server instance — expected and supported.
 */
export const useReconnectTriggers = (reconnect: () => void): void => {
  useEffect(() => {
    reconnect();

    const onVisible = (): void => {
      if (document.visibilityState === "visible") reconnect();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", reconnect);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", reconnect);
    };
  }, [reconnect]);
};

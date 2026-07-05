import { useEffect, useState } from "react";

// The widget drops to a bottom sheet at or below this width, aligned with the panel
// chrome's existing `max-sm:` treatment (Tailwind `sm` = 40rem / 640px).
const MOBILE_QUERY = "(max-width: 639px)";

const matchesMobile = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(MOBILE_QUERY).matches;
};

/**
 * True while the viewport is at or below the mobile breakpoint.
 *
 * SSR/prerender and environments without `matchMedia` resolve to `false` (the
 * floating panel), and a lazy initializer reads the real match on the first client
 * render so there is no desktop→mobile flash. Subscribes to viewport changes so a
 * rotate/resize across the breakpoint re-renders.
 */
export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState<boolean>(matchesMobile);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(MOBILE_QUERY);
    const sync = (): void => setIsMobile(query.matches);
    sync();
    if (typeof query.addEventListener !== "function") return;
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return isMobile;
};

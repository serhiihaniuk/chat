import type { AdvisoryDashboardSnapshot } from "../model/advisory-dashboard.types.js";

export const getAdvisoryDashboardSnapshot = async (
  workspaceId: string,
  signal?: AbortSignal,
): Promise<AdvisoryDashboardSnapshot> => {
  const params = new URLSearchParams({ workspaceId });
  const response = await fetch(`/advisory-dashboard/snapshot?${params}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Dashboard snapshot request failed: ${response.status}`);
  }

  return (await response.json()) as AdvisoryDashboardSnapshot;
};

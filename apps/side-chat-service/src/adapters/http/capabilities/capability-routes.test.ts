import { describe, expect, it } from "vitest";

import { QUERY_HTTP_ROUTES } from "#adapters/http/http-contract";
import { createServiceTestHarness } from "#composition/route/testing-harness/service-test-harness";

describe("service capability routes", () => {
  it.each([true, false])(
    "publishes host-context capability %s behind authentication",
    async (enabled) => {
      const harness = await createServiceTestHarness({ hostContext: { enabled } });
      try {
        const response = await harness.request(QUERY_HTTP_ROUTES.CAPABILITIES);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ hostContext: { enabled } });

        const unauthenticated = await harness.unauthenticatedRequest(
          QUERY_HTTP_ROUTES.CAPABILITIES,
        );
        expect(unauthenticated.status).toBe(401);
      } finally {
        await harness.close();
      }
    },
  );
});

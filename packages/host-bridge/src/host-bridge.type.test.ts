import { describe, expectTypeOf, it } from "vitest";

import type { HostCommand, HostContextSnapshot } from "./index.js";

describe("host bridge public types", () => {
  it("keep commands and context as protocol-safe public contracts", () => {
    expectTypeOf<HostCommand["commandName"]>().toEqualTypeOf<string>();
    expectTypeOf<HostContextSnapshot["metadata"]>().toMatchTypeOf<
      Record<string, unknown> | undefined
    >();
  });
});

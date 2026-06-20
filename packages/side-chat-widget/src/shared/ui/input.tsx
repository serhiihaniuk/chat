import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "#shared/lib/cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn("sc-field min-w-0 text-base", className)}
      {...props}
    />
  );
}

export { Input };

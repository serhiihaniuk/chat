import * as React from "react";

import { cn } from "#shared/lib/cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn("sc-field field-sizing-content min-h-16 resize-y text-base", className)}
      {...props}
    />
  );
}

export { Textarea };

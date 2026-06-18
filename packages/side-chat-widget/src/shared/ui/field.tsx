/**
 * §8.6 — Text & form (Field).
 *
 * Thin role wrapper over Base UI Field. The Label/Description/Error carry the
 * typographic roles; the Control owns the input/textarea chrome. Clicking the
 * Label focuses the Control automatically — Base UI wires the association, so we
 * never hand-write `htmlFor`/`id`. Validation surfaces through `Field.Error` and
 * the `invalid:` variant on the control.
 */
import { useState, type ReactElement } from "react";

import { Field } from "@base-ui/react/field";

import { cn } from "#shared/lib/cn";

const CONTROL_CLASS =
  "w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-md text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 invalid:border-destructive";

const LABEL_CLASS = "text-sm font-semibold text-foreground";
const DESCRIPTION_CLASS = "text-xs text-muted-foreground";
const ERROR_CLASS = "text-xs text-destructive";

export function FieldSection(): ReactElement {
  const [instructions, setInstructions] = useState("");
  const [bio, setBio] = useState(
    "Reply concisely and prefer bullet points when listing options.",
  );

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Single-line input */}
      <Field.Root className="flex flex-col gap-2">
        <Field.Label className={LABEL_CLASS}>Custom instructions</Field.Label>
        <Field.Control
          value={instructions}
          onValueChange={setInstructions}
          placeholder="e.g. Always answer in English"
          render={<input />}
          className={CONTROL_CLASS}
        />
      </Field.Root>

      {/* Multi-line textarea with description */}
      <Field.Root className="flex flex-col gap-2">
        <Field.Label className={LABEL_CLASS}>About you</Field.Label>
        <Field.Description className={DESCRIPTION_CLASS}>
          Shared with the model at the start of every conversation.
        </Field.Description>
        <Field.Control
          value={bio}
          onValueChange={setBio}
          render={<textarea rows={4} />}
          className={cn(CONTROL_CLASS, "resize-y")}
        />
      </Field.Root>

      {/* Invalid state — destructive border + error text */}
      <Field.Root
        invalid
        className="flex flex-col gap-2"
        data-slot="field-invalid-demo"
      >
        <Field.Label className={LABEL_CLASS}>Display name</Field.Label>
        <Field.Control
          defaultValue=""
          placeholder="Required"
          render={<input />}
          className={CONTROL_CLASS}
        />
        <Field.Error className={ERROR_CLASS} match>
          Display name is required.
        </Field.Error>
      </Field.Root>
    </div>
  );
}

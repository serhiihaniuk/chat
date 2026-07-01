/**
 * <CompositionRoot /> — a static map of the service composition root. The service wires itself
 * feature-first: composePartnerAiService calls each concern's factory in dependency order, every
 * concern folder owns its registry/builder plus that factory (mirroring adapters/, which owns the
 * implementations), and the bundles combine into the ServiceComposition the HTTP routes consume.
 * Mirrors apps/partner-ai-service/src/composition/. Update the concern list if a folder changes.
 */
import type { ReactElement } from "react";
import { ArrowDown } from "lucide-react";

const SPINE = "#8b5cf6";
const CONCERN = "#0d9488";

const CONCERNS = [
  "security",
  "persistence",
  "providers",
  "tools",
  "turn-profile",
  "capabilities",
  "context",
  "runtime",
  "ports",
  "diagnostics",
] as const;

function Connector({ label }: { readonly label?: string }): ReactElement {
  return (
    <div
      className="flex items-center justify-center gap-1.5 py-1.5 text-fd-muted-foreground"
      aria-hidden
    >
      {label ? <span className="text-2xs font-medium">{label}</span> : null}
      <ArrowDown className="size-3.5" />
    </div>
  );
}

export function CompositionRoot(): ReactElement {
  return (
    <figure
      role="group"
      aria-label="The service composition root, wired feature-first"
      className="not-prose my-6 overflow-hidden rounded-xl border border-fd-border bg-fd-card"
    >
      <div className="flex flex-col px-5 py-5">
        <div className="mx-auto w-full max-w-lg rounded-lg border border-fd-border bg-fd-muted/40 px-4 py-2.5 text-center">
          <div className="text-sm font-semibold text-fd-foreground">options</div>
          <div className="text-2xs text-fd-muted-foreground">deployment config in</div>
        </div>

        <Connector />

        <div
          className="mx-auto w-full max-w-lg rounded-lg border px-4 py-3 text-center"
          style={{ borderColor: `${SPINE}59` }}
        >
          <div className="font-mono text-sm font-semibold text-fd-foreground">
            composePartnerAiService()
          </div>
          <code className="text-2xs text-fd-primary">
            service-composition.ts · calls each concern's factory in dependency order
          </code>
        </div>

        <Connector label="wires, in order" />

        <div className="mx-auto w-full max-w-lg rounded-lg border border-dashed border-fd-border bg-fd-muted/30 px-4 py-3">
          <div className="mb-2 text-center text-2xs text-fd-muted-foreground">
            one folder per concern — registry/builder + its bundle factory · the wiring mirror of{" "}
            <code>adapters/</code>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {CONCERNS.map((concern) => (
              <span
                key={concern}
                className="rounded px-1.5 py-0.5 font-mono text-2xs font-medium"
                style={{ backgroundColor: `${CONCERN}1a`, color: CONCERN }}
              >
                {concern}
              </span>
            ))}
          </div>
        </div>

        <Connector label="produces" />

        <div
          className="mx-auto w-full max-w-lg rounded-lg border px-4 py-3 text-center"
          style={{ borderColor: `${SPINE}59` }}
        >
          <div className="font-mono text-sm font-semibold text-fd-foreground">ServiceComposition</div>
          <div className="text-2xs text-fd-muted-foreground">
            ports · turnRunner · dispatchers · diagnostics · shutdown
          </div>
        </div>

        <Connector label="handed to" />

        <div className="mx-auto w-full max-w-lg rounded-lg border border-fd-border bg-fd-muted/40 px-4 py-2.5 text-center">
          <div className="text-sm font-semibold text-fd-foreground">HTTP routes</div>
          <div className="text-2xs text-fd-muted-foreground">
            runs · turn-stream · activity · health · models
          </div>
        </div>
      </div>

      <figcaption className="border-t border-fd-border bg-fd-muted/30 px-5 py-2.5 text-2xs leading-relaxed text-fd-muted-foreground">
        The composition root reads top to bottom:{" "}
        <span className="font-medium text-fd-foreground">composePartnerAiService</span> calls each
        concern's factory in dependency order, every concern folder owns its registry/builder plus
        that factory, and the bundles combine into the{" "}
        <span className="font-medium text-fd-foreground">ServiceComposition</span> the HTTP routes
        consume.
      </figcaption>
    </figure>
  );
}

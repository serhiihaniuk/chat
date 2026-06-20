/**
 * <TokenTable group="switch" /> — renders one of the token groups from
 * app/data/tokens.ts (or an explicit `rows` array) as the Token / Resolves to /
 * Property / Usage table used throughout the spec.
 */
import { tokenGroups, type TokenRow } from "../data/tokens";

export interface TokenTableProps {
  group?: keyof typeof tokenGroups | (string & {});
  rows?: readonly TokenRow[];
}

export function TokenTable({ group, rows }: TokenTableProps) {
  const data = rows ?? (group ? tokenGroups[group] : undefined);
  if (!data || data.length === 0) return null;

  return (
    <div className="not-prose my-4 overflow-x-auto rounded-xl border border-fd-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-fd-muted/50 text-left text-xs font-medium uppercase tracking-wide text-fd-muted-foreground">
            <th className="px-3 py-2">Token</th>
            <th className="px-3 py-2">Resolves to</th>
            <th className="px-3 py-2">Property</th>
            <th className="px-3 py-2">Usage</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.token} className="border-t border-fd-border align-top">
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-fd-foreground">
                {row.token}
              </td>
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-fd-primary">
                {row.resolvesTo}
              </td>
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-fd-muted-foreground">
                {row.property}
              </td>
              <td className="px-3 py-2 text-fd-muted-foreground">{row.usage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

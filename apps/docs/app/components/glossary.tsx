/**
 * <Glossary /> — the complete vocabulary, grouped by category, rendered from
 * app/data/glossary.ts. Uses the same prose style as the rest of the docs: a
 * heading per category, then "**Term** — explanation" bullets. The page shows
 * the rich explanation (glossary-explanations.ts); the short `definition` is
 * reserved for the inline hover cards. Each term carries an `id` anchor so the
 * hover card's "Full vocabulary" link lands on the row.
 */
import { glossary } from "../data/glossary";
import { glossaryExplanations } from "../data/glossary/explanations";
import { glossaryCategories } from "../data/glossary/schema";

export function Glossary() {
  return (
    <div className="flex flex-col gap-8">
      {glossaryCategories.map((category) => {
        const terms = glossary.filter((entry) => entry.category === category.id);
        if (terms.length === 0) return null;

        return (
          <section key={category.id}>
            <h2 id={`category-${category.id}`} className="scroll-mt-24">
              {category.title}
            </h2>
            <p className="text-fd-muted-foreground">{category.blurb}</p>
            <ul>
              {terms.map((entry) => (
                <li key={entry.id} id={entry.id} className="scroll-mt-24">
                  <strong>{entry.term}</strong> — {glossaryExplanations[entry.id] ?? entry.definition}
                  {entry.code ? (
                    <span className="ml-1 font-mono text-xs text-fd-muted-foreground/60">{entry.code}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

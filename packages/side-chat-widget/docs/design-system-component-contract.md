# Widget Component Build Contract — Master

**Status:** authoritative. This document is _self-defining_: every name it relies on
(tokens, utilities, hook classes, `data-slot` values, state attributes, parts) is declared
**inside this document**. Treat the codebase as greenfield — there is no other file to
consult. If a name is not in here, it does not exist, and using it is a contract violation.

**Why it exists:** the widget is built by **one agent per component**, each seeing **only its
own file**. That only works if (a) the shared rules are identical in every file and (b) each
component's contract is complete on its own. This master is the source; the splitter
(§12) cuts it into `N` self-contained files, each = **Shared Preamble (Part A)** verbatim +
**that component's contract (Part B)**.

**Read order**

1. **§1 Doctrine** — the philosophy in one paragraph + the five hard gates.
2. **§2 Token system** — the three tiers, resolution order, the _one_ spacing system.
3. **§3 Root / theme / portal** — the runtime contract every popup obeys.
4. **§4 State contract** — Base UI `data-*`; the single biggest source of drift.
5. **§5 Registration ledger** — the allow-list the gates check against.
6. **§6 Hook-class registry** — the named escape hatch and its complete list.
7. **§7 Corrections** — bugs in the prior draft, fixed (read if migrating).
8. **§8 Primitive contracts** — one per primitive, fully worked.
9. **§9 Component contracts** — compositions.
10. **§10 Markdown / Streamdown contract.**
11. **§11 Dependency DAG.**
12. **§12 Per-file template + splitter instructions.**
13. **§13 TL;DR.**

---

# §1 — Doctrine

**One sentence:** _nothing visual is ever a literal in component code — every value flows
through a named token, reaches the element through a registered utility or a named hook
class, and every interactive state is keyed off a Base UI `data-_` attribute, never a CSS
pseudo-class.\*

This is not a style preference. It is what makes the widget **themeable** (flip one
attribute, the whole surface re-skins) and what makes **one-agent-per-component** safe (no
agent can invent a value that silently diverges from another agent's component).

## 1.1 — The five hard gates (a change fails review if ANY is true)

> Each gate is a mechanical check — a `grep` or a DOM assertion — not a judgement call.
> Strictness means: it either passes or it does not. No "looks fine."

| #      | Gate                            | Mechanical check                                                                                                                                                                             | Passes when                                                                                                                                                        |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **G1** | **No arbitrary values**         | `grep -nE '\[[0-9]\|\[var\(\|\[#\|\[rgb\|\[oklch' <component>`                                                                                                                               | returns nothing. `w-[248px]`, `text-[13px]`, `rounded-[13px]`, `bg-[var(--x)]`, `p-[12px]` are all banned.                                                         |
| **G2** | **No literal colors**           | `grep -nE '#[0-9a-f]{3,}\|rgb\(\|oklch\(\|hsl\(\|\b(zinc\|slate\|neutral\|gray\|stone)-[0-9]' <component>`                                                                                   | returns nothing. Color only ever arrives via a registered color utility (§5) or a token read by a hook class.                                                      |
| **G3** | **Every utility is registered** | each `bg-* / text-* / border-* / rounded-* / w-* / h-* / size-* / p*-* / m*-* / gap-* / shadow-* / font-* / leading-* / ease-*` token-utility resolves to a row in the §5 ledger             | unknown name → you must use a §6 hook class instead.                                                                                                               |
| **G4** | **State via named variants**    | every interactive style uses a registered `@custom-variant` from §4 (`highlighted:`, `checked:`, `popupopen:`…) — never a `:hover` on a Base UI part, never a `data-[...]` arbitrary variant | a bare `:hover` on a Base UI part, or any `data-[…]:`/`[&[data-…]]` bracket variant, is a defect. (`hover:` is allowed **only** on plain non-Base-UI `<button>`s.) |
| **G5** | **Popups portal into root**     | every `Portal` for Menu/Popover/Select/Combobox/Tooltip/Dialog/HoverCard passes `container={rootRef.current}`                                                                                | a popup mounted to bare `document.body` is a defect — it loses the theme + font.                                                                                   |

**Corollary gate (G6, structural):** every Base UI part required by a component's part-tree
(§8/§9) is present. A `Select` without a `Positioner`, a `Switch` without a `Thumb`, a menu
`Item` without its `ItemIndicator` where the contract lists one → defect.

## 1.2 — What "strict" buys you

- **Determinism:** two agents building two components reach pixel-identical spacing/colour
  because both resolved the same token, not their own guess.
- **One-knob theming:** the acceptance test (§12.3) — flip `--radius`, `--space-unit`, and
  `data-sidechat-theme` — passes only if no literal slipped through. The test _is_ the proof
  the gates held.
- **Reviewability:** a reviewer runs five greps, not a design critique.

---

# §2 — Token system

## 2.1 — Three tiers (and which tier a component may touch)

```
TIER 1 — @theme inline scales         (styles.css)   → GENERATE Tailwind utilities
   colour roles, radius, type, size, shadow, ease
   e.g. --color-primary, --radius-md, --text-sm, --size-sidebar, --shadow-popover
        ↓ referenced by
TIER 2 — :root component tokens        (styles.css)   → consumed ONLY via hook classes
   --row-*, --switch-*, --seg-*, --menu-*, --field-*, --scrollarea-*, --message-*, …
   each is an ALIAS of a tier-1 value or a calc() over --spacing; never a raw literal
        ↓ read by
TIER 3 — component code                (the .tsx)     → utilities + named state variants in JSX
   utilities for every value; `@custom-variant` (§4) for every state;
   a thin CSS layer (@utility/@apply) ONLY for the irreducible cases (§6);
   never declares a token, never holds a literal, never a data-[...] bracket
```

**The rule a component agent must internalise:**

- A component **may use** tier-1 utilities (because they are registered, §5) and its **own**
  tier-2 hook classes (§6).
- A component **may never** declare a tier-2 token another component owns, and **may never**
  invent raw arbitrary values in JSX. For declared state tokens, use Tailwind's
  custom-property shorthand (`bg-(--row-bg-hover)`) so the token contract stays visible.

## 2.2 — Token resolution order (mandatory precedence — stop at the first that exists)

For any visual value, resolve in this order and **stop**:

1. **The component's own tier-2 token** exists (`--row-px`) →
2. it is exposed as a **registered tier-1 utility** (§5) → use the utility (`rounded-md`,
   `bg-primary`, `text-sm`). **else**
3. it is **not** registered → use the component's **hook class** (§6) that reads the token in
   CSS (`.sc-row`). **else**
4. **stop.** Do not reach for a literal, do not invent a utility name, do not inline
   `[var(--x)]`. If you reached step 4, the token or its hook class is missing — that is a
   gap to fix in styles.css/§6, not in JSX.

## 2.3 — There is exactly ONE spacing system

> **Correction of a common error:** there is no discrete `--space-0…--space-16` scale.
> Inventing one is a contract violation.

- **Tier-1:** Tailwind's spacing multiplier `--spacing: 0.25rem`. Utilities `p-3`, `gap-2`,
  `px-3.5` multiply it (`p-3` = `0.75rem` = 12px).
- **Tier-2:** component padding/gap tokens are `calc(var(--spacing) * n)`
  (`--row-px: calc(var(--spacing) * 2.5)` = 10px).
- **Tier-3 JSX:** uses the multiplier utilities (`px-3`, `gap-2`) **or** a hook class that
  reads the tier-2 token. The two spellings resolve to the same pixels; pick by §2.2.

**Raw px is legal in exactly one place:** _inside a tier-2 token definition_, and only for
values that are genuinely sub-grid and not spacing — `--seg-pad: 3px`, `--switch-inset: 2px`,
`--badge-radius: 999px`, `--scrollarea-w: 0.5rem`. These are token-internal literals. The ban
in G1/G2 is on **literals and arbitrary utilities in component code**, never on the token
definitions themselves. An agent must not "fix" a token-internal `3px` into a utility.

## 2.4 — Type scale carries its own leading

Every `--text-*` ships paired with its line-height so vertical rhythm cannot drift between
components built by different agents:

```
--text-2xs: 0.6875rem;  --text-2xs--line-height: 1.4;
--text-xs:  0.75rem;    --text-xs--line-height: 1.45;
--text-sm:  0.8125rem;  --text-sm--line-height: 1.5;
--text-base:0.875rem;   --text-base--line-height: 1.55;
--text-md:  0.9375rem;  --text-md--line-height: 1.6;
--text-lg:  1.125rem;   --text-lg--line-height: 1.4;
--text-xl:  1.5rem;     --text-xl--line-height: 1.25;
```

Using `text-sm` applies the paired leading automatically. A component that needs a different
leading states it via a registered `leading-*` utility — never an arbitrary `leading-[1.7]`.

## 2.5 — Tailwind v4 styling model (how styling is actually written)

This is a **Tailwind v4, utility-first** codebase. Styling is expressed in this order:

1. **Utilities in JSX** for every static value — `rounded-md px-2.5 py-2 bg-popover
text-popover-foreground shadow-popover`. All of these resolve to §5 ledger rows.
2. **Named `@custom-variant`s for Base UI state** — `highlighted:bg-accent`,
   `checked:bg-primary`, `popupopen:bg-accent`. These are declared once in `styles.css`
   (§4) so JSX never needs a `data-[checked]:` **bracket** (which would trip G1). A hook class
   may own a state token when the value is calc-derived or token-only, such as Switch using
   `sc-switch-root` for `--switch-track-on` / `--switch-track-off`.
3. **A thin CSS layer — only for the irreducible cases utilities cannot express** (§6):
   a value derived with `calc()` (the switch thumb travel), a portaled element you don't
   render directly (`[data-slot="scroll-area-scrollbar"]`), a runtime var
   (`--transform-origin` on a popup). Write these with Tailwind v4 directives —
   `@utility name { @apply … ; /* token reads */ }` and `@custom-variant` — **never** a bare
   hand-authored `.sc-foo { … }` ruleset.

> So the default is **zero CSS per component**: utilities + variants in JSX. A component earns
> a CSS-layer entry only by appearing in the §6 irreducible list. If you are writing a
> `.sc-*` block for something already expressible as a utility, stop — that is a G3 smell.

```css
/* styles.css — Base UI state registered ONCE as bracket-free variants (used everywhere). */
@custom-variant highlighted (&[data-highlighted]); /* pointer OR keyboard active item */
@custom-variant selected    (&[data-selected]);
@custom-variant pressed     (&[data-pressed]);
@custom-variant checked     (&[data-checked]);
@custom-variant unchecked   (&[data-unchecked]);
@custom-variant popupopen   (&[data-popup-open]); /* trigger whose popup is open */
@custom-variant panelopen   (&[data-panel-open]); /* collapsible trigger */
@custom-variant uiopen      (&[data-open]); /* open popup/panel (avoid clashing `open:`) */
@custom-variant uidisabled  (&[data-disabled]); /* avoid clashing built-in `disabled:` */
@custom-variant invalid     (&[data-invalid]);
@custom-variant scrolling   (&[data-scrolling]);
@custom-variant hovering    (&[data-hovering]);
@custom-variant starting    (&[data-starting-style]);
@custom-variant ending      (&[data-ending-style]);
```

---

# §3 — Root, theme & portal contract _(Part A — verbatim in every file)_

## 3.1 — The widget root owns tokens and is the portal target

```tsx
function SideChatWidgetRoot({ theme, children }: { theme: ThemeName; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={rootRef}
      className="side-chat-widget-root"
      // Graphite is the base :root contract → NO attribute (stays responsive to host light/dark).
      // Named themes write the attribute, which re-skins this root AND every descendant.
      data-sidechat-theme={theme === "graphite" ? undefined : theme}
    >
      <PortalContainerContext.Provider value={rootRef}>{children}</PortalContainerContext.Provider>
    </div>
  );
}
```

- Tier-1/tier-2 tokens are declared on `.side-chat-widget-root` and the theme blocks
  (`[data-sidechat-theme="sage"]`, `…="ocean"`). Theming is pure inheritance — no JS recolour.
- **Graphite carries no attribute** so it tracks the host's `.dark`. Named themes are
  light-only by deliberate scope.

## 3.2 — Every popup portals into the root

Base UI portals Menu/Popover/Select/Combobox/Tooltip/Dialog/HoverCard to `document.body` by
default — _outside_ the token scope. Always pass the root as the container:

```tsx
const rootRef = use(PortalContainerContext);
<Menu.Portal container={rootRef.current}> … </Menu.Portal>;
```

The portaled popup roots also re-assert the widget font in `@layer base` (they live outside
`.side-chat-widget-root` in the DOM even when portaled into it):

```css
.side-chat-widget-root,
[data-slot="dropdown-menu-content"],
[data-slot="popover-content"],
[data-slot="hover-card-content"],
[data-slot="dialog-content"] {
  font-family: var(
    --font-widget,
    "Plus Jakarta Sans",
    ui-sans-serif,
    system-ui,
    -apple-system,
    sans-serif
  );
}
```

## 3.3 — Canonical `data-slot` names (the ONLY legal popup slot identifiers)

> A component may target a `[data-slot="…"]` selector **only** if it is in this table. New
> slot names are inventions and violate G3/G6.

| Surface                       | `data-slot`             |
| ----------------------------- | ----------------------- |
| Dropdown / context menu popup | `dropdown-menu-content` |
| Popover popup                 | `popover-content`       |
| Hover card popup              | `hover-card-content`    |
| Dialog popup                  | `dialog-content`        |
| Select popup                  | `select-content`        |
| Combobox popup                | `combobox-content`      |
| Tooltip popup                 | `tooltip-content`       |
| Scroll-area scrollbar         | `scroll-area-scrollbar` |

Tooltip and Dialog do **not** get their own colour palette — Tooltip popup inherits
`--menu-*`; Dialog popup inherits `--panel-*` (modal) or `--menu-*` (small). Do not introduce
a new palette inline.

---

# §4 — State contract _(Part A — verbatim in every file)_

Base UI exposes live state as `data-*` attributes on its parts. **Style state through the
registered named variants below, never off pseudo-classes and never via `data-[…]:` brackets**
(brackets trip G1). `highlighted` is the critical one: it is the active item under **both**
pointer hover and keyboard navigation — a raw `:hover` silently misses keyboard users and is
a G4 defect on a Base UI part.

| Meaning                                   | Attribute                                       | **Use this variant in JSX**           |
| ----------------------------------------- | ----------------------------------------------- | ------------------------------------- |
| Item active under pointer **or** keyboard | `[data-highlighted]`                            | `highlighted:`                        |
| Selected item (Select / Combobox / Tabs)  | `[data-selected]`                               | `selected:`                           |
| Pressed item (Toggle Group)               | `[data-pressed]`                                | `pressed:`                            |
| Switch / Checkbox on · off                | `[data-checked]` · `[data-unchecked]`           | `checked:` · `unchecked:`             |
| Trigger whose popup is open               | `[data-popup-open]`                             | `popupopen:`                          |
| Open popup / panel                        | `[data-open]`                                   | `uiopen:`                             |
| Enter · exit animation frames             | `[data-starting-style]` · `[data-ending-style]` | `starting:` · `ending:`               |
| Disabled                                  | `[data-disabled]`                               | `uidisabled:`                         |
| Field in error                            | `[data-invalid]`                                | `invalid:`                            |
| Scroll area being scrolled                | `[data-scrolling]`                              | `scrolling:`                          |
| Scrollbar hovered                         | `[data-hovering]`                               | `hovering:`                           |
| Collapsible open (on trigger)             | `[data-panel-open]`                             | `panelopen:`                          |
| Orientation                               | `[data-orientation]`                            | (CSS-layer rule, scrollbar/separator) |

The variant names are declared once (§2.5). Animate popups with `starting:`/`ending:` + the
popup's exposed `--transform-origin`; size them from the exposed `--available-height` /
`--anchor-width`. Never magic numbers, never JS timers for enter/exit.

---

# §5 — Registration ledger _(Part A — verbatim in every file)_

This is the **allow-list G3 checks against.** A `bg-* / text-* / rounded-* / size-* / shadow-*
/ ease-*` utility is part of the API **only if** its `@theme inline` alias is in this ledger.
If you cannot point to the row, the utility does not exist — use a hook class (§6).

> Maintainers: this ledger is generated from the real `@theme inline` block. When you add a
> tier-1 alias, add its row here in the same change, or the gate and reality diverge.

## 5.1 — Colour utilities (`bg-/text-/border-/ring-/fill-/stroke-…`)

```
--color-background          → bg-background / text-background
--color-foreground          → text-foreground
--color-card / -foreground  → bg-card / text-card-foreground
--color-popover / -foreground
--color-primary / -foreground
--color-secondary / -foreground
--color-muted / -foreground
--color-accent / -foreground
--color-destructive                       (NOTE: no -foreground registered — see §7.6)
--color-success
--color-sc-canvas
--color-border  --color-input  --color-ring
--color-sidebar / -foreground / -primary / -primary-foreground
       / -accent / -accent-foreground / -border / -ring
--color-message-user / -foreground         (= row-bg-active, fallback accent / foreground; see §7.2)
--color-chart-1 … --color-chart-5
```

## 5.2 — Radius

```
--radius-sm → rounded-sm   (calc(var(--radius) * 0.6))
--radius-md → rounded-md   (calc(var(--radius) * 0.8))
--radius-lg → rounded-lg   (var(--radius))
--radius-xl → rounded-xl   (calc(var(--radius) * 1.4))
```

## 5.3 — Type (with paired leading, §2.4)

```
--text-2xs … --text-xl     → text-2xs … text-xl
```

`--font-widget` is the widget-root typeface variable. It is not a utility; it scopes the
settings typeface choice to `.side-chat-widget-root` and its portaled popovers.

## 5.4 — Semantic sizes (`w-/h-/size-/min-/max-`)

```
--size-sidebar          → w-sidebar          (15.5rem  rail width)
--size-menu             → w-menu             (17.625rem dropdown width)
--size-measure-message  → max-w-measure-message (44.5rem reading column)
--size-measure-empty    → max-w-measure-empty   (28.25rem empty-state cluster)
--size-header           → h-header            (3.25rem header band == rail new-chat zone)
--size-control          → size-control        (2rem   icon-button hit box)
--size-touch            → size-touch          (2.75rem 44px min touch target)
```

## 5.5 — Elevation & motion

```
--shadow-card     → shadow-card
--shadow-popover  → shadow-popover
--shadow-panel    → shadow-panel
--ease-out        → ease-out
```

**Anything not above is unregistered.** Notable non-utilities (use a hook class): every
tier-2 component token (`--row-*`, `--switch-*`, `--seg-*`, `--menu-*`, `--field-*`,
`--scrollarea-*`, `--message-user-px/py`, `--reason-*`, `--settings-*`, `--suggestion-*`,
`--context-ring-*`, `--convo-indicator`). These are tier-2 by design and never generate
utilities.

---

# §6 — Irreducible CSS-layer registry _(Part A — verbatim in every file)_

The default is **zero CSS per component** — utilities + named variants in JSX (§2.5). A
component earns a CSS-layer entry **only** when a value cannot be expressed as a utility:
a `calc()`-derived value, a portaled element you don't render directly, or a runtime var.
These are written with Tailwind v4 directives (`@utility name { @apply … ; /* token reads */ }`,
`@custom-variant`) — **never** a bare hand-authored `.sc-foo { … }`. This table is the
**closed list** of what is allowed a CSS-layer rule; inventing one outside it is the same
violation as inventing a utility (G3).

| Component       | CSS-layer entry                                                        | Why it can't be a plain utility                     |
| --------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| Switch          | `@utility sc-switch-root`, `@utility sc-switch-thumb`                  | thumb travel is `calc(--switch-w − knob − 2·inset)` |
| Menu/Popover    | `[data-slot="dropdown-menu-content"]`, `[data-slot="popover-content"]` | portaled popup + `--transform-origin` enter/exit    |
| Select/Combobox | `[data-slot="select-content"]`, `[data-slot="combobox-content"]`       | portaled popup                                      |
| Scroll area     | `[data-slot="scroll-area-scrollbar"]` (+ `[data-orientation]`)         | portaled overlay scrollbar, unlayered               |
| Composer        | `@utility sc-composer-add` (rotate `+`→`×` on `popupopen`)             | icon `transform` on a Base UI trigger               |
| Context ring    | `@utility sc-context-ring`                                             | SVG `stroke` + `stroke-dasharray` from a runtime %  |
| Markdown        | `.sc-markdown` + `data-streamdown` child selectors                     | styles Streamdown's portaled/owned DOM              |

Everything else — Row, Media, Field, Button, Segmented, Tabs, Badge, Message bubble,
Reasoning, Settings, Shell — is **utilities + variants in JSX**, no CSS-layer entry. Tier-2
state tokens such as `--row-bg-hover` may appear through Tailwind's custom-property shorthand
(`bg-(--row-bg-hover)`), while component tokens that need structural CSS are read inside one
of the `@utility` entries above.

---

# §7 — Corrections (bugs in the prior draft — fix before splitting)

### 7.1 Switch thumb travel + the overloaded knob token

The thumb must travel by **knob width**, derived from inset + knob size — not the track
height. And the knob's _size_ needs its own token; do not overload the _fill_ token for it.

| Token                | Value                                                  | Role                                              |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `--switch-w`         | `1.875rem` (30)                                        | track width                                       |
| `--switch-h`         | `1.125rem` (18)                                        | track height                                      |
| `--switch-knob-size` | `0.875rem` (14)                                        | thumb diameter                                    |
| `--switch-inset`     | `2px`                                                  | thumb gap to track (token-internal literal, §2.3) |
| `--switch-knob-fill` | `oklch(0.99 0 0)` (light) / `var(--foreground)` (dark) | thumb fill                                        |
| `--switch-track-on`  | `var(--primary)`                                       | on track                                          |
| `--switch-track-off` | `var(--input)`                                         | off track                                         |

```css
.sc-switch-thumb {
  translate: 0;
  transition: translate var(--dur) var(--ease-out);
}
.sc-switch-root[data-checked] .sc-switch-thumb {
  translate: calc(var(--switch-w) - var(--switch-knob-size) - (2 * var(--switch-inset)));
}
/* 30 − 14 − 4 = 12px. The old formula (track-height based) yields 14px and clips the knob. */
```

### 7.2 `--message-user-*` has one source of truth

The user bubble is `var(--row-bg-active, var(--accent))` / `var(--foreground)`, surfaced as
the registered utilities `bg-message-user` / `text-message-user-foreground`. Do **not** map
it directly to `--sidebar-accent` or `--muted`, and do **not** ship two unrelated
definitions. Tier-2 `--message-user-px/py` (padding) remain hook-class-only.

### 7.3 A utility is real only if it is in the §5 ledger

Plausible-looking names (`text-message-user-size`, `font-row-title`, `w-rail`,
`rounded-panel`, `size-send`) exist **only** if their `@theme` alias is registered. Default
stance: _if you cannot point to the ledger row, use the hook class._ Inventing the name is a
G3 violation even when it looks obvious.

### 7.4 Component tokens are referenced, never re-declared

A component table may **alias** a global token (`--model-icon-bg: var(--media-fill)`) but may
not **redefine** a token another primitive owns (`--seg-bg`, `--row-bg-hover`). Every file
lists borrowed tokens under **Consumes (do not redefine)**.

### 7.5 Raw px in token _definitions_ is allowed; in component code it is not

`--seg-pad: 3px`, `--switch-inset: 2px`, `--badge-radius: 999px` are token-internal literals
and are correct (§2.3). The ban is on arbitrary-value utilities in JSX (`gap-[2px]`,
`rounded-[999px]`), never on the token bodies.

### 7.6 `destructive` has no registered foreground

Only `--color-destructive` is registered (§5.1) — there is **no** `text-destructive-foreground`
utility. The error component tints an icon by mixing destructive into muted
(`color-mix(in oklch, var(--destructive) 60%, var(--muted-foreground))` inside a hook class),
and uses `text-foreground`/`text-muted-foreground` for body copy. Do not invent the utility.

### 7.7 One spacing system, not two

Delete any reference to a discrete `--space-0…16` scale (§2.3). Component spacing tokens are
`calc(var(--spacing) * n)`. JSX spacing is the multiplier utilities. There is no second scale.

### 7.8 The chat log is not a ScrollArea

Only bounded panels (sidebar rail, settings body, long menus, model list) use Base UI
`ScrollArea`. The **chat log** uses native stick-to-bottom scrolling styled by the global thin
hover-revealed scrollbar rule (`scrollbar-width: thin` + `::-webkit-scrollbar` on
`.side-chat-widget-root *`). "Wrap every scroll region in ScrollArea" is wrong — it breaks
stick-to-bottom. State per component which scroll model it uses.

---

# §8 — Primitive contracts

Each primitive below is a complete §12 Part-B contract: **Owns · Consumes · Base UI · Parts ·
State · Hook classes · Behavior · Done**. Three are fully worked (Switch, Menu/Popover,
ScrollArea); the rest give the same fields in dense form. The splitter expands each into its
own file with the Part-A preamble prepended.

## 8.1 — Switch (Toggle primitive)

- **Build from:** Base UI `Switch`. **Use for:** booleans — Send-on-Enter, tool toggles.
- **Owns:** `--switch-w`, `--switch-h`, `--switch-knob-size`, `--switch-inset`,
  `--switch-knob-fill`, `--switch-track-on`, `--switch-track-off`.
- **Consumes (do not redefine):** `--primary`, `--input`, `--foreground`, `--ease-out`,
  `--dur`.
- **Base UI parts:** `Switch.Root` → `Switch.Thumb`. Wrap in `Field.Label` for the accessible
  name (no `htmlFor/id` plumbing).
- **State:** `[data-checked]` (on), `[data-unchecked]` (off), `[data-disabled]`.
- **Hook / CSS-layer:** `@utility sc-switch-root`, `@utility sc-switch-thumb` (§6) — the only
  CSS this primitive needs, because the thumb travel is a `calc()`.

```tsx
<Field.Label className="flex items-center justify-between gap-3">
  <span className="flex flex-col">
    <span className="text-sm font-semibold text-foreground">Send on Enter</span>
    <span className="text-xs text-muted-foreground">Shift+Enter inserts a newline</span>
  </span>
  <Switch.Root className="sc-switch-root">
    <Switch.Thumb className="sc-switch-thumb" />
  </Switch.Root>
</Field.Label>
```

```css
/* styles.css — irreducible CSS layer (Tailwind v4 @utility + @apply + token reads) */
@utility sc-switch-root {
  @apply relative shrink-0 cursor-pointer rounded-full border-0 transition-colors;
  width: var(--switch-w);
  height: var(--switch-h);
  padding: var(--switch-inset);
  background: var(--switch-track-off);
  &[data-checked] {
    background: var(--switch-track-on);
  }
  &[data-disabled] {
    opacity: 0.5;
    cursor: default;
  }
}
@utility sc-switch-thumb {
  @apply rounded-full;
  width: var(--switch-knob-size);
  height: var(--switch-knob-size);
  background: var(--switch-knob-fill);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.28);
  translate: 0;
  transition: translate var(--dur) var(--ease-out);
}
/* travel derived from inset + knob, never the track height. 30 − 14 − 4 = 12px. */
[data-checked] > .sc-switch-thumb {
  translate: calc(var(--switch-w) - var(--switch-knob-size) - (2 * var(--switch-inset)));
}
```

- **Behavior:** travel is derived (§7.1), not hand-tuned. State is `[data-checked]` (consumed
  via the `checked:` variant or the nested rule above), never `:checked` — the real input is
  visually hidden by Base UI.
- **Done:** ☐ G1–G6 ☐ travel = `calc()` ☐ on/off/disabled via `data-*` ☐ name via
  `Field.Label` ☐ re-skins under §12.3.

## 8.2 — Menu / Popover

- **Build from:** Base UI `Menu` (menuitem semantics + typeahead) or `Popover` (plain floating
  surface). **Use for:** composer **+** menu (attach / tools / context scope), conversation
  switcher (narrow), any floating panel.
- **Owns:** `--menu-bg`, `--menu-fg`, `--menu-border`, `--menu-radius`, `--menu-shadow`,
  `--menu-pad`, `--menu-item-radius`, `--menu-item-px`, `--menu-item-py`,
  `--menu-item-bg-hover`, `--menu-item-check`, `--menu-section-label`.
- **Consumes:** `--popover`, `--popover-foreground`, `--border`, `--accent`, `--primary`,
  `--shadow-popover`, `--radius-xl`, type roles.
- **Base UI parts:** `Menu.Root` → `Menu.Trigger` → `Menu.Portal`(container=root) →
  `Menu.Positioner` (`side`/`align`/`sideOffset`) → `Menu.Popup` →
  `Menu.Item` / `Menu.CheckboxItem` / `Menu.Separator` / `Menu.Group` + `Menu.GroupLabel`.
- **State:** trigger `[data-popup-open]`; popup `[data-open]` + `[data-starting-style]` /
  `[data-ending-style]`; item `[data-highlighted]`.
- **Styling:** popup = CSS-layer rule on `[data-slot="dropdown-menu-content"]` (portaled +
  `--transform-origin`); **items, separators and labels are plain utilities in JSX** with the
  `highlighted:` variant. No per-item hook class.

```tsx
<Menu.Root>
  <Menu.Trigger className="sc-icon-btn">{/* + */}</Menu.Trigger>
  <Menu.Portal container={rootRef.current}>
    <Menu.Positioner side="top" align="start" sideOffset={8}>
      <Menu.Popup data-slot="dropdown-menu-content">
        <Menu.Item className="rounded-md px-2.5 py-2 highlighted:bg-accent">Attach file</Menu.Item>
        <Menu.Separator className="my-1.5 h-px bg-border" />
        <Menu.Group>
          <Menu.GroupLabel className="px-2.5 pt-1.5 pb-1 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Tools
          </Menu.GroupLabel>
          <Menu.CheckboxItem
            className="flex items-center justify-between rounded-md px-2.5 py-2 highlighted:bg-accent"
            checked={web}
            onCheckedChange={setWeb}
          >
            Web search
            <Switch.Root className="sc-switch-root" tabIndex={-1}>
              <Switch.Thumb className="sc-switch-thumb" />
            </Switch.Root>
          </Menu.CheckboxItem>
        </Menu.Group>
      </Menu.Popup>
    </Menu.Positioner>
  </Menu.Portal>
</Menu.Root>
```

```css
/* styles.css — portaled popup (transform-origin + enter/exit can't be a utility) */
[data-slot="dropdown-menu-content"] {
  @apply rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-popover;
  transform-origin: var(--transform-origin);
  transition:
    opacity var(--dur) var(--ease-out),
    scale var(--dur) var(--ease-out);
  &[data-starting-style],
  &[data-ending-style] {
    opacity: 0;
    scale: 0.97;
  }
}
```

- **Behavior:** positioning, outside-click, Esc, focus return, roving focus, typeahead are all
  Base UI — delete any hand-rolled versions. Only one menu/popover open at a time (built in).
  Trigger rotates `+`→`×` via `[data-popup-open]` (`.sc-composer-add` in the Composer).
- **Done:** ☐ G1–G6 ☐ Portal container=root (G5) ☐ item hover = `[data-highlighted]` not
  `:hover` (G4) ☐ enter/exit animated via `data-*` + `--transform-origin` ☐ no custom
  outside-click/focus code.

## 8.3 — Scroll area

- **Build from:** Base UI `ScrollArea`. **Use for:** bounded panels only — sidebar rail,
  settings body, long menus, model list. **Not** the chat log (§7.8).
- **Owns:** `--scrollarea-w` (`0.5rem`), `--scrollarea-thumb` (`var(--border)`).
- **Base UI parts:** `ScrollArea.Root` → `ScrollArea.Viewport` → `ScrollArea.Scrollbar`
  (`orientation`) → `ScrollArea.Thumb`.
- **State:** scrollbar `[data-hovering]`, `[data-scrolling]`, `[data-orientation]`.
- **Hook:** `[data-slot="scroll-area-scrollbar"]` (§6). Overlay, unlayered so it beats
  Tailwind's utility layer.

```css
/* styles.css — portaled overlay scrollbar, unlayered so it beats Tailwind's utility layer */
[data-slot="scroll-area-scrollbar"] {
  opacity: 0;
  transition: opacity 200ms ease;
  &[data-hovering],
  &[data-scrolling] {
    opacity: 1;
  }
  &[data-orientation="vertical"] {
    width: var(--scrollarea-w);
  }
  &[data-orientation="horizontal"] {
    height: var(--scrollarea-w);
  }
}
```

- **Behavior:** overlay, no reflow; reveal on hover/scroll via `data-*`, no JS timer. Known
  quirk: overflow flags can flash on first paint before measure — accept one frame, don't
  special-case.
- **Done:** ☐ G1–G6 ☐ reveal via `data-hovering`/`data-scrolling` ☐ not used for the chat log.

## 8.4 — Row

- **Build from:** the styled content of `Menu.Item` / `Select.Item` / `Combobox.Item`, **or** a
  plain `<button>` when standalone (conversation item). **Use for:** every selectable line —
  conversation, model, menu, settings-nav. This is the single most reused primitive.
- **Owns:** nothing new — Row is pure utilities. (Surface colours come from tier-1 roles.)
- **Consumes:** `--row-bg-hover`, `--row-bg-active`, `--foreground`, `--muted-foreground`,
  `--primary`, `--row-radius`, `--row-px`, `--row-py`, `--row-gap`, type roles.
- **Base UI parts:** none of its own — it is the `className` you put on the parent's `Item`,
  or a bare `<button>`. Anatomy (slots): `[leading media?] [title + optional subtitle] [trailing
check/indicator?]`.
- **State:** `highlighted:` (inside a Menu/Select/Combobox — pointer **or** keyboard) **or**
  `aria-current="true"` (standalone conversation row). Selected check via `selected:`.

```tsx
{
  /* A) as a menu/select/combobox item — state via highlighted: */
}
<Select.Item
  value={m}
  className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md
                                   text-left highlighted:bg-(--row-bg-hover)"
>
  <Avatar className="sc-media" /> {/* optional leading media */}
  <span className="flex min-w-0 flex-col">
    <span className="truncate text-sm font-medium text-foreground">{m.name}</span>
    <span className="truncate text-xs text-muted-foreground">{m.desc}</span>
  </span>
  <Select.ItemIndicator className="ml-auto opacity-0 selected:opacity-100 text-primary">
    <CheckIcon />
  </Select.ItemIndicator>
</Select.Item>;

{
  /* B) as a standalone conversation row — state via aria-current */
}
<button
  aria-current={id === activeId || undefined}
  className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-left
             hover:bg-(--row-bg-hover) aria-[current=true]:bg-(--row-bg-active)"
>
  <span className="flex min-w-0 flex-col">
    <span className="truncate text-sm font-medium text-foreground">{title}</span>
    <span className="truncate text-xs text-muted-foreground">{when}</span>
  </span>
  <span className="ml-auto size-1.5 rounded-full bg-primary opacity-0 aria-[current=true]:opacity-100" />
</button>;
```

- **Behavior:** the title MUST truncate — that requires `min-w-0` on the flex child **and**
  `truncate` on the text, or the row pushes the panel wider. The trailing indicator is always
  present in the DOM at `opacity-0` and only revealed by state, so rows don't reflow when
  selection moves. Leading media is optional (model rows have it, menu items usually don't).
- **Easy to miss:** conversation, model and menu rows are the SAME primitive with the shared
  row state tokens (`--row-bg-hover` / `--row-bg-active`) — do not write three different row
  components. `aria-current` is semantic (screen readers announce it); do
  not fake the active state with a class alone.
- **Done:** ☐ G1–G6 ☐ title `min-w-0 truncate` ☐ active via `highlighted:`/`aria-current`, not
  `:hover` alone on a Base UI item ☐ indicator pre-rendered at `opacity-0` ☐ re-skins (§12.3).

## 8.5 — Media (avatar)

- **Build from:** a plain `<span>`/`<img>` wrapper. **Use for:** model icon, agent mark, any
  fixed-size leading graphic in a Row.
- **Owns:** `--media-size` (`1.625rem`), `--media-radius` (`var(--radius-md)`), `--media-fill`
  (`var(--muted)`), `--media-border` (`var(--border)`), `--media-fg` (`var(--muted-foreground)`).
- **CSS-layer:** `@utility sc-media` (size + token reads; the rest of the visual is the
  consumer's). Single-sourcing the size here is the whole point — change one token, every
  avatar in every row resizes.

```css
@utility sc-media {
  @apply flex shrink-0 items-center justify-center overflow-hidden;
  width: var(--media-size);
  height: var(--media-size);
  border-radius: var(--media-radius);
  background: var(--media-fill);
  border: 1px solid var(--media-border);
  color: var(--media-fg);
}
```

- **Behavior:** always a fixed square; centers a glyph or 1–2 initials; an `<img>` fills via
  `object-cover`. Never sets a colour outside its tokens.
- **Done:** ☐ size from `--media-size` only (no per-call width) ☐ G1–G6 ☐ re-skins (§12.3).

## 8.6 — Text & form (Field)

- **Build from:** Base UI `Field` + `Input`/`Textarea`. **Use for:** every labelled control —
  composer textarea, all Settings fields. It carries the type roles for labels/hints.
- **Owns:** `--field-bg`, `--field-border`, `--field-radius`, `--field-px`, `--field-py`; the
  type roles `--title-*`, `--label-*`, `--hint-*`, `--group-label-*` (each registered as a
  `text-*`/`font-*` where it needs a utility).
- **Consumes:** `--background`, `--input`, `--ring`, `--destructive`, `--radius-xl`, type scale.
- **Base UI parts:** `Field.Root` → `Field.Label` + `Field.Description` + `Field.Control`
  (`render={<input/>}` or `render={<textarea/>}`) + `Field.Error`.
- **State:** control `:focus-visible` (ring); root/control `invalid:` → destructive border;
  `uidisabled:` → dim.

```tsx
<Field.Root className="flex flex-col gap-1.5">
  <Field.Label className="text-sm font-semibold text-foreground">Custom instructions</Field.Label>
  <Field.Description className="text-xs text-muted-foreground">
    Prepended to every system prompt.
  </Field.Description>
  <Field.Control
    render={<textarea rows={4} />}
    placeholder="You are a concise assistant…"
    className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-md
               text-foreground outline-none resize-y
               focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30
               invalid:border-destructive"
  />
  <Field.Error className="text-xs text-destructive" />
</Field.Root>
```

- **Behavior:** clicking the Label focuses the Control automatically — Base UI wires the
  association, so never hand-write `htmlFor`/`id`. The composer textarea is the same
  `Field.Control render={<textarea/>}` with the autosize handler attached. Validation surfaces
  through `Field.Error` + the `invalid:` variant; do not roll your own error text node.
- **Easy to miss:** the focus ring belongs on the control here, but on the _shell_ in the
  Composer (`:focus-within`, §9). `text-destructive` exists; `text-destructive-foreground` does
  **not** (§7.6).
- **Done:** ☐ G1–G6 ☐ label/hint via the type roles ☐ focus ring on control ☐ error via
  `Field.Error` + `invalid:` ☐ no manual `htmlFor` ☐ re-skins (§12.3).

## 8.7 — Button

- **Build from:** Base UI `Button` (for `render` composition / disabled semantics) or a plain
  `<button>`. **Use for:** all actions — primary CTA, secondary, ghost icon+label, icon-only.
- **Owns:** nothing for the text variants (pure tier-1 utilities). Icon button: `@utility
sc-icon-btn` (it needs `--size-control` and the `popupopen:` reaction).
- **Consumes:** `--primary`, `--primary-foreground`, `--card`, `--border`, `--accent`,
  `--muted-foreground`, `--ring`, `--radius-md`, `--size-control`.
- **State:** `:focus-visible` (allowed — a plain `<button>` is not a Base UI part); icon button
  also reacts to `popupopen:` (it is a Menu/Popover trigger).

```tsx
{/* text variants — pure utilities */}
<button className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2
                   text-sm font-medium bg-primary text-primary-foreground
                   focus-visible:outline-2 focus-visible:outline-ring">Send feedback</button>
<button className="… bg-secondary text-secondary-foreground border border-border hover:bg-accent">
  Cancel
</button>
<button className="… bg-transparent text-muted-foreground hover:bg-accent">Retry</button>

{/* icon button — used as a Menu/Tooltip trigger */}
<button className="sc-icon-btn"><GearIcon /></button>
```

```css
@utility sc-icon-btn {
  @apply inline-flex items-center justify-center rounded-md border-0 bg-transparent
         text-muted-foreground cursor-pointer hover:bg-accent;
  width: var(--size-control);
  height: var(--size-control);
  &[data-popup-open] {
    background: var(--accent);
  } /* stays lit while its menu is open */
}
```

- **Behavior:** the primary↔secondary↔ghost choice is variant utilities, never new colours.
  An icon button used as a trigger stays highlighted while its popup is open via `popupopen:`.
- **Easy to miss:** `hover:` is legal here because these are plain buttons, not Base UI items —
  on a `Menu.Item` you must use `highlighted:` instead (G4).
- **Done:** ☐ G1–G6 ☐ variants are tier-1 utilities only ☐ icon-button size from
  `--size-control` ☐ trigger lit via `popupopen:` ☐ re-skins (§12.3).

## 8.8 — Segmented (Toggle Group)

- **Build from:** Base UI `ToggleGroup` + `Toggle`, single-select (value is a **1-item array**).
  **Use for:** thinking level, Settings Corners / Density switchers. **Not** for tab+panel
  navigation (that is Tabs, §8.9) and **not** for >3 or long options (use Select/Combobox).
- **Owns:** `--seg-pad` (`3px`, token-internal literal), `--seg-radius` (`var(--radius-md)`),
  `--seg-item-radius` (`calc(var(--radius-md) - 3px)`). Colours are tier-1.
- **CSS-layer:** `@utility sc-seg` (track — the only place the `3px` inset lives). Items are
  utilities in JSX with the `pressed:` variant.
- **Base UI parts:** `ToggleGroup` (`value`/`onValueChange`) → `Toggle` × n.
- **State:** active item `pressed:`.

```tsx
<ToggleGroup value={[level]} onValueChange={(v) => v[0] && setLevel(v[0])} className="sc-seg">
  {LEVELS.map((l) => (
    <Toggle
      key={l.id}
      value={l.id}
      aria-label={l.label}
      className="flex-1 flex items-center justify-center gap-1.5 rounded-sm px-1.5 py-1.5
                 text-xs font-medium text-muted-foreground cursor-pointer
                 pressed:bg-background pressed:text-foreground pressed:shadow-card"
    >
      <l.Icon /> {l.label}
    </Toggle>
  ))}
</ToggleGroup>
```

```css
@utility sc-seg {
  @apply flex bg-muted;
  border-radius: var(--seg-radius);
  gap: var(--seg-pad);
  padding: var(--seg-pad);
}
```

- **Behavior:** exactly one active at a time; items share width via `flex-1`; selecting is
  instant; roving-tabindex keyboard nav is automatic. Active needs fill **+** shadow, not
  colour alone.
- **Easy to miss:** it is single-select (radio), not multi; the `value` is an array because
  ToggleGroup supports multi — pass/read index `[0]`.
- **Done:** ☐ G1–G6 ☐ active via `pressed:` (fill+shadow) ☐ ≤3 short options ☐ track inset is
  the only literal, in `sc-seg` ☐ re-skins (§12.3).

## 8.9 — Tabs

- **Build from:** Base UI `Tabs`. **Use for:** the Settings group navigator (wide layout) and
  any real tab→panel relationship. Distinct from Segmented: Tabs owns **panels**.
- **Consumes:** `--sidebar-accent`, `--foreground`, `--muted-foreground`, `--radius-md`.
- **Base UI parts:** `Tabs.Root` (`value`/`onValueChange`) → `Tabs.List` → `Tabs.Tab` × n;
  `Tabs.Panel` × n (siblings of List, keyed by the same values).
- **State:** active tab `selected:`.

```tsx
<Tabs.Root value={group} onValueChange={setGroup} className="flex gap-4">
  <Tabs.List className="flex flex-col gap-1 w-44 shrink-0">
    {GROUPS.map((g) => (
      <Tabs.Tab
        key={g.id}
        value={g.id}
        className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-sm
                   text-muted-foreground cursor-pointer hover:bg-accent
                   selected:bg-sidebar-accent selected:text-foreground"
      >
        <g.Icon /> {g.label}
      </Tabs.Tab>
    ))}
  </Tabs.List>
  {GROUPS.map((g) => (
    <Tabs.Panel key={g.id} value={g.id} className="flex-1 min-w-0">
      {g.render()}
    </Tabs.Panel>
  ))}
</Tabs.Root>
```

- **Behavior:** one `GROUPS` array drives both the List and the Panels — adding a group appears
  in both automatically. Keep `Tabs.Root` mounted in the narrow layout too (§9 Settings) and
  swap only the `Tabs.List` for a Select bound to the same `value`.
- **Easy to miss:** tabs select panels; if there is no panel relationship you want Segmented.
- **Done:** ☐ G1–G6 ☐ active via `selected:` ☐ one source array for tabs+panels ☐ re-skins.

## 8.10 — Select

- **Build from:** Base UI `Select`. **Use for:** a non-searchable dropdown — the Default-model
  field in Settings. If a search field is present, it is a **Combobox** (§8.11), never a Select.
- **Consumes:** `--menu-*` family via the `select-content` slot (shared with Menu), `--accent`,
  `--primary`, type roles, `--radius-md`.
- **Base UI parts:** `Select.Root` (`items`/`value`/`onValueChange`) → `Select.Trigger`
  (`Select.Value` + `Select.Icon`) → `Select.Portal`(container=root) → `Select.Positioner` →
  `Select.Popup` → `Select.List` → `Select.Item` (`Select.ItemText` + `Select.ItemIndicator`).
- **State:** item `highlighted:` (active) + `selected:` (chosen → check shown).
- **CSS-layer:** `[data-slot="select-content"]` (portaled popup; same recipe as the menu popup).

```tsx
<Select.Root items={MODELS} value={model} onValueChange={setModel}>
  <Select.Trigger className="sc-icon-btn w-full justify-between px-3 rounded-xl border border-input">
    <Select.Value />
    <Select.Icon>
      <CaretIcon />
    </Select.Icon>
  </Select.Trigger>
  <Select.Portal container={rootRef.current}>
    <Select.Positioner sideOffset={6}>
      <Select.Popup data-slot="select-content">
        <Select.List>
          {MODELS.map((m) => (
            <Select.Item
              key={m.id}
              value={m}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-md highlighted:bg-accent"
            >
              <Select.ItemText>{m.name}</Select.ItemText>
              <Select.ItemIndicator className="ml-auto opacity-0 selected:opacity-100 text-primary">
                <CheckIcon />
              </Select.ItemIndicator>
            </Select.Item>
          ))}
        </Select.List>
      </Select.Popup>
    </Select.Positioner>
  </Select.Portal>
</Select.Root>
```

- **Behavior:** typeahead is built in; the popup aligns the selected item to the trigger by
  default (`alignItemWithTrigger`) — disable if you want a plain anchored dropdown.
- **Done:** ☐ G1–G6 ☐ Portal→root (G5) ☐ item active `highlighted:`, chosen `selected:` ☐ no
  search field (else Combobox) ☐ re-skins.

## 8.11 — Combobox

- **Build from:** Base UI `Combobox`. **Use for:** the **searchable** model selector — the only
  primitive with a filter input. Filtering, highlight, and empty-state are built in.
- **Consumes:** `--menu-*` via `combobox-content`, Row + Media (rows), `--accent`, `--primary`.
- **CSS-layer:** `[data-slot="combobox-content"]` (portaled popup), `@utility sc-combo-empty`.
- **Base UI parts:** `Combobox.Root` (`items`/`value`/`onValueChange`) → `Combobox.Trigger`
  (`Combobox.Value`) → `Combobox.Portal` → `Combobox.Positioner` → `Combobox.Popup`
  (`Combobox.Input` + `Combobox.Empty` + `Combobox.List` → `Combobox.Item` +
  `Combobox.ItemIndicator`).
- **State:** matched item `highlighted:`; chosen `selected:`.

```tsx
<Combobox.Root items={MODELS} value={model} onValueChange={setModel}>
  <Combobox.Trigger className="sc-icon-btn px-2 gap-1.5">
    <Combobox.Value />
    <CaretIcon />
  </Combobox.Trigger>
  <Combobox.Portal container={rootRef.current}>
    <Combobox.Positioner side="top" align="end" sideOffset={8}>
      <Combobox.Popup data-slot="combobox-content">
        <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border">
          <SearchIcon className="text-muted-foreground" />
          <Combobox.Input
            placeholder="Search models…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Combobox.Empty className="sc-combo-empty">No models found.</Combobox.Empty>
        <Combobox.List className="max-h-64 overflow-auto p-1">
          {(m) => (
            <Combobox.Item
              key={m.id}
              value={m}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-md highlighted:bg-accent"
            >
              <span className="sc-media">{m.icon}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{m.name}</span>
                <span className="truncate text-xs text-muted-foreground">{m.desc}</span>
              </span>
              <Combobox.ItemIndicator className="ml-auto opacity-0 selected:opacity-100 text-primary">
                <CheckIcon />
              </Combobox.ItemIndicator>
            </Combobox.Item>
          )}
        </Combobox.List>
        <div className="border-t border-border p-2">
          {/* thinking-level Segmented — independent state */}
        </div>
      </Combobox.Popup>
    </Combobox.Positioner>
  </Combobox.Portal>
</Combobox.Root>
```

```css
@utility sc-combo-empty {
  @apply px-2.5 py-6 text-center text-sm text-muted-foreground;
}
```

- **Behavior:** the built-in fuzzy filter sets `highlighted:` on the match — no manual query
  state. Model and thinking are **two independent selections** sharing one popup; the footer
  Segmented writes its own state.
- **Done:** ☐ G1–G6 ☐ Portal→root ☐ filter + `Combobox.Empty` used (no hand-rolled empty) ☐
  rows reuse Row + Media ☐ re-skins.

## 8.12 — Badge & suggestion

- **Build from:** plain markup (no Base UI). **Status pill:** non-interactive `<span>`.
  **Suggestion:** an interactive `<button>` (the Row primitive in pill form).
- **Owns:** `--badge-radius` (`999px`, token-internal literal); colours are tier-1.
- **State:** suggestion is a plain button → `hover:` is allowed (not a Base UI part).

```tsx
{
  /* status pill — non-interactive */
}
<span
  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted
                 px-2 py-0.5 text-2xs font-semibold text-muted-foreground"
>
  Beta
</span>;

{
  /* suggestion — interactive */
}
<button
  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card
                   px-3 py-1.5 text-sm text-foreground hover:bg-accent"
>
  Summarize this page
</button>;
```

- **Easy to miss:** a status pill must NOT be a button (no hover/﻿focus affordance); a
  suggestion must be a real button (keyboard-focusable). Don't merge them.
- **Done:** ☐ G1–G6 ☐ pill non-interactive, suggestion a `<button>` ☐ re-skins.

## 8.13 — Tooltip

- **Build from:** Base UI `Tooltip`. **Use for:** header icon-button labels (Settings / New
  chat / Close). Replaces the native `title` attribute.
- **Consumes:** `--menu-*` via the `tooltip-content` slot (no dedicated palette, §3.3).
- **Base UI parts:** `Tooltip.Provider` (shared delay, near root) → `Tooltip.Root` →
  `Tooltip.Trigger` (`render={<button class="sc-icon-btn"/>}`) → `Tooltip.Portal`(container=root)
  → `Tooltip.Positioner` → `Tooltip.Popup`.
- **State:** popup `starting:`/`ending:` for fade.

```tsx
<Tooltip.Provider delay={500}>
  <Tooltip.Root>
    <Tooltip.Trigger
      render={
        <button className="sc-icon-btn" aria-label="Settings">
          <GearIcon />
        </button>
      }
    />
    <Tooltip.Portal container={rootRef.current}>
      <Tooltip.Positioner sideOffset={6}>
        <Tooltip.Popup
          data-slot="tooltip-content"
          className="rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground border border-border shadow-popover
                     starting:opacity-0 ending:opacity-0"
        >
          Settings
        </Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
```

- **Behavior:** one `Tooltip.Provider` near the root sets a shared open delay; every icon button
  that lacks a visible label needs a tooltip + `aria-label`.
- **Done:** ☐ G1–G6 ☐ Portal→root ☐ `aria-label` on the trigger ☐ replaces native `title`.

## 8.14 — Separator

- **Build from:** Base UI `Separator` (`role="separator"` + orientation). **Use for:** menu
  dividers and section rules — instead of a bare `<div>`.
- **State:** none. **Styling:** utilities in JSX.

```tsx
<Separator orientation="horizontal" className="my-1.5 h-px bg-border" />
```

- **Easy to miss:** prefer this over a styled `<div>` so assistive tech announces the boundary.
- **Done:** ☐ G1–G6 ☐ semantic `Separator`, not a `<div>`.

## 8.15 — Collapsible

- **Build from:** Base UI `Collapsible`. **Use for:** the reasoning fold (§9). Owns the
  open/close + height animation contract.
- **Consumes:** `--border`, `--muted-foreground`, `--dur`, `--ease-out`.
- **Base UI parts:** `Collapsible.Root` (`open`/`onOpenChange`) → `Collapsible.Trigger` →
  `Collapsible.Panel`.
- **State:** trigger `panelopen:` (rotate chevron); panel height via the exposed
  `--collapsible-panel-height`.

```tsx
<Collapsible.Root open={open} onOpenChange={setOpen}>
  <Collapsible.Trigger className="flex items-center gap-2 text-sm text-muted-foreground">
    <BrainIcon />
    <span>{label}</span>
    <ChevronIcon className="transition-transform panelopen:rotate-180" />
  </Collapsible.Trigger>
  <Collapsible.Panel className="sc-collapsible-panel">{children}</Collapsible.Panel>
</Collapsible.Root>
```

```css
@utility sc-collapsible-panel {
  @apply overflow-hidden border-l-2 border-border;
  height: var(--collapsible-panel-height); /* exposed by Base UI */
  transition: height var(--dur) var(--ease-out);
}
```

- **Behavior:** height animates from Base UI's exposed var — never a JS `scrollHeight` measure.
  Controlled `open` lets the Reasoning component auto-collapse when the answer starts.
- **Done:** ☐ G1–G6 ☐ height via `--collapsible-panel-height` ☐ chevron via `panelopen:` ☐
  controlled `open` ☐ re-skins.

---

# §9 — Component contracts (compositions)

Each composition reuses primitives (§8) and adds only its own glue. Same field order as §8.

## 9.1 — Conversation item

- **Built from:** Row (standalone `<button>` form) + Text roles.
- **Owns:** `--convo-item-radius`, `--convo-indicator`, `--convo-title-fg`,
  `--convo-subtitle-fg`, and `--convo-item-bg-*` aliases to the shared row active/hover surfaces.
- **Base UI parts:** none — a plain `<button>` (the Row primitive).
- **State:** `aria-current="true"` → `--convo-item-bg-active` fill + trailing dot;
  hover → `--convo-item-bg-hover`. Both alias the shared row accent surface.
- **Scroll:** lives inside the rail's `ScrollArea` (§8.3), never its own scroller.

```tsx
<button
  aria-current={id === activeId || undefined}
  className="flex items-center gap-(--row-gap) w-full px-(--row-px) py-(--row-py)
             rounded-(--convo-item-radius) text-left
             hover:bg-(--convo-item-bg-hover)
             aria-[current=true]:bg-(--convo-item-bg-active)"
>
  <span className="flex min-w-0 flex-col">
    <span className="truncate text-sm font-medium text-(--convo-title-fg)">{title}</span>
    <span className="truncate text-xs text-(--convo-subtitle-fg)">{relativeTime(updatedAt)}</span>
  </span>
  <span className="ml-auto size-1.5 rounded-full bg-(--convo-indicator) opacity-0 aria-[current=true]:opacity-100" />
</button>
```

- **Behavior:** title truncates (`min-w-0 truncate`); subtitle is a relative timestamp. The
  active dot is pre-rendered at `opacity-0` so rows don't reflow on selection.
- **Done:** ☐ G1–G6 ☐ active via `aria-current` ☐ truncation ☐ inside rail ScrollArea ☐ re-skins.

## 9.2 — Conversation grouping

- **Built from:** Conversation item (§9.1) + an overline heading.
- **Owns:** `--group-label-*` (size/colour for the overline), `--rail-group-gap`
  (`calc(var(--spacing) * 4)`).
- **Base UI parts:** none — `<section>` per bucket.
- **Behavior:** bucket conversations by last-activity into **Recent · This week · Older**;
  **omit empty buckets**; newest-first within a bucket; `--rail-group-gap` between buckets.

```tsx
<div className="flex flex-col" style={{ gap: "var(--rail-group-gap)" }}>
  {buckets.map((b) =>
    b.items.length ? (
      <section key={b.id} className="flex flex-col gap-0.5">
        <div className="px-2.5 pt-1.5 pb-1 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          {b.label}
        </div>
        {b.items.map((c) => (
          <ConversationItem key={c.id} {...c} />
        ))}
      </section>
    ) : null,
  )}
</div>
```

- **Easy to miss:** bucketing is by `updatedAt`, not creation; an empty bucket renders nothing
  (no empty heading). The list scrolls **under** the fixed New-chat zone (§9.12).
- **Done:** ☐ G1–G6 ☐ empty buckets omitted ☐ newest-first ☐ overline = `--group-label-*` ☐ re-skins.

## 9.3 — Tools menu

- **Built from:** Menu (§8.2) + Switch (§8.1) + Row + Separator. **No new surface tokens** —
  reuse `--menu-*`, `--switch-*`.
- **Base UI parts:** `Menu.Root`/`Trigger`(the `+` icon button)/`Portal`/`Positioner`/`Popup`
  with `Menu.Item` (attach), `Menu.CheckboxItem` + Switch (tool toggles), `Menu.Group` +
  `Menu.GroupLabel` (Context scope), `Menu.Separator`.
- **State:** trigger `popupopen:` (the `+`→`×` rotate lives in the Composer, §9.5);
  items `highlighted:`; checkbox `checked:`.
- **Behavior:** a composition only — every row is an existing primitive. One popover open at a
  time (Base UI). Tool rows carry a Switch; context-scope rows carry a check (`ItemIndicator`).
- **Done:** ☐ G1–G6 ☐ Portal→root ☐ no new tokens ☐ items `highlighted:`, toggles `checked:` ☐ re-skins.

## 9.4 — Model selector

- **Built from:** Combobox (§8.11) + Row + Media + Segmented (§8.8, thinking level).
- **Base UI parts:** the §8.11 tree; the popup footer holds a `ToggleGroup` for thinking.
- **State:** model row `highlighted:`/`selected:`; thinking `pressed:`.
- **Behavior:** the search field filters model rows (`highlighted:` on the match); the thinking
  level is an **independent** ToggleGroup whose state is separate from the model; the popover
  footer always echoes the live `model + thinking` selection. Two decisions, one popup.
- **Easy to miss:** it is a **Combobox, not a Select** (it filters). Model and thinking never
  share state.
- **Done:** ☐ G1–G6 ☐ Combobox (filter) not Select ☐ two independent selections ☐ footer echoes
  both ☐ re-skins.

## 9.5 — Composer

- **Built from:** Field textarea (§8.6) + Menu (tools `+`, §9.3) + Combobox (model, §9.4) +
  Segmented + a send button.
- **Owns:** `--send-*` (idle/armed surfaces are tier-1; the token is only if you tune it).
- **CSS-layer:** `@utility sc-composer` (focus ring on the **shell** via `:focus-within`),
  `@utility sc-composer-add` (rotate `+`→`×` on `popupopen:`), `@utility sc-send` (armed state).
- **State:** shell `:focus-within`; add-button `popupopen:`; send `data-armed` (your state).

```tsx
<div className="sc-composer">
  <Field.Control
    render={<textarea rows={1} />}
    className="w-full resize-none bg-transparent
    px-3.5 py-3 text-md outline-none placeholder:text-muted-foreground"
    onKeyDown={(e) => {
      if (e.key === "Enter" && !e.shiftKey && sendOnEnter) {
        e.preventDefault();
        send();
      }
    }}
  />
  <div className="flex items-center gap-1.5 px-2 pb-2">
    <ToolsMenu /> {/* + Menu, sc-composer-add on its trigger */}
    <ContextRing pct={pct} /> {/* decorative meta, sc-context-ring */}
    <div className="ml-auto flex items-center gap-1.5">
      <ModelCombobox />
      <button className="sc-send" data-armed={armed || undefined} onClick={send}>
        <ArrowUpIcon />
      </button>
    </div>
  </div>
</div>
```

```css
@utility sc-composer {
  @apply flex flex-col rounded-xl border border-input bg-background shadow-card;
  &:focus-within {
    border-color: var(--ring);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 30%, transparent);
  }
}
@utility sc-composer-add {
  @apply sc-icon-btn;
  & svg {
    transition: transform var(--dur) var(--ease-out);
  }
  &[data-popup-open] svg {
    transform: rotate(45deg);
  }
} /* + → × */
@utility sc-send {
  @apply inline-flex size-8 items-center justify-center rounded-md border-0 bg-muted text-muted-foreground;
  transition: background var(--dur) var(--ease-out);
  &[data-armed] {
    @apply bg-primary text-primary-foreground cursor-pointer;
  }
}
```

- **Behavior:** the focus ring is on the **shell** (`:focus-within`), not the raw textarea.
  Send is one button that swaps idle (`bg-muted`) ↔ armed (`bg-primary`) by your `data-armed`
  state — never two buttons. Enter sends / Shift+Enter newlines **only when** send-on-enter is
  on. The context % ring is decorative meta (`sc-context-ring`, SVG stroke), not a control.
- **Done:** ☐ G1–G6 ☐ ring on shell `:focus-within` ☐ send arm via `data-armed` (one button) ☐
  `+`→`×` via `popupopen:` ☐ re-skins.

## 9.6 — Message

- **Built from:** Text roles + (assistant) Markdown (§10).
- **Owns:** `--message-user-px/py` (bubble padding, hook-read). Consumes
  `bg-message-user` / `text-message-user-foreground` (§7.2).
- **Base UI parts:** none — semantic `<div data-from>`.
- **State:** `data-from="user|assistant"` selects the layout.

```tsx
<div data-from={role} className="data-[from=user]:flex data-[from=user]:justify-end">
  {role === "user" ? (
    <div
      className="w-fit rounded-lg rounded-br-sm bg-message-user text-message-user-foreground
                    px-3.5 py-2.5 text-md leading-message"
      style={{ maxWidth: "82%" }}
    >
      {text}
    </div>
  ) : (
    <div className="sc-markdown max-w-measure-message text-md">
      <MarkdownContent>{md}</MarkdownContent>
    </div>
  )}
</div>
```

- **Behavior:** user = right-aligned bubble with one squared tail corner (`rounded-lg` +
  `rounded-br-sm`), `bg-message-user`. Assistant = full-measure left, **no bubble**, markdown.
  The user bubble caps at 82% via inline style; the assistant caps at `max-w-measure-message`.
- **Easy to miss:** assistant content is markdown (§10), never plain text; the squared tail is a
  single corner override, not a different radius everywhere.
- **Done:** ☐ G1–G6 ☐ user bubble + one squared corner ☐ assistant via MarkdownContent ☐ both
  capped at measure ☐ re-skins.

## 9.7 — Message actions

- **Built from:** ghost Buttons (§8.7).
- **CSS-layer:** `@utility sc-action` (the `data-copied` success swap).
- **State:** `data-copied` (your transient state) flips Copy → “Copied”.
- **Behavior:** ghost icon+label buttons under a **completed** answer; Copy flips to a success
  “Copied” for ~1.3s on the **same** button, then reverts. Retry re-runs the turn.

```tsx
<div className="flex items-center gap-1">
  <button className="sc-action" data-copied={copied || undefined} onClick={onCopy}>
    {copied ? (
      <>
        <CheckIcon /> Copied
      </>
    ) : (
      <>
        <CopyIcon /> Copy
      </>
    )}
  </button>
  <button className="sc-action" onClick={onRetry}>
    <RetryIcon /> Retry
  </button>
</div>
```

```css
@utility sc-action {
  @apply inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground
         bg-transparent hover:bg-accent cursor-pointer;
  &[data-copied] {
    @apply text-success;
  }
}
```

- **Easy to miss:** “Copied” is a transient STATE on the same button, not a second button; the
  row only appears on finished answers.
- **Done:** ☐ G1–G6 ☐ Copied is a state swap ☐ only on completed answers ☐ re-skins.

## 9.8 — Reasoning

- **Built from:** Collapsible (§8.15) + Tool rows (§9.9) + (optional) ScrollArea.
- **State:** trigger `panelopen:`; header label shimmer while streaming.
- **Behavior:** thoughts and tool rows are siblings **inside** the `Collapsible.Panel`,
  interleaved in **stream order** — never a block below the answer. Each tool row goes spinner →
  success check. Auto-collapse by flipping the controlled `open` to `false` when the answer
  begins; it stays user-toggleable. Header label shimmers while thinking; panel height animates
  via `--collapsible-panel-height` (no JS measure).
- **Easy to miss:** sequential interleave INSIDE the foldable is the whole point; do not render
  tools in a separate block. Auto-collapse must not lock the toggle.
- **Done:** ☐ G1–G6 ☐ thoughts+tools interleaved inside Panel ☐ auto-collapse on answer, still
  toggleable ☐ height via exposed var ☐ re-skins.

## 9.9 — Tool row

- **Built from:** Badge (§8.12) + a spinner.
- **Owns:** `--tool-*` (only if tuned; colours are tier-1).
- **State:** `data-state="running|success|error"` → spinner → check / alert.
- **Behavior:** a compact line inside the Reasoning panel: tool name + status glyph; spinner
  while running, success check when done; mirrors the badge surface.
- **Done:** ☐ G1–G6 ☐ running→success glyph swap ☐ lives inside Reasoning Panel ☐ re-skins.

## 9.10 — Error

- **Built from:** a secondary Button (Try again, §8.7).
- **CSS-layer:** `@utility sc-error-glyph` (the destructive-into-muted tint, §7.6).
- **Behavior:** muted surface + alert glyph + message + a secondary “Try again” that re-runs
  the **same** turn (the user’s message is preserved). Not a full-red panel.

```tsx
<div className="flex items-start gap-3 rounded-lg border border-border bg-muted p-3">
  <AlertIcon className="sc-error-glyph" />
  <div className="flex-1 min-w-0">
    <p className="text-sm text-foreground">Something went wrong.</p>
    <Button variant="secondary" size="sm" className="mt-2" onClick={retry}>
      Try again
    </Button>
  </div>
</div>
```

```css
@utility sc-error-glyph {
  color: color-mix(in oklch, var(--destructive) 60%, var(--muted-foreground));
}
```

- **Easy to miss:** there is **no** `text-destructive-foreground` (§7.6) — tint the glyph with
  `color-mix`. Retry preserves and re-runs the same user turn.
- **Done:** ☐ G1–G6 ☐ glyph via `color-mix` (no phantom utility) ☐ retry re-runs same turn ☐ re-skins.

## 9.11 — Settings (responsive)

- **Built from:** Tabs ↔ Select (one group state) + Field + Switch + Segmented + ScrollArea.
- **Owns:** `--settings-*` (nav width, gaps).
- **Base UI parts:** `Tabs.Root` stays mounted in **both** layouts; **wide** renders
  `Tabs.List` as a left rail, **narrow** swaps it for a `Select` bound to the same `value`;
  `Tabs.Panel` per group is identical in both.
- **State:** tab `selected:`; field/switch/segmented per their primitives.

```tsx
<Tabs.Root value={group} onValueChange={setGroup} className="flex gap-4">
  {wide ? (
    <Tabs.List className="flex flex-col gap-1 w-44 shrink-0">
      {GROUPS.map((g) => (
        <Tabs.Tab key={g.id} value={g.id} className="… selected:bg-sidebar-accent">
          {g.label}
        </Tabs.Tab>
      ))}
    </Tabs.List>
  ) : (
    <Select.Root value={group} onValueChange={setGroup}>
      {/* same state, narrow */}…
    </Select.Root>
  )}
  {GROUPS.map((g) => (
    <Tabs.Panel key={g.id} value={g.id} className="flex-1 min-w-0">
      {g.render()}
    </Tabs.Panel>
  ))}
</Tabs.Root>
```

- **Behavior:** both navigators render from ONE `GROUPS` array and write the same `group` state
  → content never forks. Groups: **Theme** (swatch cards via `data-sidechat-theme-preview`),
  accent swatches, corners, density, text size, typeface, elevation; **General** (Custom
  instructions Field, Send-on-Enter Switch, Default-model Select). The
  settings body scrolls via `ScrollArea`. The narrow layout is the wide layout with the nav
  collapsed to a Select — not a different screen.
- **Easy to miss:** keep `Tabs.Root` mounted in narrow (it owns the panels); only the navigator
  swaps. Adding a group = one array entry, appears in both layouts.
- **Done:** ☐ G1–G6 ☐ one `GROUPS` array drives both navigators ☐ panels never forked ☐
  appearance controls mutate root tokens ☐ body = ScrollArea ☐ re-skins.

## 9.12 — Shell · Rail · Header (the alignment contract)

- **Built from:** every primitive/component above, including Button (§8.7) for the rail
  "New chat" control.
- **Owns:** `--panel-*`, `--header-h` (= `--size-header`), `--rail-newchat-h` (= `--header-h`),
  `--rail-group-gap`.
- **CSS-layer:** `@utility sc-panel`, `@utility sc-header`, `@utility sc-rail`,
  `@utility sc-rail-newchat` (layout + `--header-h` reads).
- **Scroll:** rail = `ScrollArea`; **chat log = native stick-to-bottom** (§7.8), never a ScrollArea.
- **New chat:** `sc-rail-newchat` is only the alignment zone. The visible control inside it
  is the shared `Button` primitive with `variant="secondary"`: fill `--secondary`, text
  `--secondary-foreground`, border `--border`, hover `--accent`, focus `--ring`.

**The alignment contract — 4 numbered rules (this is where AIs drift):**

1. **Both columns reserve one `--header-h` top band.** The rail's New-chat zone height
   (`--rail-newchat-h`) **equals** `--header-h`, so “New chat” and the header title sit on the
   exact same Y across the seam.
2. **The divider is continuous at `y = --header-h`** across both columns — one line, not two
   offset borders.
3. **The rail has no header of its own.** Below the breakpoint the rail hides and the header’s
   conversation **Menu** switcher returns (same conversation list, different shell).
4. **The panel anchors bottom-right,** clipped by `--radius-xl`, max size = `viewport − 32px`;
   it never docks full-bleed.

```css
@utility sc-panel {
  @apply absolute bottom-4 right-4 flex flex-col overflow-hidden rounded-xl border border-border
         bg-card shadow-panel;
  max-width: calc(100% - 2rem);
  max-height: calc(100% - 2rem);
}
@utility sc-header {
  @apply flex items-center justify-between shrink-0 border-b border-border box-border;
  height: var(--header-h);
  padding-inline: var(--header-px);
}
@utility sc-rail {
  @apply flex flex-col shrink-0 bg-sidebar text-sidebar-foreground border-r;
  border-color: var(--rail-border);
  width: var(--size-sidebar);
}
@utility sc-rail-newchat {
  @apply flex items-center shrink-0 box-border;
  height: var(--rail-newchat-h);
  padding-inline: var(--header-px);
}
```

- **Easy to miss:** rules 1–2 are the “blue alignment” AIs get wrong — both come from the
  single `--header-h` token shared by header and rail New-chat zone. Do not style the New-chat
  control as a bespoke rail row; use Button secondary. The chat log must NOT be a ScrollArea or
  stick-to-bottom breaks (§7.8).
- **Done:** ☐ G1–G6 ☐ `--rail-newchat-h == --header-h` ☐ continuous divider at `--header-h` ☐
  rail hides → header Menu switcher under breakpoint ☐ chat log native scroll ☐ re-skins.

---

# §10 — Markdown / Streamdown contract

- **Do not parse Markdown.** Streamdown owns parsing, GFM, sanitization,
  link safety, and incomplete-stream repair.
- **One wrapper:** `MarkdownContent` (`#shared/ai/markdown-content.tsx`). Every assistant
  message renders through it — never raw `<Streamdown>`. All customization lives here.
- **Props:** `mode` (`"streaming"` live / `"static"` history — gates repair) and
  children. The wrapper keeps `dir="auto"` and enables incomplete Markdown repair only for
  live streams.
- **Styling = tokens first, then `data-streamdown` selectors** (no one-off colour):
  inline code → `bg-muted` + `border-border` + `text-sm`; links → `text-primary underline
underline-offset-2`; tables keep `overflow-x-auto`; fenced blocks stay inside Streamdown's
  DOM contract.
- **`components` override is last resort** (different DOM contract only). Three traps:
  `inlineCode ≠ code` (overriding `code` also hits fenced blocks); a replaced `table` must keep
  the overflow container + header-cell scope; a replaced `a` must preserve safe external-link
  behavior.
- **Showcase = regression test:** one page rendering every primitive + rich wrapper, across
  desktop/mobile × light/dark/sage/ocean, with streaming/incomplete fixtures (half-written
  fence/table → repair, no reflow). Driven by the same `MarkdownContent`.

---

# §11 — Dependency DAG (what an agent may assume already exists)

```
foundations: styles.css (tier-1 @theme + tier-2 :root) + §3 root/portal
  └─ primitives (own their tokens):
       Row · Media · Field/Text · Button · Switch · Segmented · Tabs ·
       Menu/Popover · Select · Combobox · ScrollArea · Badge · Tooltip ·
       Separator · Collapsible
          └─ Conversation item, Suggestion            ← consume Row
          └─ Tools menu                               ← Menu + Switch + Row + Separator
          └─ Model selector                           ← Combobox + Row + Media + Segmented
          └─ Composer                                 ← Field + Menu + Combobox + Segmented + send
          └─ Message · Message actions · Markdown
          └─ Reasoning · Tool                         ← Collapsible + Tool
          └─ Settings                                 ← Tabs/Select + Field + Switch + Segmented + ScrollArea
          └─ Shell · Rail · Grouping · Error          ← compose everything above
```

Each component agent receives: **its own file** + **read-only token tables of everything it
Consumes**. It must never edit a consumed primitive's tokens. Build order = top of the DAG
down; a component may assume every node above it exists.

---

# §12 — Per-file template + splitter instructions

## 12.1 — The split

`N` files, one per component. Each = **Part A (this doc's §1–§6, verbatim, identical in every
file)** + **Part B (that component's §8/§9 contract)** + **§12.3 acceptance test**. A file is
correct only if an agent who has never seen another file can build the component from it alone.

## 12.2 — Per-file skeleton

```
# <Component> — Build Contract

## PART A — Shared preamble (verbatim, identical in every file)
A1. Doctrine + the five hard gates           (§1)
A2. Token system + resolution order + one-spacing  (§2)
A3. Root / theme / portal + canonical data-slot names  (§3)
A4. State contract (full data-* table)        (§4)
A5. Registration ledger (the utility allow-list)  (§5)
A6. Hook-class registry (full table)          (§6)

## PART B — This component
B1. Build from / Use for
B2. Owns            — tokens defined here (table: Token | Value | CSS prop | Part)
B3. Consumes (do not redefine) — borrowed tokens + their owner
B4. Base UI parts   — the exact part tree
B5. State           — the exact data-* selectors used
B6. Hook classes    — the exact CSS to ship (from §6)
B7. Behavior        — prose: truncation, overlay-not-reflow, armed/idle, alignment, scroll model
B8. Definition of done (below)

## PART C — Acceptance test (verbatim, §12.3)
```

## 12.3 — Acceptance test (verbatim in every file)

> In devtools, set `--radius: 0` then `--radius: 1rem`, set `--space-unit: 0.1875rem` then
> `--space-unit: 0.3125rem`, and swap `data-sidechat-theme` between unset / `sage` / `ocean` on
> `.side-chat-widget-root`. The component must re-skin **completely** with zero leftovers. Any
> element that does not move still holds a hardcoded value — that is the bug. Then run the five
> gate greps (§1.1) over the component file; all must return empty.

## 12.4 — Definition of done (component-scoped, in every Part B)

```
[ ] G1 no arbitrary values        [ ] G4 state via data-* (list them)
[ ] G2 no literal colours         [ ] G5 popups portal into root container
[ ] G3 every utility in ledger    [ ] G6 every required Base UI part present
[ ] every class traced to a ledger row (§5) or a hook class (§6)
[ ] no token redefined that another component owns (§7.4)
[ ] declares its scroll model (ScrollArea vs native, §7.8)
[ ] passes the §12.3 re-skin test
[ ] matches the standalone showcase for this component visually
```

---

# §13 — TL;DR for the splitter

1. **Fix the bugs first (§7):** switch travel + knob-size token (7.1), single message-user
   source (7.2), utility over-promise (7.3), no token re-declaration (7.4), no `destructive-
foreground` (7.6), **one** spacing system (7.7), chat log ≠ ScrollArea (7.8).
2. **Generate the ledger (§5) from the real `@theme inline` block** — it is the allow-list G3
   checks. Keep ledger and `@theme` in sync in the same change.
3. **Prepend Part A (§1–§6) verbatim to every per-component file**; fill Part B from §8/§9. A
   file is correct only if it is buildable in isolation.
4. **Ship the five gates (§1.1) and the acceptance test (§12.3) in every file.** Strictness is
   a `grep` and a re-skin test that either pass or fail — never a vibe.

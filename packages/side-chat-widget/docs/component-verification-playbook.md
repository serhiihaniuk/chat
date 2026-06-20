# Component Verification Playbook — HANDOFF

**Read this before you touch any Side Chat widget component.** The components in
`src/shared/ui/**` were built greenfield from a contract, but several were built by
**approximation** — a developer eyeballed the rendered look and reached for a "close
enough" Tailwind utility instead of the **exact token the design documents**. That is
the #1 source of bugs here. Your job is to make every component match the design
**exactly, token for token** — not "looks about right."

---

## 1. The three sources of truth (and what each one is FOR)

### A. `design_widget.html` (repo root) — THE PRIMARY SPEC. Read it first, every time.

This is a single bundled HTML page that renders the **entire finished design**. It is
not just a picture — it is written **for you, the AI**. It contains, for every component:

1. **The exact rendered markup** with **inline styles**, e.g.

   ```html
   <div
     style="display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;
        background:var(--secondary);color:var(--secondary-foreground);border:1px solid var(--border);
        padding:var(--row-py) var(--row-px);border-radius:var(--radius-md);
        font-size:var(--convo-title-size);font-weight:var(--convo-title-weight);"
   >
     …New chat
   </div>
   ```

   This tells you **precisely** which token drives every property. The New-chat button
   uses the shared secondary Button: `background: --secondary` (= muted), `border: --border`,
   `hover: --accent`, `focus: --ring`, `radius: --radius-md`, **no shadow**. If you build it with
   `bg-card shadow-card rounded-lg`, you are wrong — full stop.

2. **Token documentation tables** — JS objects of the form

   ```js
   {t:'--tool-label-fg', v:'var(--foreground)', p:'color', c:'Tool name color'}
   ```

   `t` = token name, `v` = what it resolves to, `p` = the CSS property it drives,
   `c` = a human description of what it controls. **These tables are the authoritative
   list of every component's tokens and exact values.**

3. **Descriptive prose** explaining how each component looks and behaves. This text is
   instructions for you, not decoration. Read it.

> **The design HTML is the source of truth for how a component LOOKS and which tokens
> it uses. When in doubt, it wins.**

### B. `docs/design-system-component-contract.md` — ADDITIONAL info.

The §8 (primitives) / §9 (compositions) contract. Use it for: the Base UI **part tree**
(which parts are required — gate G6), **behavior** rules (truncation, stick-to-bottom,
portal-into-root), and **the five gates (§1.1)**. It is the _contract_; the HTML is the
_pixel + token truth_. Where they appear to conflict, the HTML's concrete values win for
appearance, but the gates always apply.

### C. `src/styles.css` — the implementation. It must MATCH the design's token table.

Every tier-2 token here must resolve to **exactly** the value the design's token table
says. If the design says `--rail-group-gap: var(--space-2)` (8px) and styles.css has
`calc(var(--spacing) * 4)` (16px), that's a bug — fix styles.css.
(Note: the design uses a `--space-N` scale; this codebase forbids that discrete scale
(MD §2.3/§7.7) and uses `calc(var(--spacing) * N)` instead. `--space-2` ≡
`calc(var(--spacing) * 2)` ≡ 8px. Match the **value**, not the spelling.)

---

## 2. The golden rule

**Nothing is "close enough."** Every colour, size, radius, padding, shadow, font-size,
and font-weight in a component must trace to the **specific token the design documents
for that component**. If the design says a value comes from `--convo-title-fg`
(= sidebar-foreground), you may NOT use `text-foreground` because it "looks similar" —
they differ under themes and the design chose sidebar-foreground deliberately.

---

## 3. Procedure: when a component looks wrong (or before you trust it)

**Order matters:** verify the component statically against `design_widget.html`
and the matching MD section first. Extract the token table, markup, part tree,
and gates before opening the running page. Use DOM measurement only when the
HTML + MD reconciliation is not enough to prove a layout, alignment, or runtime
state claim.

1. **Find it in `design_widget.html`.** Grep for its visible text, its token prefix
   (`--tool-`, `--convo-`, `--agent-mark-`, `--rail-`, `--seg-item-`, `--model-`, …),
   or a label you can see ("New chat", "Workspace Assistant", "Thought for").
2. **Extract its exact markup + its token table** (techniques in §4). Write down every
   property → token → resolved-value for that component.
3. **Read its `§` in the MD contract** for the part tree, behavior, and gates.
4. **Diff three ways:**
   - Do all of that component's tokens **exist in `styles.css`** and **resolve to the
     documented value**? If missing or wrong → fix `styles.css`.
   - Does the component's `.tsx` use those tokens with Tailwind v4's token model, or did
     it substitute an approximation? Fix it.
   - Is every required Base UI part present (G6)?
5. **For layout / alignment / size complaints: MEASURE, don't eyeball** (§7).
6. **Fix tokens first, then markup.** A drifted value is usually one wrong token, not
   ten wrong utilities.
7. **Verify in the harness preview** (`vite` on :5173, the showcase): reload, screenshot,
   re-measure, and run the §12.3 re-skin test (swap `data-sidechat-theme` graphite/sage/
   ocean + scrub `--radius`) — everything must re-skin with zero leftovers.

---

## 4. Reading `design_widget.html` (it's bundled — use these techniques)

- It is **one giant escaped line**. Unescape first: `/` → `/`, `\"` → `"`.
- **Token tables:** list every documented token with
  ```bash
  grep -aoE "\{t:'--[^']+',\s*v:'[^']+'" design_widget.html | sed "s/{t:'//; s/',[[:space:]]*v:'/  =  /" | sort -u
  ```
- **Token CSS definitions:** `grep -aoE "\-\-<prefix>[a-z-]*:[^;]+" design_widget.html | sort -u`
- **A component's markup** (greedy grep on a huge line is slow — use node to slice around
  the anchor):
  ```bash
  node -e 'const s=require("fs").readFileSync("design_widget.html","utf8").replace(/\\u002F/g,"/").replace(/\\"/g,String.fromCharCode(34));
  const i=s.indexOf("New chat"); console.log((s.slice(i-1500,i+12).match(/<[a-z]+ [^>]*>/g)||[]).slice(-6).join("\n----\n"));'
  ```

---

## 5. Tailwind v4 token consumption

Do **not** add a custom `@utility` just to consume a component token. Tailwind v4 is
CSS-first:

- `@theme` variables generate Tailwind utility APIs only when they are top-level and use
  Tailwind namespaces such as `--color-*`, `--spacing-*`, `--radius-*`, `--shadow-*`,
  `--text-*`, or `--font-weight-*`.
- Component semantic tokens such as `--settings-*`, `--convo-*`, `--agent-mark-*`, and
  `--tool-*` are ordinary CSS variables. They should live in the widget/theme scope and
  resolve to the exact design value.
- To use one of those variables in JSX, prefer Tailwind v4's parenthesized CSS-variable
  value syntax on the standard utility: `w-(--settings-nav-w)`,
  `bg-(--settings-nav-bg)`, `border-(--settings-nav-border)`,
  `rounded-(--settings-item-radius)`, `px-(--settings-item-px)`,
  `py-(--settings-item-py)`, `text-(--settings-label-fg)`.
- Use `@utility` only when Tailwind has no existing utility shape for the property or
  when the style needs selector/nesting behavior that cannot be expressed by normal
  utilities and variants.

The old Tailwind v3 shorthand `bg-[--token]` is not the v4 form. In v4, variable
arbitrary values use parentheses, e.g. `bg-(--brand-color)`.

---

## 6. The running page — the live showcase (this is where you verify)

**There is always a running dev server, and you verify against it — not against your
imagination.** The widget harness (`test-harness/widget-harness/`) runs Vite and renders
a **showcase page** that mounts EVERY §8/§9 component, each in its own demo section,
inside the themed widget root.

- **What renders it:** `src/showcase/showcase.tsx` (the page + toolbar) pulls every
  section from `src/showcase/showcase-sections.tsx` (one `<XxxSection/>` per component).
  The harness entry `test-harness/widget-harness/src/config/browser.ts` mounts it.
- **URL:** http://127.0.0.1:5173 . Launch config: `.claude/launch.json` → server name
  **`widget-harness`**.
- **Start it with the preview tooling** (`preview_start`, name `widget-harness`) — never
  `npm`/Bash for the server. If port 5173 is held by a **stale Vite**, stop that process
  and restart under preview management so the `preview_*` tools can attach.
- **The toolbar has live re-skin controls**: Graphite/Sage/Ocean theme, Light/Dark, and a
  `--radius` slider. That IS the §12.3 acceptance test — flip them and confirm the
  component re-skins completely with zero leftovers.

**How to drive it (`preview_*` tools):**

- `preview_screenshot` — layout/appearance only (do NOT trust it for exact colours or px).
- `preview_snapshot` — the a11y tree: text, roles, structure.
- `preview_eval` — read state and **MEASURE**: `getBoundingClientRect()`,
  `getComputedStyle(el)`, read CSS vars (`cs.getPropertyValue('--token')`). This is how
  you prove an exact size/colour/alignment.
- `preview_click` (CSS selector) — to open Base UI popups (Menu/Select/Combobox/Tooltip).
  **Base UI ignores synthetic `.click()` / dispatched events (they're untrusted), so a
  popup will NOT open from `preview_eval` — you must use the real-click tool.**
- `preview_console_logs` / `preview_logs` — runtime errors and Vite build/transform errors.

**Gotchas that will waste your time if you don't know them:**

- The harness Vite **root is the harness dir**, so widget files are served at
  `/@fs/<abs>/packages/side-chat-widget/src/…`, **not** `/src/…`.
- Each section is wrapped in an **error boundary** — a crashing component renders a
  "Render error in `<id>`" card instead of blanking the page. Scan for those after a change.
- **Tailwind v4 JIT only emits a class/`@utility` when it appears in scanned source.** A
  hook class or token utility you just added won't compute until a component actually USES
  it — don't conclude "my CSS is broken" from probing an unused class.
- State updates are async: if you click a control then read state in the _same_
  `preview_eval`, you read the pre-render value. Read in a follow-up call, or after a
  short delay, and let CSS transitions (~200ms `--dur`) settle before measuring colours.

---

## 7. Alignment & size: measure in the DOM, never conclude from a screenshot

Screenshots lie about a few px and about center-vs-top alignment. Use the preview eval to
read `getBoundingClientRect()` and compare **midY** (vertical centers), heights, and
widths. Example finding from this project: the rail "New chat" button _looked_ "too high",
but measuring showed `railZone.midY === newChatBtn.midY === header.midY === 915` — it was
perfectly center-aligned; it only sat higher because the button element is taller than the
title. **Measure first; it stops you "fixing" things that are already correct** (and
proves the ones that aren't).

---

## 8. Common drift patterns (all seen + fixed in this project)

| Component                 | Drift (wrong, by approximation)                         | Correct (per design token table)                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context ring (§9.5)       | `size-control` (32px), `--primary` stroke               | 18px (`viewBox 0 0 18 18`, r 6.5, stroke 2.4), `--context-ring-indicator` = **muted-foreground**                                                                                   |
| Tool row (§9.9)           | tool name in a muted **Badge** + wrench, glyph on right | **no pill/wrench**; glyph LEFT; name plain text `--tool-label-fg` (foreground), `--tool-label-size`; spinner `--tool-running-fg` (primary), check `--tool-done-fg` (success)       |
| Model selector (§9.4)     | horizontal thinking seg; auto-width popup (reflowed)    | **vertical/stacked** seg (icon over label); fixed **`--size-menu`** width; THINKING header echoes selected level desc; "● Using {model} · {level} thinking" footer                 |
| New-chat button (§9.12)   | `bg-card`, `shadow-card`, `rounded-lg`                  | shared Button primitive, `variant="secondary"`: `--secondary` -> `--muted`, `border --border`, hover `--accent`, focus `--ring`, `radius-md`, **no shadow**, **primary** plus icon |
| Agent mark (§9.12)        | `sc-media` (26px, muted bg), no center node             | dedicated `--agent-mark-*` tile (27px, **accent** bg), hollow diamond **+ center node** `<circle r=1.7>`                                                                           |
| Header title (§9.12)      | `text-sm`                                               | `--header-title-size` = **text-md**                                                                                                                                                |
| Rail group gap (§9.2)     | 16px                                                    | `--rail-group-gap` = **8px**                                                                                                                                                       |
| Conversation title (§9.1) | `text-foreground`, `hover:bg-accent`                    | `--convo-title-fg` = **sidebar-foreground**, `--convo-item-bg-hover` = `--row-bg-hover` -> **accent**                                                                              |

The pattern is always the same: a real, named token existed in the design; the build used
a plausible-but-different utility. **Trust the token table, not your eye.**

---

## 9. The gates still apply (MD §1.1)

G1 no arbitrary `[..]` values · G2 no literal colours · G3 only registered utilities ·
G4 Base UI state via named variants (`highlighted:`/`checked:`…), never `:hover`/`data-[..]`
on a Base UI part · G5 popups `container={usePortalContainer()}` · G6 all required parts.
When the design's exact value isn't a registered utility (e.g. 18px, 27px), put it in a
**hook class** or an SVG attribute — never an arbitrary class value.

---

## 10. Standing mandate

Because components were built by approximation, assume **every** component may carry token
drift. The correct remediation is a **systematic per-component reconciliation**: for each
§8/§9 component, extract its design token table, ensure each token exists in `styles.css`
with the exact value, and ensure the `.tsx` consumes it. Do not close a component as "done"
until its tokens are a 1:1 match with the design table and it passes the §12.3 re-skin test.

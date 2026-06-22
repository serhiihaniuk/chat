# Google technical-writing rules (distilled)

Distilled from Google's Technical Writing One and Two
(<https://developers.google.com/tech-writing/overview>). Use this as the rulebook
behind the SKILL. Each rule is a do/don't with a short example.

## The one equation

> good docs = (knowledge + skills the audience needs for the task) − (what the audience already knows)

Give readers what they need and lack — no more, no less. Everything below serves
this equation.

## Words

- **Define new or unfamiliar terms.** Link to an existing definition, or define
  inline on first use; collect repeated definitions into a glossary.
- **Use terms consistently.** Pick one name per concept and keep it. Switching
  between "Protocol Buffers" and "protobufs" makes readers hunt for a distinction
  that isn't there. If you want a short form, introduce it once: "**Protocol
  Buffers** (**protobufs** for short)", then use it consistently.
- **Introduce acronyms** by spelling out the full term, then the acronym in
  parentheses on first use: "Telekinetic Tactile Network (TTN)". Afterward use
  only the acronym.
- **Only define an acronym when** it is much shorter than the full term AND it
  appears many times. Don't define an acronym you use twice.
- **Disambiguate pronouns.** Introduce the noun before the pronoun and keep them
  close. If more than five words separate them, or a second noun intrudes, repeat
  the noun. Watch `it`, `they/them/their`, `this`, and `that` — replace with the
  explicit noun ("This **user ID** lets users authenticate", not "This lets...").

## Active voice

- **Prefer active voice:** actor + verb + target ("The Mungifier didn't parse the
  flags"), not target + verb + actor ("The flags weren't parsed by the
  Mungifier"). Active voice is shorter, names the actor, and skips the mental
  conversion readers do anyway.
- **Spot passive voice:** a form of *be* (is/are/was/were) + a past participle
  (often `-ed`, or irregular like *sat*, *known*), frequently followed by a `by`
  phrase. Beware passive sentences with a missing actor ("The mat was sat on") —
  the reader can't tell who acts.
- **Imperative sentences are active** even without a stated actor; the implied
  actor is "you" ("Open the configuration file."). Imperative is right for steps.

## Clear sentences

- **Choose strong, precise verbs.** Pick the right verb and the sentence falls
  into place. Replace forms of *be*, *occur*, *happen* with what actually happens:
  "Dividing by zero **raises** the exception" beats "The exception **occurs**
  when...". Weak verbs usually signal a vague actor or hidden passive voice.
- **Cut `there is` / `there are`.** Delete the phrase, promote the real subject,
  or name a meaningful subject: "The `met_trick` variable stores accuracy" beats
  "There is a variable called `met_trick` that stores accuracy."
- **Replace vague adjectives/adverbs with data.** "runs 225–250% faster", not
  "runs screamingly fast." Technical docs inform; they don't advertise.

## Short sentences

- **One idea per sentence.** Split a sentence that chains several facts with
  *and/because/which*. Shorter docs read faster and age better.
- **Convert a long sentence to a list** when you see *or*, *and*, or an embedded
  series. (See Lists and tables.)
- **Delete filler.** Prefer the short form:
  | Wordy | Concise |
  |---|---|
  | causes the triggering of | triggers |
  | provides a detailed description of | describes |
  | at this point in time | now |
  | determine the location of | find |
  | is able to | can |
  | in spite of the fact that | although |
- **Manage subordinate clauses.** Keep a clause that extends the main idea; split
  off a clause that branches to a new idea into its own sentence.
- **`that` vs `which` (US English).** Use `that` for an essential clause (no
  comma): "calculations **that** don't involve linear algebra." Use `, which` for
  a nonessential, removable clause: "an interpreted language, **which** Guido van
  Rossum invented." Read aloud — a pause before the clause signals `which`.

## Lists and tables

- **Bulleted list** = unordered (reordering doesn't change meaning).
  **Numbered list** = ordered (steps; sequence matters).
- **Avoid run-in/embedded lists** inside a sentence; convert to a real list.
- **Keep items parallel** in grammar, logical category, capitalization, and
  punctuation. The first item sets the pattern readers expect.
- **Start numbered (procedure) items with an imperative verb** ("Open...",
  "Download...").
- **Capitalize the first word.** Terminal punctuation if the item is a full
  sentence; usually none for a short phrase. Be consistent within the list.
- **Introduce every list and table with a sentence**, usually ending in a colon
  and often using "following": "Take the following actions:".
- **Tables:** meaningful column headers, keep cells short (≤ ~2 sentences), keep
  each column parallel and one data type.

## Paragraphs

- **The opening sentence is the most important sentence.** State the paragraph's
  point first; busy readers may read only that line. Don't mislead (a paragraph
  about loops shouldn't open by defining "code block").
- **One topic per paragraph.** Delete or move sentences about past/future topics
  or anything not serving the central idea.
- **Length: ~3–5 sentences.** A paragraph over ~7 sentences is a wall of text;
  several one-sentence paragraphs signal weak organization — merge or listify.
- **Answer What, Why, How:** what you're telling the reader, why it matters, and
  how to apply it (or why to believe it).

## Audience

- **Define the audience:** role(s) (engineer, PM, scientist, beginner...) and
  their *proximity* to the subject (a different project, language, or skill that
  has decayed). Same role ≈ shared baseline knowledge.
- **List what they must learn:** the tasks they'll do, or the concepts they'll
  retain, after reading. Order prerequisites first.
- **Fit vocabulary to the audience.** Explain team-internal abbreviations for a
  wider audience. Prefer plain words; many readers are non-native English speakers
  and machine translators choke on idioms and cultural metaphors (no NASCAR,
  cricket, "piece of cake", "sticky wicket"). Use "However", not "Be that as it
  may".
- **Beware the curse of knowledge.** Experts forget what novices don't know and
  leave "file not found" gaps. Compare new things to what the reader already knows
  ("similar to X, but..."). Test explanations on a representative reader.

## Document structure

- **State scope up front:** "This document describes the design of Project
  Frambus." Add a non-scope line only for things readers would reasonably expect
  ("does not cover Project Froobus"). During review, delete anything outside scope.
- **State the audience and prerequisites:** who it's for, what to know first, what
  to read first.
- **Summarize key points at the start.** Readers are busy and may not reach page
  two; front-load the answer.
- **Compare to familiar concepts** — most work is evolutionary.
- **Organize by audience goal:** for a new algorithm, lead with overview +
  comparisons, then implementation, then edge cases — relevance, feasibility, then
  depth.

## Self-editing (Technical Writing Two)

Revise in passes; first drafts are never the doc you ship.

1. **Set the draft aside,** then re-read with fresh eyes.
2. **Read it aloud** — your ear catches long sentences, missing words, and clunky
   rhythm your eye skips.
3. **Edit for the audience:** cut what they already know; add what they lack;
   match the vocabulary.
4. **Cut and condense** — apply the words/sentences/filler rules above.
5. **Find and fix** weak verbs, passive voice, `there is`, vague modifiers,
   pronoun ambiguity, walls of text, and run-in lists.
6. **Get feedback** from a representative reader; the curse of knowledge hides your
   own gaps from you.

## Other Technical Writing Two topics (apply when relevant)

- **Different kinds of docs** have different shapes: reference (complete,
  scannable), conceptual (the mental model + why), tutorial (one happy path,
  beginner-safe, every step runnable), how-to (task-focused). Don't blend them.
- **Illustrating:** a diagram needs a caption, the right level of detail (omit
  what doesn't serve the point), and cues that direct attention; introduce it in
  the prose.
- **Sample code:** make it correct, runnable, minimal, and idiomatic; show varying
  complexity; explain the non-obvious lines; never ship code you didn't run.

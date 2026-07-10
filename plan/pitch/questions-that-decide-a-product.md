# Questions I'd Like Us to Answer Before We Commit

I'm genuinely curious about these. Each one starts from what LangGraph gives
us — and what it doesn't. None of them is about whether LangGraph can call a
model; it can. They're about the layer between LangGraph and the user.

(Sanity-check exact API names against the LangGraph version we pin — the
behaviors below are stable core, but names move.)

---

**1.** LangGraph streams raw model chunks from every node — including
sub-graphs' internal LLM calls, all interleaved. It has no concept of "this
is reasoning, this is a tool starting, this is the answer."
**How do we plan to show reasoning → tool → more reasoning → answer in the
UI?** LangGraph doesn't have this feature.

_Example: user asks "compare Q1 and Q2 revenue." The main agent thinks, then
calls the analytics sub-graph, whose internal LLM writes a SQL query. On the
wire, all of it is identical-looking text chunks: the thinking, the SQL
being written, the final answer — interleaved. Rendered naively, the user
watches internal SQL prompts appear inside their answer bubble._

**2.** Tool calls stream out of LangGraph as fragments of partial JSON
(`tool_call_chunks`). The result arrives later, as a message from a
different node.
**Who turns that into "tool started with these arguments / tool finished
with this result" for the frontend?** LangGraph doesn't have this feature.

_Example: what actually arrives is three fragments: `{"loc` … `ation": "Zu`
… `rich"}`. The UI wants one clean event: "get_weather started — location:
Zurich." Someone must buffer fragments, detect the JSON is complete, emit
"started," then later match a separate result message back to this call by
id and emit "finished." Per tool, per call, correctly, forever._

**3.** A direct OpenAI SDK call inside a node emits no stream events at
all — only calls made through LangChain runnables are visible.
**Which of our per-method model calls will the stream even see?**

_Example: a method does `openai.chat.completions.create(...)` directly —
the way our current code calls models. The event stream sees nothing: even
after "adding streaming," the user stares at a frozen screen for the whole
call. Streaming only exists for calls rewritten through LangChain's
wrappers — so "add streaming later" means rewriting the model calls too._

**4.** Checkpointers store graph state so execution can resume. They do
not store the stream the user watched.
**When the user refreshes mid-answer, what replays the timeline —
reasoning, tool progress, partial text?** LangGraph doesn't have this
feature.

_Example: at second 20 the user refreshes. The checkpoint holds what the
ENGINE needs to continue: current messages, which node is next. But the UI
needs to redraw what was already shown: "thought for 3s, ran get_weather —
done, then this half-paragraph…" That display history exists nowhere. It's
a second storage system nobody has designed._

**5.** `interrupt()` — pausing for a human — requires a checkpointer and a
`thread_id`. We don't have a database.
**Where does a paused run live, and what happens when the pod restarts?**
(Also: on resume, the node re-executes from its beginning — are our node
side effects safe to run twice?)

_Example: the model wants to run an UPDATE; the graph pauses on
`interrupt()` waiting for the user's Approve. With the in-memory
checkpointer, that pause lives in one pod's RAM — a deploy at minute three
deletes it, and the user's Approve click lands on nothing. And the
re-execution gotcha: if the node's code is `send_email(); interrupt();`,
approving sends the email twice._

**6.** The checkpointer does no authorization — whoever presents a
`thread_id` gets the thread. Today the user id is a field in the request
body.
**What binds a thread to a user?** LangGraph doesn't have this feature.

_Example: conversations are addressed by ids like `thread-4711`. The
checkpointer's contract is: give me a thread_id, receive the conversation.
Nothing asks who you are. Combined with identity being a JSON field the
client fills in, reading someone else's conversation is editing two strings
in a request._

**7.** LangGraph has no frontend client — no React hook, no stream
consumer, no message state.
**Who writes and maintains ours, and against which event schema?**

_Example: even with a perfect streaming endpoint, the browser still needs
code that parses events, builds the message list, updates tool rows
in place, survives reconnects without duplicating text, and wires the Stop
button. In the TypeScript ecosystem that's an `npm install` (the same
client ChatGPT-class apps use). Here, it's ours to write — and to keep
compatible with every backend change, across the Python/TypeScript gap._

**8.** Our gateway kills requests at its timeout. A multi-tool run takes
longer. When the connection dies, the model keeps generating — and
billing.
**What does the user see, and what stops the provider call?**

_Example: the corporate load balancer cuts connections at 60 seconds. A
five-tool analysis takes three minutes. Request/response means: user gets a
gateway error at 1:00, the model keeps generating until 3:00 for nobody,
we pay for all of it, and "Retry" pays for it again._

**9.** A generation runs inside one Python process. The user's refresh —
or the tool result, or the approval click — lands on another instance.
**How does the second instance find the first one's run?** LangGraph
doesn't have this feature.

_Example: two pods behind the load balancer. The run lives in pod A's
memory; the refresh lands on pod B, which has never heard of it. Sticky
sessions patch this — until pod A is redeployed, which is every release.
Horizontal scaling isn't adding pods; it's making the pods share the run._

**10.** When we add the database: do we store raw LangGraph events, or the
converted UI events? Raw means every page load re-runs the conversion
forever; converted means the UI event schema must be designed now, not
later.
**Which one is the record?**

_Example: store raw events, and opening a March conversation in July means
July's converter re-processes March's events — any converter change since
then renders old conversations wrong, so converters must be versioned
forever. Store converted events, and we've just designed the UI event
schema — the exact work "add a db later" was supposed to postpone. Store
both, and two copies of every conversation must never disagree._

---

## The honest cost question

I ask because I built exactly this layer — the event protocol, the
streaming state machine, replay, browser tools — by hand: about 11,000
lines of source and 5,000 of tests, knowing the target from day one. Then I
replaced it with a maintained open-source equivalent, because even
well-built custom infrastructure is a permanent liability.

In TypeScript this layer is a dependency. In our current stack it's
handwritten — every question above is part of it.

**So: what's our estimate for these ten answers, and which past delivery is
that estimate calibrated against?**

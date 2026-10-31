# 90-second demo script

Open `http://localhost:8787` on the demo machine. Dark theme, 1440 px width, browser zoom 100%.
Everything below is offline. Do not resize during the walk.

## 0 · The frame (10 s)

> "Every engineering team has one person who knows why the retry limit is three. When they leave, the code stays and the reasoning leaves with them. CodeCompass answers *why is this like this* for a real repository — 6,183 commits of Express — and refuses when it cannot."

Point at the rail: 6,183 commits · 96 code entities · 8,982 nodes · 30,597 edges.

## 1 · A real "why" (25 s)

Click the first card: **"Why does Express default the query parser to simple?"**

Say, while it renders:

- Verdict names the exact value and the commit: `450c468d`, Czarek, 15 Apr 2018.
- First quote is the actual thread: an XSS-filter bypass using extended query parsing (issue #3361).
- Second quote: the plan to disable it in Express 5.0.
- Right column: **Douglas Christopher Wilson** — he owns `lib/application.js` and was in the thread.
- Documentation card says the docs record the change but not the reason.

> "The answer is a path through the graph, not a paragraph from a model."

## 2 · A body-level change (15 s)

Ask: **"Why does res.clearCookie ignore expires and maxAge?"**

- The engine lands on `82fc12a4` (2024), not the 2015 commit that wrote the signature.
- Quote: a `maxAge` would set `expires` into the future, so the deletion could be thwarted.

> "Blame over the function span is what makes this visible. A signature diff would have missed it."

## 3 · The supersession test (20 s)

Ask: **"What happened to the CVE-2024-51999 patch?"**

- Red banner: this decision is dead, reverted on 01 Dec 2025 by `697547cd`.
- Release note: "erroneous breaking change… CVE-2024-51999 has been rejected… fully reverted."
- The old patch is shown, but never presented as current truth.

> "This is the failure mode the problem statement calls out: a reversed decision still looks authoritative in the archive."

## 4 · The honesty test (10 s)

Ask: **"Why does Express use Redis for sessions?"**

- Refusal, trust 6, three named gaps.
- Closest commit is labelled **not evidence**.

> "Redis appears in dependency commits. A vector search would return one. The graph has no path from the question to a decision, so the correct output is no answer."

## 5 · The graph + the harness (10 s)

- Click **Graph**: anchors are pinned as clusters; dashed red edges are supersessions/reverts.
- Click **Trust**: 13/13, including the two refusal cases and the low-confidence etag answer.

Close:

> "No API keys, no model, no network. The graph does the retrieval, and the demo includes the questions it should fail."

## If something goes wrong

| Symptom | Recovery |
|---|---|
| API not reachable | `cd src/api && npm start`; UI is served from the same process |
| Answer looks stale | reload; the graph is read once at boot |
| A question refuses unexpectedly | that is a valid outcome — switch to the Trust tab and show the case |
| Screen too narrow | the layout collapses below 1180 px; use 1440 px for the demo |

## Do not do

- Do not ask a question that is not in the repertoire without reading the answer first.
- Do not claim live GitHub access; the discussion cache is bundled.
- Do not claim Neo4j is running; the embedded store is, and the AuraDB export is one command away.

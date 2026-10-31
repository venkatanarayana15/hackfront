# CodeCompass — architecture

## 1. Ingestion

`src/api/ingest.js` runs three git passes over the checkout, merged by SHA:

| Pass | Command shape | Output |
|---|---|---|
| metadata | `git log HEAD --reverse --format=…` | sha, parents, author, email, ISO date, subject, body |
| numstat | `git log HEAD --reverse -M --numstat --format=@@C@@%H` | file changes, additions/deletions, rename detection |
| patch | `git log HEAD --reverse -M -p -U0 -- lib index.js package.json` | removed/added line pairs for config keys and API members |

Only commits reachable from `HEAD` enter the graph (`git rev-list HEAD`). This is not a detail: the
repository has a 2026 `x-powered-by` removal on an unmerged branch. A naive `git log --all` would
present a change that does not govern the shipped code.

Then:

- **HEAD snapshot** of `index.js` + `lib/**`; anchors are extracted from non-comment lines:
  - `config`: `.set|enable|disable('key', value)`
  - `api`: `res|req|app.member = function`
- **git blame --line-porcelain** for every source file → line → commit.
- **docs**: every bullet in `History.md` / `Readme.md` (1,312 lines) becomes a `doc` node; anchor links are
  made by backticked names *and* by substring matching for distinctive names.
- **merge history**: `Revert "…"` / `This reverts commit <sha>` → `REVERTS`.
- **ownership**: person→file counts; **co-change**: file pairs within the source tree.
- **optional GitHub cache**: PRs, issues, review comments, with author, date and URL.

The repo is cloned only for build-time ingestion. The runtime reads one JSON file.

## 2. Graph model

```
(commit)-[:CHANGED {before,after}]->(config|api)
(commit)-[:MENTIONS {snippet}]->(config|api)
(commit)-[:TOUCHED {add,del}]->(file)
(commit)-[:AUTHORED_BY]->(person)
(commit)-[:REVERTS]->(commit)
(commit)-[:SUPERSEDES {kind,anchor}]->(commit|config|api)
(commit)-[:IN_PR]->(pr)-[:HAS_COMMENT]->(comment)
(commit)-[:REFERENCES]->(issue)-[:HAS_COMMENT]->(comment)
(doc)-[:DOCUMENTS]->(config|api)
(person)-[:OWNS {commits}]->(file)
(file)-[:RENAMED_FROM]->(file)
(file)-[:CO_CHANGED {count}]->(file)
```

Counts at HEAD `1c6f1b0`: 8,982 nodes, 30,597 edges, 6,183 commits, 904 paths, 414 identities,
96 code entities, 1,312 documentation lines, 3 PR threads, 4 issues.

### Entity resolution

Names are normalised to lowercase alphanumerics, then merged per file:

- `res.sendfile` and `res.sendFile` → `api:sendfile`; `names` keeps both spellings.
- A spelling that is gone from HEAD is kept in `retiredNames` with the commit that removed it and the
  commit that introduced it.
- Anchors whose label is a superstring of a stronger match are pruned (`query parser fn` vs `query parser`).
- Question matching adds morphology: *"query parsing"* still reaches *"query parser"* through 4-character
  token prefixes.

## 3. Answering

`src/api/reasoner.js` is deterministic. For a question it:

1. **Links** entities: config keys, API members, source files, people, `#N`, CVE ids, SHAs, backticks.
2. **Generates candidates** with additive evidence:
   - latest `CHANGED` on an anchor: `w + 3.6`; earlier changes: `w + 0.3`
   - commit whose `after` matches the HEAD line: `+1.6`
   - function-span blame: `w·0.9 + lines/6` (this is how `clearCookie`'s 2024 body change wins)
   - `MENTIONS` edges, keyword IDF over commit + PR + issue text, PR/issue presence, commit signal, recency.
3. **Chooses the governing decision**:
   - if the candidate is a revert commit → the story is the reversal;
   - if the candidate was reverted → the revert becomes primary and the old commit is marked dead;
   - if a newer `SUPERSEDES` edge exists → the newer decision leads;
   - if the question asks about a retired spelling → the removal commit leads.
4. **Assembles evidence**: commit, PR, issues, comments, docs, code comments, owners. Quotes are
   sentences from those sources, ranked by reason markers (`because`, `avoid`, `security`, `regression`),
   question-term overlap, and penalties for process chatter and URL-only lines. Each quote keeps its
   author, date and URL.
5. **Scores confidence**: entity link (22), governing commit (12), quotes (14 + 3 each), PR/issue (12),
   docs (8), owner (6), reversal penalty/credit, missing-rationale penalty. Band: high ≥ 75, medium ≥ 50,
   low ≥ 32, refuse below.
6. **Refuses** if no entity/identifier anchors the question, or the score is below 32. The refusal lists
   missing nodes and a nearest commit explicitly labelled *not evidence*.

### Why no LLM

The problem statement rewards "evidence that the graph structure, and not the model, is doing the work"
and "honest behaviour when the answer is not in the graph". An extractive composer makes both auditable:
the same input yields the same path, and every sentence can be traced to a node. A model can be added as
a paraphrase layer later without changing retrieval; it is not needed to answer.

## 4. Supersession rules

1. **Explicit revert** — body or subject; `REVERTS` edge; `revertedBy` on the target.
2. **Value change** — same config key, later `.set('key', v2)` where `v2 ≠ v1` → `SUPERSEDES {kind:'value-change'}`.
3. **Removal / rename** — a spelling disappears from HEAD while the concept survives → `retiredNames`,
   `SUPERSEDES {kind:'renamed'}`.
4. **Scope** — only HEAD-reachable commits participate; an unmerged branch cannot override master.

## 5. Performance

- Ingest: ~35 s on the 6,183-commit clone (3 git passes + blame).
- Graph JSON: 7 MB. Boot (parse + index) ≈ 110 ms warm, under 1 s cold.
- Query: 30–70 ms; 13-case eval ≈ 1.2 s once the index is warm.
- No database, no network, no keys.

## 6. Deployment shapes

| Shape | How | Status |
|---|---|---|
| Local demo | `npm start` (Express + built UI) | verified |
| Static UI + API | any Node host; `PORT` env | works, not deployed |
| Neo4j AuraDB | `npm run export:cypher` + APOC import | exported and CSV-validated; import script not run against a live instance |
| Catalyst / serverless | Express app is stateless after boot; graph file must be bundled | not attempted |

## 7. Known limits

- HEAD-only; no branch comparison, no pre-merge prediction.
- Discussion cache is curated (3 PRs, 4 issues), not a full backfill.
- Anchor extraction is JS-shaped; Python/Go repos need extractors.
- Body changes are found through function spans; a change in a nested closure or generated code can be missed.
- Confidence is a heuristic with documented weights; it is not calibrated against human labels.
- The graph answers "why" only when a decision is recorded somewhere in the repository or its cached threads.

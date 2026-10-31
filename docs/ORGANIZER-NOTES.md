# Organizer notes — CodeCompass

## What this is

A working prototype for **PS T1.1 "Why The Code Is Like This"** (Theme T1, Applied AI).
It ingests a real public repository's history into a typed decision graph and answers
"why is this the way it is?" with evidence attached, including supersession and refusal.

Repository used: `expressjs/express` at `1c6f1b0f` (24 Oct 2026), 6,183 commits.

## Setup (no keys, no network, no database)

```bash
cd src/api
npm install
npm start
# → http://localhost:8787
```

`npm install` is only Express + CORS. The graph (`src/data/express.graph.json`, 7 MB) and the
built UI (`src/web/dist`) are included. Node 20+.

`npm test` runs 30 assertions against the real graph, including the 13-case trust harness.

To rebuild the graph from a clone:

```bash
git clone https://github.com/expressjs/express.git .repos/express
cd src/api && npm run ingest
```

## What is complete

- Ingestion: commits, renames, line blame, config-key timelines, release notes, curated PR/issue threads.
- Graph answering: entity linking, typed traversal, supersession resolution, extractive quotes, confidence, refusal.
- UI: Ask, Code (blame + line explanation), Graph, Trust (live harness).
- Neo4j path: `npm run export:cypher` → CSVs + idempotent import for AuraDB.

## What is deliberately not done

- No live GitHub OAuth or live PR fetching during the demo. The discussion cache is bundled and labelled.
- No LLM. This is intentional: the problem statement rewards evidence that the graph is doing the work.
- HEAD-only history. Commits on unmerged branches are excluded — including one tempting `x-powered-by` removal that is not in `master`.
- Anchor extraction targets JS-style config keys and `res/req/app` members; other languages need adapters.
- Confidence is a heuristic, not calibrated.

## Demo questions

1. Why does Express default the query parser to simple?
2. Why does res.clearCookie ignore expires and maxAge?
3. What happened to the CVE-2024-51999 patch?
4. Why does Express use Redis for sessions?  ← must refuse
5. Who should I ask about query parsing?

## Notes for review

- The `Trust` tab is the honest surface: it shows all 13 cases, including two refusals.
- `docs/DEMO.md` is the 90-second walk.
- `deploy/neo4j/queries.cypher` contains the same traversals the product runs, in Cypher.
- All commit hashes, dates and quotes are real and link to GitHub.

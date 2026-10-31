# STATUS — CodeCompass · hackFront India 2026

**Mission:** Theme T1 (AI & Developer Tools) → PS T1.1 "Why The Code Is Like This" (Applied AI)
**Product:** CodeCompass — graph-native answers over a real repository's decision history, with supersession and refusal.

## Current phase: SUBMISSION READY

| Gate | Result |
|---|---|
| Engine tests | **30/30** (`cd src/api && npm test`) |
| Trust harness | **13/13**, including 2 refusals and 1 low-confidence case |
| Production build | clean (`src/web/dist`, 195 KB JS / 27 KB CSS) |
| Browser QA | 9 routes/screens, **0 console errors**, 0 page errors |
| API smoke | health, overview, ask, explain, entity, file, search, graph, eval → **200** |
| Deck geometry audit | 10 slides, 0 out-of-bounds, 0 estimated overflow, 0 text collisions |
| Submission zip | extracted → `npm install` → **30/30** → boot on :8789 → **13/13** eval |
| Offline | no API keys, no network in the demo path |

## What is real

- Repository: `expressjs/express` @ `1c6f1b0`, **6,183 commits** reachable from HEAD (2009 → 2026).
- Graph: **8,982 nodes / 30,597 edges / 96 entities / 414 people / 1,312 doc lines**.
- Discussion cache: 3 PR threads + 4 issues, with authors, dates and URLs.
- Evidence quotes are verbatim; every claim links to a commit or thread.

## Verified behaviours

1. Query parser default → `450c468d` + issue #3361 XSS rationale + owner (confidence 82).
2. `res.clearCookie` body change → `82fc12a4` via function-span blame, not the 2015 signature.
3. CVE-2024-51999 → leads with the same-day revert `697547cd`; release note says "CVE rejected".
4. `res.sendfile` → `res.sendFile` → one entity, retired spelling, deprecation cycle.
5. "Who should I ask" → Jon Church / Douglas Christopher Wilson, from authorship + thread + ownership.
6. Redis sessions and retry-limit questions → **refused** with named gaps.
7. Line 715 → written 2015, governed 2024; the inspector states both.

## Run it

```bash
cd src/api
npm install
npm start        # http://localhost:8787
```

`npm test` for the full verification suite. Rebuild the graph with `npm run ingest` (requires a clone at `.repos/express`).

## Submission artifacts

- `docs/CodeCompass-hackFront-India.pptx` — 10-slide deck
- `docs/screenshots/` — 9 product screens (1440 px)
- `docs/DEMO.md` — 90-second walk, with fallbacks
- `docs/ORGANIZER-NOTES.md` — setup + scope
- `deploy/neo4j/` — CSVs, import, Cypher traversals
- `CodeCompass-source.zip` — submission zip (no dependencies, no clone)

## Remaining, for the team

- [ ] Create the GitHub repository and push (the submission form requires a public link).
- [ ] Fill team details on the form; select **General Track** (no partner track used) and PS **T1.1**.
- [ ] Upload the PPT, the source zip, the GitHub link; video is optional.
- [ ] Do one live rehearsal at 1440 px with the demo script.
- [ ] Confirm the form's problem statement text matches T1.1 exactly.

## Known limits (do not overclaim)

- HEAD-only history; unmerged branches excluded.
- Discussion cache is curated, not a full GitHub backfill.
- Anchor extraction is JS-shaped.
- Confidence is a documented heuristic, not calibrated.
- Neo4j export is generated and CSV-validated; it has not been imported into a live AuraDB instance.

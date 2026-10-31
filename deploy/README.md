# Neo4j AuraDB — same graph, different home

The demo runs on an embedded graph store so it is deterministic and offline.
Nothing about the model is embedded-only: `tools/export_cypher.js` writes the
same nodes and edges as CSVs plus an idempotent import script.

```bash
cd src/api
npm run export:cypher
```

Output:

| File | Contents |
|---|---|
| `nodes.csv` | 8,982 nodes — `id, label, type, props` (JSON: date, author, url, current, retiredNames, timeline…) |
| `rels.csv` | 30,597 edges — `:START_ID, :END_ID, :TYPE, props` (`before`/`after` on `CHANGED`, `kind` on `SUPERSEDES`…) |
| `import.cypher` | constraint + `LOAD CSV` with APOC dynamic labels and relationships |
| `queries.cypher` | the five traversals the product actually runs |

## Import

1. Create an AuraDB Free instance.
2. Upload both CSVs to the instance's import area (Neo4j Browser → project → import, or `neo4j-admin database import`).
3. Run `import.cypher`. APOC core is enabled by default on AuraDB; the script uses
   `apoc.create.addLabels` and `apoc.merge.relationship` so re-running is safe.

Expected sanity check at the end:

```
commit    6183
file       904
person     414
doc       1312
config/api  96
```

## Why the demo does not use the AuraDB instance

- The judging environment may be offline. An embedded 7 MB graph boots in ~400 ms.
- The answer must be reproducible: same graph file, same traversal, same confidence.
- The AuraDB export is the deployment path, not a different implementation:
  `CHANGED`, `REVERTS`, `SUPERSEDES` and `DECLARED_IN` are the same edge types the
  reasoner walks locally.

A thin repository adapter (`reasoner` methods → Cypher) is the next step for a hosted
version; the graph model and the UI do not change.

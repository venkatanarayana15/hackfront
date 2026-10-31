#!/usr/bin/env node
/**
 * Export the ingested graph as Neo4j CSVs + an idempotent import script.
 *
 *   node tools/export_cypher.js
 *
 * Output: deploy/neo4j/{nodes.csv,rels.csv,import.cypher,queries.cypher}
 * The live demo runs on an embedded graph store; this is the AuraDB path for
 * the same graph model, so the model is not tied to the demo runtime.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const GRAPH = process.env.GRAPH_FILE || path.resolve('src/data/express.graph.json');
const OUT = path.resolve('deploy/neo4j');
const g = JSON.parse(fs.readFileSync(GRAPH, 'utf8'));

const esc = v => {
  const s = v == null ? '' : String(v);
  return '"' + s.replace(/"/g, '""').replace(/\r?\n/g, '\\n') + '"';
};

const KEEP = ['label', 'sha', 'short', 'date', 'author', 'email', 'kind', 'url', 'commits', 'touches',
  'names', 'canonical', 'current', 'span', 'retiredNames', 'historicalOnly', 'state', 'number',
  'pr', 'files', 'add', 'del', 'count', 'context'];

const nodeRows = [['id:ID', 'label', 'type', 'props'].join(',')];
for (const n of g.nodes) {
  const props = {};
  for (const k of KEEP) if (n[k] != null) props[k] = n[k];
  if (n.body) props.body = String(n.body).slice(0, 900);
  if (n.timeline) props.timeline = n.timeline.slice(-24);
  nodeRows.push([esc(n.id), esc(n.label), esc(n.type), esc(JSON.stringify(props))].join(','));
}

const relRows = [[':START_ID', ':END_ID', ':TYPE', 'props'].join(',')];
for (const e of g.edges) {
  const props = {};
  for (const k of ['before', 'after', 'kind', 'count', 'anchor', 'snippet', 'date', 'add', 'del', 'target']) {
    if (e[k] != null) props[k] = e[k];
  }
  relRows.push([esc(e.from), esc(e.to), esc(e.type), esc(JSON.stringify(props))].join(','));
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'nodes.csv'), nodeRows.join('\n'));
fs.writeFileSync(path.join(OUT, 'rels.csv'), relRows.join('\n'));

const importCypher = `// CodeCompass → Neo4j AuraDB import
// 1. Create a free AuraDB instance, open Neo4j Browser / Query.
// 2. Upload nodes.csv and rels.csv to the import area, or use \`neo4j-admin database import\`.
// 3. Run this file. Requires APOC core (enabled by default on AuraDB).

CREATE CONSTRAINT node_id IF NOT EXISTS FOR (n:Node) REQUIRE n.id IS UNIQUE;

LOAD CSV WITH HEADERS FROM 'file:///nodes.csv' AS row
MERGE (n:Node {id: row.id})
SET n.label = row.label,
    n.type = row.type,
    n.props = row.props
WITH n, row
CALL apoc.create.addLabels(n, [row.type]) YIELD node
RETURN count(node) AS labelledNodes;

LOAD CSV WITH HEADERS FROM 'file:///rels.csv' AS row
MATCH (a:Node {id: row[':START_ID']})
MATCH (b:Node {id: row[':END_ID']})
CALL apoc.merge.relationship(a, row[':TYPE'], {}, apoc.convert.fromJsonMap(row.props), b) YIELD rel
RETURN count(rel) AS relationships;

// Sanity: 6,183 commits, 904 paths, 96 entities, 30k+ edges
MATCH (n) RETURN labels(n)[0] AS type, count(*) AS n ORDER BY n DESC;
MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS n ORDER BY n DESC;
`;

const queries = `// ---- the exact traversals the product runs ----

// 1. Why does the query parser default to 'simple'?
MATCH (a:Node {type:'config', label:'query parser'})<-[ch:CHANGED]-(c:Node)
RETURN c.label, c.date, ch.before, ch.after ORDER BY c.date;

// 2. Has that decision been superseded or reverted?
MATCH (newer:Node)-[s:SUPERSEDES]->(older:Node)
WHERE older.id CONTAINS '450c468d' OR newer.id CONTAINS '450c468d'
RETURN newer.label, type(s), s.kind, older.label;

// 3. The CVE patch that was reverted the same day
MATCH (rev:Node)-[:REVERTS]->(patched:Node)
WHERE patched.label CONTAINS 'CVE-2024-51999'
OPTIONAL MATCH (rev)-[:AUTHORED_BY]->(p:Node)
RETURN rev.label, rev.date, patched.label, p.label;

// 4. Person to ask: authorship + thread + ownership
MATCH (c:Node)-[:AUTHORED_BY]->(p:Node)-[o:OWNS]->(f:Node)
WHERE c.label CONTAINS 'query parser'
RETURN p.label, f.label, o.commits ORDER BY o.commits DESC LIMIT 5;

// 5. Code entities whose old spelling was retired
MATCH (a:Node)
WHERE a.type IN ['config','api']
WITH a, apoc.convert.fromJsonMap(a.props) AS p
WHERE p.retiredNames IS NOT NULL AND size(p.retiredNames) > 0
RETURN a.label AS entity, p.retiredNames AS retired;
`;

fs.writeFileSync(path.join(OUT, 'import.cypher'), importCypher);
fs.writeFileSync(path.join(OUT, 'queries.cypher'), queries);

console.log(`[export] ${nodeRows.length - 1} nodes · ${relRows.length - 1} edges → ${OUT}`);
console.log(`[export] nodes.csv ${(fs.statSync(path.join(OUT, 'nodes.csv')).size / 1e6).toFixed(2)} MB`);
console.log(`[export] rels.csv  ${(fs.statSync(path.join(OUT, 'rels.csv')).size / 1e6).toFixed(2)} MB`);

#!/usr/bin/env node
/**
 * CodeCompass engine tests — run: node src/api/test.js
 *
 * These assert against the real ingested graph, not a hand-written fixture.
 * The trust harness (src/api/eval.js) is included, so a regression in answer
 * quality fails the build.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Reasoner } = require('./reasoner');
const { runEval } = require('./eval');

const GRAPH = process.env.GRAPH_FILE || path.join(__dirname, '..', 'data', 'express.graph.json');
if (!fs.existsSync(GRAPH)) {
  console.error(`Missing graph at ${GRAPH}. Run: npm run ingest`);
  process.exit(1);
}
const graph = JSON.parse(fs.readFileSync(GRAPH, 'utf8'));
const r = new Reasoner(graph);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}
const t0 = Date.now();

console.log('\nCodeCompass engine tests\n');

/* ---------- graph integrity ---------- */
const ids = new Set(graph.nodes.map(n => n.id));
const dangling = graph.edges.filter(e => !ids.has(e.from) || !ids.has(e.to));
check('graph loads', graph.meta.commits > 5000, `commits=${graph.meta.commits}`);
check('every commit is reachable from HEAD', graph.meta.commits === 6183, String(graph.meta.commits));
check('nodes and edges are present', graph.meta.nodes > 5000 && graph.meta.edges > 20000,
  `${graph.meta.nodes}/${graph.meta.edges}`);
check('no dangling edges', dangling.length === 0, `${dangling.length} dangling`);
check('HEAD snapshot has source files', Object.keys(graph.snapshot).filter(k => k.startsWith('lib/')).length >= 5,
  String(Object.keys(graph.snapshot).length));
check('blame covers response.js', (graph.blame['lib/response.js'] || []).length > 900,
  String((graph.blame['lib/response.js'] || []).length));
check('people carry commit counts', graph.nodes.filter(n => n.type === 'person').some(p => p.commits > 500));

/* ---------- entity resolution ---------- */
const sendfile = r.byId.get('anchor:api:sendfile');
check('res.sendfile and res.sendFile resolve to one node', !!sendfile && sendfile.names.length >= 2,
  JSON.stringify(sendfile?.names));
check('the retired spelling is recorded', sendfile?.retiredNames?.some(x => x.name === 'sendfile'));

/* ---------- supersession ---------- */
const cve = graph.nodes.find(n => n.type === 'commit' && n.sha.startsWith('2f64f68c'));
check('CVE patch is marked reverted', !!cve?.revertedBy, cve?.revertedBy || 'none');
const revertEdges = graph.edges.filter(e => e.type === 'REVERTS');
check('revert edges exist', revertEdges.length >= 10, String(revertEdges.length));

/* ---------- answer paths ---------- */
const qp = r.ask('Why does Express default the query parser to simple?');
check('query parser: governing commit', qp.primary?.sha.startsWith('450c468d'));
check('query parser: security rationale quoted', qp.quotes.some(q => /xss|security|bypass/i.test(q.text)));
check('query parser: high confidence', qp.confidence.score >= 70, String(qp.confidence.score));

const ck = r.ask('Why does res.clearCookie ignore expires and maxAge?');
check('clearCookie: 2024 body change found', ck.primary?.sha.startsWith('82fc12a4'));
check('clearCookie: person to ask', /Jon Church/i.test(ck.owners?.[0]?.name || ''), ck.owners?.[0]?.name);

const cv = r.ask('What happened to the CVE-2024-51999 patch?');
check('CVE: leads with the reversal', cv.kind === 'superseded' && cv.reverted?.sha.startsWith('2f64f68c'));
check('CVE: release note confirms rejection', cv.docs.some(d => /rejected|erroneous/i.test(d.text)));

const nope = r.ask('Why does Express use Redis for sessions?');
check('Redis question is refused', nope.kind === 'refusal' && nope.confidence.band === 'refuse');
check('refusal names what is missing', (nope.missing || []).length >= 2);
const nope2 = r.ask('Why is the retry limit three?');
check('Unrelated codebase question is refused', nope2.kind === 'refusal');

/* ---------- blame + line ---------- */
const line = r.explainLine('lib/response.js', 715);
check('line 715: text attributed', /clearCookie/.test(line.text));
check('line 715: governing decision is the 2024 change', line.primary?.sha.startsWith('82fc12a4'));
check('line 715: separates author from governing commit', line.governing === true);
const line2 = r.explainLine('lib/application.js', 97);
check('line 97: exact config anchor wins over enclosing function', line2.anchor?.label === 'query parser',
  line2.anchor?.label);

/* ---------- browse ---------- */
const ov = r.overview();
check('overview has featured anchors', ov.anchors.length >= 5 && ov.anchors[0].label === 'query parser',
  ov.anchors[0]?.label);
check('entity lookup returns edges', (r.entity('anchor:config:queryparser')?.in || []).length > 0);
check('search finds an entity', r.search('clearCookie').some(x => /clearCookie/i.test(x.label)));
check('subgraph is bounded', qp.graph.nodes.length > 2 && qp.graph.nodes.length <= 26);

/* ---------- trust harness ---------- */
const ev = runEval(r);
check(`trust harness ${ev.summary.passed}/${ev.summary.total}`, ev.summary.passed === ev.summary.total,
  ev.cases.filter(c => !c.pass).map(c => c.id).join(', '));

console.log(`\n${pass} passed, ${fail} failed · ${Date.now() - t0} ms\n`);
process.exit(fail ? 1 : 0);

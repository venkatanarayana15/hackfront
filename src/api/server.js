'use strict';
/**
 * CodeCompass API + static host.
 *
 * One process serves the graph, the reasoner and the built UI:
 *   node src/api/server.js            → http://localhost:8787
 *
 * The graph is read once at boot; every request is a traversal, not a model call.
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Reasoner } = require('./reasoner');
const { runEval } = require('./eval');

const GRAPH = process.env.GRAPH_FILE || path.join(__dirname, '..', 'data', 'express.graph.json');
const PORT = process.env.PORT || 8787;

if (!fs.existsSync(GRAPH)) {
  console.error(`[codecompass] graph not found: ${GRAPH}\nRun: npm run ingest`);
  process.exit(1);
}
const graph = JSON.parse(fs.readFileSync(GRAPH, 'utf8'));
const reasoner = new Reasoner(graph);
console.log(`[codecompass] ${graph.meta.repo} · ${graph.meta.commits} commits · ${graph.meta.nodes} nodes · ${graph.meta.edges} edges`);

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const wrap = fn => (req, res) => {
  try {
    const out = fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};

app.get('/api/health', wrap(() => ({
  ok: true,
  repo: graph.meta.repo,
  remote: graph.meta.remote,
  head: graph.meta.head,
  headDate: graph.meta.headDate,
  commits: graph.meta.commits,
  anchors: graph.meta.anchors,
  nodes: graph.meta.nodes,
  edges: graph.meta.edges,
  prs: graph.meta.prs,
  issues: graph.meta.issues
})));

app.get('/api/overview', wrap(() => reasoner.overview()));

app.get('/api/ask', wrap(req => {
  const q = String(req.query.q || '').slice(0, 500);
  if (!q.trim()) return { error: 'q is required' };
  return reasoner.ask(q);
}));

app.post('/api/ask', wrap(req => {
  const q = String(req.body?.q || '').slice(0, 500);
  if (!q.trim()) return { error: 'q is required' };
  return reasoner.ask(q);
}));

app.get('/api/explain', wrap(req => {
  const file = String(req.query.file || '');
  const line = parseInt(req.query.line, 10);
  if (!file || !line) return { error: 'file and line are required' };
  return reasoner.explainLine(file, line);
}));

app.get('/api/entity', wrap(req => reasoner.entity(String(req.query.id || '')) || { error: 'not found' }));

app.get('/api/search', wrap(req => reasoner.search(String(req.query.q || ''))));

app.get('/api/file', wrap(req => {
  const p = String(req.query.path || '');
  const content = graph.snapshot[p];
  if (content == null) return { error: 'file not in snapshot' };
  const lines = content.split('\n');
  const blame = graph.blame[p] || [];
  const anchors = graph.nodes.filter(n => (n.type === 'config' || n.type === 'api') && n.current?.file === p)
    .map(n => ({ id: n.id, label: n.label, line: n.current.line, kind: n.type, names: n.names }));
  return {
    path: p,
    lines,
    blame: blame.map(b => ({ line: b.line, sha: b.sha.slice(0, 8), author: b.author, date: b.date })),
    anchors,
    files: Object.keys(graph.snapshot).filter(x => !x.startsWith('__'))
  };
}));

/* compact graph view: anchor-centred clusters, not a 6k-commit hairball */
app.get('/api/graph', wrap(req => {
  const NOISY = new Set(['env', 'views', 'home', 'viewengine', 'locals', 'header', 'render', 'download', 'basepath', 'charset', 'root', 'foo', 'hints', 'set', 'get', 'use', 'all', 'listen', 'engine', 'init', 'handle', 'path', 'next', 'end', 'body', 'headers', 'query', 'params', 'app', 'req', 'res', 'streamthreshold', 'cacheviews', 'viewoptions', 'partials', 'jsonpcallback', 'viewreloading', 'reloadviews']);
  const FEATURED = ['query parser', 'etag', 'trust proxy', 'x-powered-by', 'json escape', 'view cache', 'subdomain offset', 'sendFile', 'clearCookie', 'view engine'];
  const pool = graph.nodes
    .filter(n => n.type === 'config' || n.type === 'api')
    .filter(n => !NOISY.has(String(n.label).toLowerCase()) && !/ fn$/i.test(n.label));
  const picked = [];
  for (const name of FEATURED) {
    const want = name.toLowerCase();
    const hit = pool.find(n => String(n.label).toLowerCase() === want ||
      (n.names || []).some(nm => String(nm).toLowerCase() === want));
    if (hit) picked.push(hit);
  }
  const anchorPool = picked.slice(0, 10);
  const anchorIds = new Set(anchorPool.map(a => a.id));
  const commitIds = new Set();
  for (const e of graph.edges) {
    if (e.type === 'CHANGED' && anchorIds.has(e.to)) commitIds.add(e.from);
  }
  const commits = [...commitIds].map(id => graph.nodes.find(n => n.id === id)).filter(Boolean)
    .sort((a, b) => (b.signal || 0) - (a.signal || 0)).slice(0, 46);
  const chosenCommits = new Set(commits.map(c => c.id));
  const peopleIds = new Set();
  const evidenceIds = new Set();
  for (const e of graph.edges) {
    if (e.type === 'AUTHORED_BY' && chosenCommits.has(e.from)) peopleIds.add(e.to);
    if ((e.type === 'IN_PR' || e.type === 'REFERENCES') && chosenCommits.has(e.from)) evidenceIds.add(e.to);
  }
  const people = [...peopleIds].map(id => graph.nodes.find(n => n.id === id)).filter(Boolean)
    .sort((a, b) => (b.commits || 0) - (a.commits || 0)).slice(0, 10);
  const evidence = [...evidenceIds].map(id => graph.nodes.find(n => n.id === id)).filter(Boolean).slice(0, 8);
  const nodes = [...anchorPool.map(n => ({ ...n, label: n.canonical || n.label })), ...commits, ...people, ...evidence];
  const ids = new Set(nodes.map(n => n.id));
  const edges = graph.edges.filter(e => ids.has(e.from) && ids.has(e.to) &&
    ['CHANGED', 'SUPERSEDES', 'REVERTS', 'AUTHORED_BY', 'IN_PR', 'REFERENCES'].includes(e.type));
  return { nodes, edges, stats: { commits: commits.length, anchors: anchorPool.length, people: people.length } };
}));

app.get('/api/eval', wrap(() => runEval(reasoner)));

/* built UI */
const DIST = path.join(__dirname, '..', 'web', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

if (require.main === module) {
  app.listen(PORT, () => console.log(`[codecompass] http://localhost:${PORT}`));
}
module.exports = app;

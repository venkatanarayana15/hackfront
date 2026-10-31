#!/usr/bin/env node
/**
 * CodeCompass ingest — turn a real git repository into a decision graph.
 *
 * Order matters:
 *   1. commit universe (reachable from HEAD only)
 *   2. HEAD snapshot → live anchors (config keys + res/req/app surface)
 *   3. patches → before/after pairs per anchor (structural + known-name match)
 *   4. numstat → files, renames, ownership, co-change
 *   5. blame → which commit owns each surviving line
 *   6. docs → what documentation claims
 *   7. optional GitHub cache → PR / issue / review comments
 *   8. supersession: reverts, value changes, removals
 *
 * Usage:
 *   node src/api/ingest.js --repo .repos/express --out src/data/express.graph.json
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const REPO = path.resolve(arg('repo', '.repos/express'));
const OUT = path.resolve(arg('out', 'src/data/express.graph.json'));
const ENRICH = arg('enrich', '');
const SOURCE_PATHS = ['index.js', 'lib'];
const DOC_PATHS = ['History.md', 'Readme.md'];

const git = a => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 768 });
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const FIELD = '\x1f';

/* ------------------------------------------------------------------ *
 * 1. Universe
 * ------------------------------------------------------------------ */
const headSha = git(['rev-parse', 'HEAD']).trim();
const reachable = new Set(git(['rev-list', 'HEAD']).trim().split('\n'));
console.log(`[ingest] HEAD ${headSha.slice(0, 8)} · ${reachable.size} reachable commits`);

/* ------------------------------------------------------------------ *
 * 2. Metadata
 * ------------------------------------------------------------------ */
const meta = new Map();
{
  const raw = git(['log', 'HEAD', '--reverse', '--format=%H' + FIELD + '%P' + FIELD + '%an' + FIELD + '%ae' + FIELD + '%aI' + FIELD + '%s' + FIELD + '%b\x1e']);
  for (const rec of raw.split('\x1e')) {
    const r = rec.replace(/^\n+/, '');
    if (!r) continue;
    const f = r.split(FIELD);
    if (f.length < 7) continue;
    const [sha, parents, author, email, date, subject, body] = f;
    if (!reachable.has(sha)) continue;
    meta.set(sha, {
      sha, parents: parents ? parents.split(' ').filter(Boolean) : [],
      author: author.trim(), email: email.trim(), date: date.trim(),
      subject: subject.trim(), body: (body || '').trim()
    });
  }
}
const commits = [...meta.values()].sort((a, b) => a.date.localeCompare(b.date));
console.log(`[ingest] metadata ${commits.length}`);

/* ------------------------------------------------------------------ *
 * 3. HEAD snapshot + anchors (before patches, so removals can be matched)
 * ------------------------------------------------------------------ */
const headFileList = git(['ls-tree', '-r', '--name-only', 'HEAD']).trim().split('\n')
  .filter(p => p === 'index.js' || p.startsWith('lib/'));
const snapshot = {};
for (const p of headFileList) snapshot[p] = git(['show', `HEAD:${p}`]);
for (const p of DOC_PATHS) {
  try { snapshot[p] = git(['show', `HEAD:${p}`]); } catch (e) { /* optional */ }
}

const ANCHOR_PATTERNS = [
  { kind: 'config', re: /\.(?:set|enable|disable)\(\s*['"]([a-z][a-z0-9 _-]{1,40})['"]/g },
  { kind: 'api', re: /\b(?:res|req|app)\.([A-Za-z][A-Za-z0-9_]{1,40})\s*=\s*(?=function\b|\()/g }
];
function structuralAnchors(line) {
  const out = [];
  for (const { kind, re } of ANCHOR_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) !== null) out.push({ key: `${kind}:${norm(m[1])}`, kind, display: m[1].trim() });
  }
  return out;
}

const anchors = new Map();
for (const p of headFileList) {
  snapshot[p].split('\n').forEach((line, i) => {
    if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
    for (const a of structuralAnchors(line)) {
      const e = anchors.get(a.key) || {
        key: a.key, kind: a.kind, names: new Set(), files: new Set(),
        occurrences: [], firstSeen: null, lastSeen: null, current: null, historicalOnly: false
      };
      e.names.add(a.display);
      e.files.add(p);
      if (e.occurrences.length < 24) e.occurrences.push({ file: p, line: i + 1, text: line.trim() });
      const commented = /^\s*(?:\/\/|\*|\/\*)/.test(line);
      const literalDefault = /^\s*this\.(?:set|enable|disable)\(/.test(line) && /,\s*(?:'[^']*'|"[^"]*"|true|false)\s*\)/.test(line);
      const isDefaultsFile = p === 'lib/application.js';
      const score = (commented ? -5 : 0) + (literalDefault ? 4 : 0) + (isDefaultsFile ? 1 : 0);
      if (!e.current || score > (e.currentScore ?? -99)) {
        e.current = { file: p, line: i + 1, text: line.trim(), name: a.display };
        e.currentScore = score;
      }
      anchors.set(a.key, e);
    }
  });
}
/* file-scoped names: a line inside lib/response.js that mentions clearCookie is evidence
   about that method, without pretending the signature changed */
const namesByFile = new Map();
for (const [key, a] of anchors) {
  for (const f of a.files) {
    const arr = namesByFile.get(f) || [];
    for (const n of a.names) if (n.length >= 5) arr.push({ key, name: n, norm: norm(n) });
    namesByFile.set(f, arr);
  }
}
console.log(`[ingest] snapshot ${headFileList.length} files · ${anchors.size} live anchors`);

/* ------------------------------------------------------------------ *
 * 4. Patches → anchor timelines
 * ------------------------------------------------------------------ */
const changePairs = new Map();
const mentions = new Map();
const seenMention = new Set();
const patchRaw = git(['log', 'HEAD', '--reverse', '-M', '--format=@@C@@%H', '-p', '-U0', '--', ...SOURCE_PATHS, 'package.json']);
let patchCommits = 0;
for (const block of patchRaw.split('@@C@@').slice(1)) {
  const nl = block.indexOf('\n');
  const sha = (nl === -1 ? block : block.slice(0, nl)).trim();
  if (!sha || !meta.has(sha)) continue;
  patchCommits++;
  const lines = block.slice(nl + 1).split('\n');
  let curPath = null, removed = [], added = [];
  const flush = () => {
    if (!curPath) { removed = []; added = []; return; }
    const rem = new Map(), add = new Map();
    const collect = (text, bag) => {
      const trimmed = text.trim();
      const isComment = /^(?:\/\/|\*|\/\*)/.test(trimmed);
      if (!isComment) for (const h of structuralAnchors(text)) if (!bag.has(h.key)) bag.set(h.key, { ...h, text });
      /* mention index: same file, name appears anywhere in the changed line */
      const nt = norm(text);
      for (const cand of namesByFile.get(curPath) || []) {
        if (!nt.includes(cand.norm)) continue;
        const mk = `${sha}|${cand.key}`;
        if (seenMention.has(mk)) continue;
        seenMention.add(mk);
        const arr = mentions.get(cand.key) || [];
        if (arr.length < 40) arr.push({ sha, path: curPath, text: text.slice(0, 220) });
        mentions.set(cand.key, arr);
      }
    };
    for (const t of removed) collect(t, rem);
    for (const t of added) collect(t, add);
    for (const k of new Set([...rem.keys(), ...add.keys()])) {
      const arr = changePairs.get(k) || [];
      arr.push({
        sha, path: curPath,
        before: rem.get(k) ? rem.get(k).text.trim() : null,
        after: add.get(k) ? add.get(k).text.trim() : null
      });
      changePairs.set(k, arr);
    }
    removed = []; added = [];
  };
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flush();
      const mm = line.match(/ b\/(.*)$/);
      curPath = mm ? mm[1] : null;
      continue;
    }
    if (!curPath) continue;
    if (line.startsWith('@@')) { flush(); continue; }
    if (line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('index ') ||
        line.startsWith('new file ') || line.startsWith('deleted file ') || line.startsWith('similarity ') ||
        line.startsWith('rename ') || line.startsWith('old mode') || line.startsWith('new mode')) continue;
    if (line.startsWith('-')) removed.push(line.slice(1));
    else if (line.startsWith('+')) added.push(line.slice(1));
  }
  flush();
}
/* historical-only anchors (e.g. res.sendfile) */
for (const [key, pairs] of changePairs) {
  if (anchors.has(key)) continue;
  const kind = key.split(':')[0];
  anchors.set(key, {
    key, kind, names: new Set([key.split(':')[1]]), files: new Set(), occurrences: [],
    firstSeen: null, lastSeen: null, current: null, historicalOnly: true
  });
}
for (const [key, e] of anchors) {
  const pairs = (changePairs.get(key) || []).filter(p => meta.has(p.sha));
  for (const p of pairs) {
    const c = meta.get(p.sha);
    if (!e.firstSeen || c.date < e.firstSeen) e.firstSeen = c.date;
    if (!e.lastSeen || c.date > e.lastSeen) e.lastSeen = c.date;
    for (const t of [p.before, p.after]) {
      if (!t) continue;
      for (const a of structuralAnchors(t)) if (a.key === key) e.names.add(a.display);
    }
  }
  if (!e.current && pairs.length) {
    const last = [...pairs].sort((a, b) => meta.get(a.sha).date.localeCompare(meta.get(b.sha).date)).pop();
    e.current = { file: last.path, line: null, text: last.before || last.after, name: key.split(':')[1] };
    e.historicalOnly = true;
  }
}
console.log(`[ingest] patches ${patchCommits} · ${changePairs.size} anchor histories · ${mentions.size} mentioned anchors`);

/* ------------------------------------------------------------------ *
 * 5. Numstat → all repository paths
 * ------------------------------------------------------------------ */
const statRaw = git(['log', 'HEAD', '--reverse', '-M', '--numstat', '--format=@@C@@%H']);
const filesOf = new Map();
const touchedEdges = [];
const renames = [];
const fileSet = new Map();
for (const block of statRaw.split('@@C@@').slice(1)) {
  const lines = block.replace(/^\n+/, '').split('\n');
  const sha = lines[0].trim();
  if (!meta.has(sha)) continue;
  const files = [];
  for (const l of lines.slice(1)) {
    const m = l.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!m) continue;
    const add = m[1] === '-' ? 0 : +m[1];
    const del = m[2] === '-' ? 0 : +m[2];
    let from = null, to = m[3];
    if (to.includes(' => ')) {
      const brace = to.match(/^(.*)\{(.*?) => (.*?)\}(.*)$/);
      if (brace) {
        from = (brace[1] + brace[2] + brace[4]).replace(/\/{2,}/g, '/');
        to = (brace[1] + brace[3] + brace[4]).replace(/\/{2,}/g, '/');
      } else {
        const arrow = to.match(/^(.*?) => (.*)$/);
        if (arrow) { from = arrow[1].trim(); to = arrow[2].trim(); }
      }
    }
    if (!to) continue;
    files.push({ path: to, add, del });
    if (from) renames.push({ from, to, sha });
    touchedEdges.push({ sha, path: to, add, del });
    const f = fileSet.get(to) || { path: to, touches: 0, authors: new Set(), first: meta.get(sha).date, last: meta.get(sha).date, atHead: false };
    f.touches++; f.authors.add(meta.get(sha).email);
    if (meta.get(sha).date < f.first) f.first = meta.get(sha).date;
    if (meta.get(sha).date > f.last) f.last = meta.get(sha).date;
    fileSet.set(to, f);
  }
  filesOf.set(sha, files);
}
for (const p of headFileList) if (fileSet.has(p)) fileSet.get(p).atHead = true;
console.log(`[ingest] numstat ${filesOf.size} commits · ${fileSet.size} paths · ${renames.length} renames`);

/* ------------------------------------------------------------------ *
 * 6. Blame
 * ------------------------------------------------------------------ */
const blame = {};
for (const p of headFileList) {
  const rows = [];
  try {
    const out = git(['blame', '--line-porcelain', 'HEAD', '--', p]);
    let cur = null;
    for (const l of out.split('\n')) {
      const m = l.match(/^([0-9a-f]{40}) (\d+) (\d+)/);
      if (m) { cur = { sha: m[1], line: +m[3], author: '', date: '' }; continue; }
      if (!cur) continue;
      if (l.startsWith('author ')) cur.author = l.slice(7);
      else if (l.startsWith('author-time ')) cur.date = new Date(+l.slice(12) * 1000).toISOString();
      else if (l.startsWith('\t')) { rows.push(cur); cur = null; }
    }
  } catch (e) { /* skip */ }
  blame[p] = rows;
}

/* ------------------------------------------------------------------ *
 * 7. Docs
 * ------------------------------------------------------------------ */
const docs = [];
for (const f of DOC_PATHS) {
  if (!snapshot[f]) continue;
  snapshot[f].split('\n').forEach((line, i) => {
    if (!/^\s*[*-]\s+/.test(line)) return;
    const text = line.replace(/^\s*[*-]\s+/, '').trim();
    if (text.length < 30) return;
    const mentioned = [...text.matchAll(/`([^`]{2,48})`/g)].map(m => norm(m[1]));
    const textNorm = norm(text);
    const byName = [];
    for (const [key, a] of anchors) {
      for (const n of a.names) {
        if (n.length >= 6 && textNorm.includes(norm(n))) { byName.push(key.split(':')[1]); break; }
      }
    }
    const hits = [...mentioned.filter(h => anchors.has('config:' + h) || anchors.has('api:' + h)), ...byName];
    docs.push({ file: f, line: i + 1, text, anchors: [...new Set(hits)] });
  });
}
console.log(`[ingest] docs ${docs.length}`);

/* ------------------------------------------------------------------ *
 * 8. Enrichment cache
 * ------------------------------------------------------------------ */
let enrich = { pulls: {}, issues: {} };
if (ENRICH && fs.existsSync(path.resolve(ENRICH))) enrich = JSON.parse(fs.readFileSync(path.resolve(ENRICH), 'utf8'));
const prByCommit = new Map();
for (const [num, pr] of Object.entries(enrich.pulls || {})) {
  for (const sha of pr.commits || []) prByCommit.set(sha, { ...pr, number: +num });
}

/* ------------------------------------------------------------------ *
 * 9. Graph
 * ------------------------------------------------------------------ */
const nodes = [], edges = [];
const seenNode = new Set(), seenEdge = new Set();
function node(id, type, label, props = {}) {
  if (seenNode.has(id)) return id;
  seenNode.add(id); nodes.push({ id, type, label, ...props }); return id;
}
function edge(from, to, type, props = {}) {
  if (!from || !to) return;
  const k = `${from}|${type}|${to}`;
  if (seenEdge.has(k)) return;
  seenEdge.add(k); edges.push({ from, to, type, ...props });
}

const repoId = `repo:${path.basename(REPO)}`;
node(repoId, 'repo', path.basename(REPO), {
  head: headSha, remote: git(['config', '--get', 'remote.origin.url']).trim(), commits: commits.length
});

const fileNode = new Map();
for (const [p, f] of fileSet) {
  const id = `file:${p}`;
  fileNode.set(p, id);
  node(id, 'file', p, { touches: f.touches, authors: f.authors.size, firstSeen: f.first, lastSeen: f.last, atHead: !!snapshot[p] && !!blame[p] });
}
for (const r of renames) edge(fileNode.get(r.to), fileNode.get(r.from), 'RENAMED_FROM', { date: meta.get(r.sha)?.date });

const people = new Map();
const commitNode = new Map();
for (const c of commits) {
  const id = `commit:${c.sha}`;
  commitNode.set(c.sha, id);
  const pr = prByCommit.get(c.sha);
  const files = filesOf.get(c.sha) || [];
  node(id, 'commit', c.subject, {
    sha: c.sha, short: c.sha.slice(0, 8), date: c.date, author: c.author, email: c.email,
    body: c.body.slice(0, 2400), files: files.length,
    add: files.reduce((s, f) => s + f.add, 0), del: files.reduce((s, f) => s + f.del, 0),
    kind: classify(c), pr: pr ? pr.number : null, url: pr ? pr.url : null,
    revertedBy: null, signal: signalScore(c, files.length)
  });
  edge(id, repoId, 'IN_REPO');

  const pid = `person:${norm(c.email || c.author)}`;
  if (!people.has(pid)) {
    const login = (c.email.match(/(?:\d+\+)?([^@]+)@users\.noreply\.github\.com/) || [])[1] || null;
    people.set(pid, { id: pid, name: c.author, email: c.email, login, commits: 0, first: c.date, last: c.date });
    node(pid, 'person', c.author, { email: c.email, login });
  }
  const person = people.get(pid);
  person.commits++;
  if (c.date > person.last) person.last = c.date;
  if (c.date < person.first) person.first = c.date;
  edge(id, pid, 'AUTHORED_BY');

  for (const f of files) edge(id, fileNode.get(f.path), 'TOUCHED', { add: f.add, del: f.del });
}

/* anchors */
function spanOf(file, startLine) {
  const lines = snapshot[file].split('\n');
  let depth = 0, started = false;
  for (let i = startLine - 1; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') depth--;
    }
    if (started && depth <= 0) return { file, start: startLine, end: i + 1 };
    if (i - startLine > 400) break;
  }
  return { file, start: startLine, end: startLine };
}
const blameByFileLine = new Map();
for (const [p, rows] of Object.entries(blame)) for (const r of rows) blameByFileLine.set(p + ':' + r.line, r);

const anchorNodes = new Map();
for (const [key, a] of anchors) {
  const kind = key.split(':')[0];
  const aid = `anchor:${key}`;
  anchorNodes.set(key, aid);
  let span = null, blameTop = [];
  if (kind === 'api' && a.current?.file && a.current?.line) {
    span = spanOf(a.current.file, a.current.line);
    const counts = new Map();
    for (const r of blame[a.current.file] || []) {
      if (r.line < span.start || r.line > span.end) continue;
      const e = counts.get(r.sha) || { sha: r.sha, lines: 0, author: r.author, date: r.date };
      e.lines++; counts.set(r.sha, e);
    }
    blameTop = [...counts.values()].sort((x, y) => y.lines - x.lines).slice(0, 6)
      .map(b => ({ ...b, subject: meta.get(b.sha)?.subject || '(unknown)', date: meta.get(b.sha)?.date || b.date }))
      .filter(b => meta.has(b.sha));
  }
  const timeline = (changePairs.get(key) || [])
    .filter(p => meta.has(p.sha))
    .map(p => ({ sha: p.sha, path: p.path, before: p.before, after: p.after, date: meta.get(p.sha).date, subject: meta.get(p.sha).subject }))
    .sort((x, y) => x.date.localeCompare(y.date));
  /* a spelling can retire while the concept survives (res.sendfile → res.sendFile) */
  const retiredNames = [];
  for (const name of a.names) {
    const pairs = (changePairs.get(key) || []).filter(p => meta.has(p.sha))
      .sort((x, y) => meta.get(x.sha).date.localeCompare(meta.get(y.sha).date));
    let addedAt = null, removedAt = null;
    for (const p of pairs) {
      const inBefore = p.before && norm(p.before).includes(norm(name));
      const inAfter = p.after && norm(p.after).includes(norm(name));
      if (inAfter && !inBefore && !addedAt) addedAt = p.sha;
      if (inBefore && !inAfter) removedAt = p.sha;
    }
    if (removedAt && !snapshotMatch(name, kind)) {
      retiredNames.push({ name, removedBy: removedAt, addedBy: addedAt, date: meta.get(removedAt)?.date });
    }
  }
  node(aid, kind === 'config' ? 'config' : 'api', a.current?.name || key.split(':')[1], {
    key, kind, canonical: a.current?.name || key.split(':')[1], names: [...a.names], retiredNames, span, blameTop,
    files: [...a.files], current: a.current, occurrences: a.occurrences,
    firstSeen: timeline[0]?.date || null, lastSeen: timeline[timeline.length - 1]?.date || null,
    historicalOnly: !!a.historicalOnly,
    timeline: timeline.slice(-16).map(t => ({ sha: t.sha, date: t.date, before: t.before, after: t.after, subject: t.subject }))
  });
  for (const f of a.files) edge(aid, fileNode.get(f), 'DECLARED_IN');
  for (const t of timeline) edge(commitNode.get(t.sha), aid, 'CHANGED', {
    before: t.before ? t.before.slice(0, 280) : null,
    after: t.after ? t.after.slice(0, 280) : null
  });
  for (const m of (mentions.get(key) || []).slice(-30)) edge(commitNode.get(m.sha), aid, 'MENTIONS', { snippet: m.text });
}
function snapshotMatch(name, kind) {
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = kind === 'config'
    ? new RegExp(`\\.(?:set|enable|disable)\\(\\s*['"]${esc}['"]`)
    : new RegExp(`\\b(?:res|req|app)\\.${esc}\\s*=\\s*(?:function\\b|\\()`);
  for (const p of headFileList) {
    for (const line of snapshot[p].split('\n')) {
      if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) continue;
      if (re.test(line)) return true;
    }
  }
  return false;
}

/* reversals */
const reversals = [];
for (const c of commits) {
  const m = c.body.match(/This reverts commit ([0-9a-f]{7,40})/i);
  if (m) { reversals.push({ from: c.sha, to: m[1] }); continue; }
  const m2 = c.subject.match(/^Revert "(.+)"$/);
  if (m2) {
    const pool = commits.filter(x => x.subject === m2[1] && x.date <= c.date && x.sha !== c.sha);
    if (pool.length) reversals.push({ from: c.sha, to: pool[pool.length - 1].sha });
  }
}
const shaList = commits.map(c => c.sha);
for (const r of reversals) {
  const target = shaList.find(s => s.startsWith(r.to));
  if (!target) continue;
  edge(commitNode.get(r.from), commitNode.get(target), 'REVERTS', { date: meta.get(r.from).date });
  const cn = nodes.find(n => n.id === commitNode.get(target));
  if (cn) cn.revertedBy = meta.get(r.from).sha;
  for (const [key, pairs] of changePairs) {
    if (!pairs.some(p => p.sha === target)) continue;
    edge(commitNode.get(r.from), commitNode.get(target), 'REVERTS_ANCHOR', { anchor: key });
    edge(commitNode.get(r.from), anchorNodes.get(key), 'SUPERSEDES', { kind: 'revert', date: meta.get(r.from).date, target });
  }
}
/* a retired spelling is superseded by the commit that removed it */
for (const [key, a] of anchors) {
  for (const rn of a.retiredNames || []) {
    if (rn.addedBy) edge(commitNode.get(rn.removedBy), commitNode.get(rn.addedBy), 'SUPERSEDES', { anchor: key, kind: 'renamed', name: rn.name });
    edge(commitNode.get(rn.removedBy), anchorNodes.get(key), 'SUPERSEDES', { kind: 'renamed', name: rn.name, date: rn.date });
  }
}

/* value-change supersession: config values only */
function configValue(text) {
  if (!text) return null;
  const m = text.match(/\.(set|enable|disable)\(\s*['"]([^'"]+)['"]\s*(?:,\s*(.+?))?\)\s*;?\s*$/);
  if (!m) return null;
  if (m[1] === 'enable') return 'true';
  if (m[1] === 'disable') return 'false';
  return (m[3] || '').trim();
}
const supersessions = [];
for (const [key, pairs] of changePairs) {
  if (!key.startsWith('config:')) continue;
  const ordered = pairs.filter(p => meta.has(p.sha)).sort((a, b) => meta.get(a.sha).date.localeCompare(meta.get(b.sha).date));
  let prev = null;
  for (const p of ordered) {
    const before = configValue(p.before);
    const after = configValue(p.after);
    if (prev && before !== null && after !== null && before !== after && prev.value !== after) {
      supersessions.push({ from: prev.sha, to: p.sha, anchor: key, kind: 'value-change', date: meta.get(p.sha).date });
      edge(commitNode.get(p.sha), commitNode.get(prev.sha), 'SUPERSEDES', { anchor: key, kind: 'value-change' });
      edge(commitNode.get(p.sha), anchorNodes.get(key), 'SUPERSEDES', { kind: 'value-change' });
    }
    if (after !== null) prev = { sha: p.sha, value: after };
  }
}
/* removal supersession */
for (const [key, a] of anchors) {
  if (!a.historicalOnly) continue;
  const pairs = (changePairs.get(key) || []).filter(p => meta.has(p.sha))
    .sort((x, y) => meta.get(x.sha).date.localeCompare(meta.get(y.sha).date));
  const first = pairs.find(p => p.after);
  const last = pairs[pairs.length - 1];
  if (first && last && last.after === null && first.sha !== last.sha) {
    supersessions.push({ from: first.sha, to: last.sha, anchor: key, kind: 'removed', date: meta.get(last.sha).date });
    edge(commitNode.get(last.sha), commitNode.get(first.sha), 'SUPERSEDES', { anchor: key, kind: 'removed' });
    edge(commitNode.get(last.sha), anchorNodes.get(key), 'SUPERSEDES', { kind: 'removed' });
  }
}

/* commit counts live on the person nodes, not only in the map */
for (const p of people.values()) {
  const n = nodes.find(x => x.id === p.id);
  if (n) { n.commits = p.commits; n.first = p.first; n.last = p.last; n.login = p.login || null; }
}

/* ownership */
const own = new Map();
for (const t of touchedEdges) {
  const c = meta.get(t.sha);
  if (!c) continue;
  const k = norm(c.email || c.author) + '|' + t.path;
  own.set(k, (own.get(k) || 0) + 1);
}
for (const [k, n] of own) {
  const [pid, p] = k.split('|');
  edge(`person:${pid}`, fileNode.get(p), 'OWNS', { commits: n });
}

/* co-change, source tree only */
const co = new Map();
for (const [sha, fs] of filesOf) {
  const arr = [...new Set(fs.map(f => f.path))].filter(p => p.startsWith('lib/') || p === 'index.js').slice(0, 20);
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const k = arr[i] < arr[j] ? arr[i] + '|' + arr[j] : arr[j] + '|' + arr[i];
    co.set(k, (co.get(k) || 0) + 1);
  }
}
for (const [k, n] of [...co.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200)) {
  const [a, b] = k.split('|');
  edge(fileNode.get(a), fileNode.get(b), 'CO_CHANGED', { count: n });
}

/* docs */
for (const d of docs) {
  const id = `doc:${d.file}:${d.line}`;
  node(id, 'doc', d.text.slice(0, 120), { file: d.file, line: d.line, full: d.text });
  edge(id, fileNode.get(d.file), 'IN_DOC');
  for (const a of d.anchors) {
    const aid = anchorNodes.get('config:' + a) || anchorNodes.get('api:' + a);
    if (aid) edge(id, aid, 'DOCUMENTS');
  }
}

/* PR / issue evidence */
for (const [num, pr] of Object.entries(enrich.pulls || {})) {
  const id = `pr:${num}`;
  node(id, 'pr', pr.title || `#${num}`, {
    number: +num, url: pr.url, state: pr.state, date: pr.mergedAt || pr.createdAt,
    body: (pr.body || '').slice(0, 2800), author: pr.author
  });
  for (const sha of pr.commits || []) if (commitNode.has(sha)) edge(commitNode.get(sha), id, 'IN_PR');
  for (const c of pr.comments || []) {
    const cid = `comment:pr:${num}:${c.id}`;
    node(cid, 'comment', c.body.replace(/\s+/g, ' ').slice(0, 150), {
      body: c.body.slice(0, 1800), author: c.author, date: c.date, url: c.url, context: `PR #${num}`
    });
    edge(id, cid, 'HAS_COMMENT');
    const pid = `person:${norm(c.author)}`;
    if (!people.has(pid)) {
      people.set(pid, { id: pid, name: c.author, login: c.author, commits: 0, first: c.date, last: c.date });
      node(pid, 'person', c.author, { login: c.author, commits: 0, last: c.date });
    }
    edge(cid, pid, 'BY');
  }
}
for (const [num, iss] of Object.entries(enrich.issues || {})) {
  const id = `issue:${num}`;
  node(id, 'issue', iss.title || `#${num}`, {
    number: +num, url: iss.url, state: iss.state, date: iss.createdAt,
    body: (iss.body || '').slice(0, 2800), author: iss.author
  });
  for (const sha of iss.commits || []) if (commitNode.has(sha)) edge(commitNode.get(sha), id, 'REFERENCES');
  for (const c of iss.comments || []) {
    const cid = `comment:issue:${num}:${c.id}`;
    node(cid, 'comment', c.body.replace(/\s+/g, ' ').slice(0, 150), {
      body: c.body.slice(0, 1800), author: c.author, date: c.date, url: c.url, context: `issue #${num}`
    });
    edge(id, cid, 'HAS_COMMENT');
    const pid = `person:${norm(c.author)}`;
    if (!people.has(pid)) {
      people.set(pid, { id: pid, name: c.author, login: c.author, commits: 0, first: c.date, last: c.date });
      node(pid, 'person', c.author, { login: c.author, commits: 0, last: c.date });
    }
    edge(cid, pid, 'BY');
  }
}
for (const c of commits) {
  const text = `${c.subject} ${c.body}`;
  for (const m of text.matchAll(/(?:closes|fixes|resolves|refs?)\s+#(\d+)/gi)) {
    const id = `issue:${m[1]}`;
    if (seenNode.has(id)) edge(commitNode.get(c.sha), id, 'REFERENCES');
  }
  for (const m of c.subject.matchAll(/\(#(\d+)\)/g)) {
    const id = `pr:${m[1]}`;
    if (seenNode.has(id)) edge(commitNode.get(c.sha), id, 'IN_PR');
  }
}

/* markers */
for (const p of headFileList) {
  snapshot[p].split('\n').forEach((line, i) => {
    if (line.trim().length > 10 && /\b(TODO|FIXME|HACK|back-compat|deprecated|do not|must stay|workaround)\b/i.test(line)) {
      const id = `marker:${p}:${i + 1}`;
      node(id, 'marker', line.trim().slice(0, 120), { file: p, line: i + 1, full: line.trim() });
      edge(id, fileNode.get(p), 'IN_FILE');
    }
  });
}

/* ------------------------------------------------------------------ *
 * 10. Write
 * ------------------------------------------------------------------ */
snapshot.__meta = { name: path.basename(REPO), head: headSha, remote: git(['config', '--get', 'remote.origin.url']).trim() };
const stats = {
  repo: path.basename(REPO), remote: snapshot.__meta.remote, head: headSha,
  headDate: commits[commits.length - 1]?.date, commits: commits.length,
  headFiles: headFileList.length, paths: fileSet.size, people: people.size,
  anchors: anchors.size, patchCommits, reversals: reversals.length,
  supersessions: supersessions.length, docs: docs.length,
  prs: Object.keys(enrich.pulls || {}).length, issues: Object.keys(enrich.issues || {}).length,
  nodes: nodes.length, edges: edges.length
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ meta: stats, nodes, edges, snapshot, blame }));
console.log('[ingest] wrote', OUT, (fs.statSync(OUT).size / 1e6).toFixed(2) + ' MB');
console.log(JSON.stringify(stats, null, 2));

function signalScore(c, fileCount) {
  let s = 0;
  if (c.body.length > 120) s += 2;
  if (/\bbecause\b|\breason\b|\bso that\b|\bto avoid\b|\binstead\b|\bworkaround\b|\bregression\b/i.test(c.body)) s += 2;
  if (/^revert/i.test(c.subject)) s += 3;
  if (/\bcve\b|security|deprecat|breaking/i.test(c.subject + c.body)) s += 2;
  if (fileCount > 0 && fileCount <= 4) s += 1;
  return s;
}
function classify(c) {
  const t = `${c.subject} ${c.body}`.toLowerCase();
  if (/^revert|this reverts/.test(t)) return 'revert';
  if (/\bcve\b|security|vulnerab|exploit/.test(t)) return 'security';
  if (/deprecat/.test(t)) return 'deprecation';
  if (/breaking change|^feat!/.test(t)) return 'breaking';
  if (/\bfix(es|ed)?\b|bug|regression|hotfix/.test(t)) return 'fix';
  if (/perf|optimi[sz]|faster|memory/.test(t)) return 'performance';
  if (/^feat\b|^add |support|implement/.test(t)) return 'feature';
  if (/^docs?\b|readme|history\.md/.test(t)) return 'docs';
  return 'other';
}

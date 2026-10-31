#!/usr/bin/env node
/**
 * Refresh the GitHub evidence cache (PRs, issues, comments) used by the demo.
 * Unauthenticated: 60 req/hour. Everything is cached; the demo never calls GitHub.
 *
 *   node tools/fetch_github.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO = process.env.GH_REPO || 'expressjs/express';
const TOKEN = process.env.GITHUB_TOKEN || '';
const OUT = path.resolve('src/data/github.json');
const cache = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { pulls: {}, issues: {} };

/* commit → PR, verified by hand: the PR that actually introduced the change */
const PULLS = [
  { commit: '82fc12a4', pr: 5792 },
  { commit: 'f42b160b', pr: 5672 },
  { commit: '327af123', pr: 6073 }
];
const ISSUES = ['3361', '3621', '2215', '941'];

const headers = { 'User-Agent': 'codecompass-hackathon', Accept: 'application/vnd.github+json' };
if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

async function api(url) {
  const res = await fetch(url, { headers });
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get('x-ratelimit-reset');
    throw new Error(`rate limited until ${reset ? new Date(+reset * 1000).toISOString() : 'unknown'}`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
const clean = s => (s || '').replace(/\r/g, '').trim();

async function commentsFor(number) {
  const list = await api(`https://api.github.com/repos/${REPO}/issues/${number}/comments?per_page=30`);
  return (list || []).map(c => ({
    id: String(c.id),
    author: c.user?.login || 'unknown',
    date: c.created_at,
    body: clean(c.body).slice(0, 1600),
    url: c.html_url
  })).filter(c => c.body);
}

(async () => {
  const pulls = {};
  for (const { commit, pr } of PULLS) {
    const data = await api(`https://api.github.com/repos/${REPO}/pulls/${pr}`);
    if (!data) { console.log(`· PR #${pr} missing`); continue; }
    pulls[pr] = {
      number: pr,
      title: data.title,
      url: data.html_url,
      state: data.merged_at ? 'merged' : data.state,
      author: data.user?.login,
      createdAt: data.created_at,
      mergedAt: data.merged_at,
      body: clean(data.body).slice(0, 4000),
      commits: [commit],
      comments: await commentsFor(pr)
    };
    console.log(`✓ PR #${pr} ${data.title.slice(0, 64)} · ${pulls[pr].comments.length} comments`);
  }
  const issues = {};
  for (const n of ISSUES) {
    const iss = await api(`https://api.github.com/repos/${REPO}/issues/${n}`);
    if (!iss) { console.log(`· issue #${n} missing`); continue; }
    issues[n] = {
      number: +n, title: iss.title, url: iss.html_url, state: iss.state,
      author: iss.user?.login, createdAt: iss.created_at,
      body: clean(iss.body).slice(0, 4000), comments: await commentsFor(n)
    };
    console.log(`✓ issue #${n} ${iss.title.slice(0, 64)} · ${issues[n].comments.length} comments`);
  }
  const merged = { pulls: { ...(cache.pulls || {}), ...pulls }, issues: { ...(cache.issues || {}), ...issues } };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(merged, null, 1));
  console.log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });

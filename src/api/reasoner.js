'use strict';
/**
 * CodeCompass reasoner.
 *
 * Deterministic GraphRAG over the ingested decision graph:
 *   question → entities → typed traversal → evidence chain → verdict + confidence
 *
 * No model is called. Every sentence in an answer is either a graph fact or a
 * verbatim quote from a commit / PR / issue, with author, date and URL.
 */

const STOP = new Set(('a an the is are was were be been being do does did doing have has had ' +
  'this that these those it its of for from with without to into in on at by as and or but if then ' +
  'why what how who when where which whom whose can could should would will shall may might must ' +
  'not no yes i we you they he she them us our your their there here about over under again further ' +
  'express code line file please tell explain mean means work works').split(' '));

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const words = s => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const stem = w => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

const GENERIC = new Set(['res', 'req', 'app', 'send', 'set', 'get', 'use', 'function', 'file', 'code', 'line', 'commit', 'change', 'express']);

function tokenize(text) {
  return words(text).filter(w => w.length > 2 && !STOP.has(w) && !GENERIC.has(w)).map(stem);
}

function sentences(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z(])/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 40 && s.length <= 420);
}

const REASON_RE = /\b(because|so that|so as|in order to|to avoid|prevent|instead|reason|since|until|regression|breaking|cve|security|vulnerab|workaround|compat|safe|accident|edge case|otherwise|plan|goal|intent)\b/i;
const META_RE = /^(signed-off-by|co-authored-by|thanks|looks good|lgtm|ping|bump|release \d|v?\d+\.\d+\.\d+)/i;
const PROCESS_RE = /\b(ci|eslint|lint|squash|rebase|merge|review|approved|branch|test suite|coverage|release cycle|semver|changelog|version bump)\b/i;
const SECURITY_RE = /\b(xss|security|bypass|vulnerab|cve|exploit|attack|filter)\b/i;

class Reasoner {
  constructor(graph) {
    this.g = graph;
    this.byId = new Map(graph.nodes.map(n => [n.id, n]));
    this.out = new Map();
    this.inc = new Map();
    for (const e of graph.edges) {
      if (!this.out.has(e.from)) this.out.set(e.from, []);
      if (!this.inc.has(e.to)) this.inc.set(e.to, []);
      this.out.get(e.from).push(e);
      this.inc.get(e.to).push(e);
    }
    this.anchors = graph.nodes.filter(n => n.type === 'config' || n.type === 'api');
    this.people = graph.nodes.filter(n => n.type === 'person');
    this.commits = graph.nodes.filter(n => n.type === 'commit');
    this.commitById = new Map(this.commits.map(c => [c.sha, c]));
    this.docNodes = graph.nodes.filter(n => n.type === 'doc');
    this.buildIndex();
  }

  /* ---------- indexes ---------- */

  buildIndex() {
    this.postings = new Map();
    this.docs = new Map(); // commit sha -> {text, evidence:[{id,text,kind}]}
    this.docTokens = new Map();
    for (const c of this.commits) {
      const ev = [{ id: c.id, text: `${c.label}\n${c.body || ''}`, kind: 'commit' }];
      for (const e of this.out.get(c.id) || []) {
        if (e.type === 'IN_PR' || e.type === 'REFERENCES') {
          const n = this.byId.get(e.to);
          if (!n) continue;
          ev.push({ id: n.id, text: `${n.label}\n${n.body || ''}`, kind: n.type });
          for (const ce of this.out.get(n.id) || []) {
            if (ce.type !== 'HAS_COMMENT') continue;
            const cm = this.byId.get(ce.to);
            if (cm) ev.push({ id: cm.id, text: cm.body || cm.label, kind: 'comment', author: cm.author, date: cm.date, url: cm.url, context: cm.context });
          }
        }
      }
      const text = ev.map(e => e.text).join('\n');
      this.docs.set(c.sha, { text, evidence: ev });
      const seen = new Set();
      const toks = new Set();
      for (const t of tokenize(text)) {
        toks.add(t);
        if (seen.has(t)) continue;
        seen.add(t);
        if (!this.postings.has(t)) this.postings.set(t, []);
        this.postings.get(t).push(c.sha);
      }
      this.docTokens.set(c.sha, toks);
    }
    this.N = this.commits.length;
  }

  idf(term) {
    const df = this.postings.get(term)?.length || 0;
    return Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
  }

  docSearch(terms) {
    if (!terms.length) return [];
    return this.docNodes.map(d => {
      const toks = new Set(tokenize(d.full || d.label));
      let score = 0;
      for (const t of terms) if (toks.has(t)) score += this.idf(t);
      return { doc: d, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map(x => x.doc);
  }

  textScore(sha, terms) {
    const toks = this.docTokens.get(sha);
    if (!toks) return { score: 0, hits: [] };
    let score = 0;
    const hits = [];
    for (const t of terms) {
      if (toks.has(t)) { score += this.idf(t); hits.push(t); }
    }
    return { score, hits };
  }

  /* ---------- linking ---------- */

  link(question) {
    const q = String(question || '').trim();
    const qNorm = norm(q);
    const qWords = new Set(words(q));
    const terms = [...new Set(tokenize(q))];

    const anchors = [];
    for (const a of this.anchors) {
      let best = 0, matchedName = null;
      for (const name of a.names || []) {
        const n = norm(name);
        if (n.length < 4) continue;
        const body = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s_-]+/g, '[\\s._-]?');
        const re = new RegExp(`(^|[^a-z0-9])${body}([^a-z0-9]|$)`, 'i');
        if (re.test(q)) {
          const score = n.length + (n.length >= 8 ? 4 : 0);
          if (score > best) { best = score; matchedName = name; }
        }
      }
      /* config keys with spaces: match any two words */
      if (!best && a.kind === 'config' && a.names?.some(n => n.includes(' '))) {
        const parts = new Set(a.names.join(' ').split(/\s+/).map(norm).filter(Boolean));
        if (parts.size >= 2 && [...parts].every(p => qWords.has(p))) { best = 6; matchedName = a.label; }
      }
      /* morphology: "query parsing" should still reach "query parser" */
      if (!best && a.kind === 'config') {
        for (const name of a.names || []) {
          const toks = name.split(/\s+/).map(norm).filter(t => t.length >= 4);
          if (toks.length >= 2 && toks.every(t => qNorm.includes(t.slice(0, 4)))) { best = 7; matchedName = name; break; }
        }
      }
      if (best) anchors.push({ node: a, score: best, matchedName });
    }
    anchors.sort((x, y) => y.score - x.score);
    /* keep only entities at comparable strength; drop sub-keys of a stronger match */
    const topAnchor = anchors[0]?.score || 0;
    const prunedAnchors = anchors.filter(a => a.score >= Math.max(3, topAnchor * 0.45))
      .filter((a, i, arr) => !arr.some((b, j) => j < i && norm(a.node.label) !== norm(b.node.label) &&
        (norm(a.node.label).startsWith(norm(b.node.label)) || norm(b.node.label).startsWith(norm(a.node.label)))));
    anchors.length = 0;
    anchors.push(...prunedAnchors);

    const files = [];
    for (const f of this.g.nodes) {
      if (f.type !== 'file' || !f.atHead) continue;
      const base = f.label.split('/').pop();
      if (q.includes(f.label) || (base.length > 6 && new RegExp(`(^|[^a-z0-9])${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(q))) {
        files.push({ node: f, score: f.label.length });
      }
    }
    files.sort((x, y) => y.score - x.score);

    const people = [];
    for (const p of this.people) {
      const n = norm(p.label);
      if (n.length >= 7 && qNorm.includes(n)) people.push(p);
    }

    const refs = [];
    for (const m of q.matchAll(/\b([0-9a-f]{7,40})\b/g)) {
      const sha = this.commits.find(c => c.sha.startsWith(m[1]));
      if (sha) refs.push({ kind: 'commit', node: sha });
    }
    for (const m of q.matchAll(/#(\d{1,5})/g)) {
      const n = this.byId.get(`pr:${m[1]}`) || this.byId.get(`issue:${m[1]}`);
      if (n) refs.push({ kind: n.type, node: n });
    }
    for (const m of q.matchAll(/\b(\d{4,6})\b/g)) {
      const n = this.byId.get(`issue:${m[1]}`) || this.byId.get(`pr:${m[1]}`);
      if (n && !refs.some(r => r.node.id === n.id)) refs.push({ kind: n.type, node: n });
    }

    return { q, qNorm, qWords, terms, anchors, files, people, refs };
  }

  /* ---------- candidate generation ---------- */

  candidates(link) {
    const cand = new Map();
    const bump = (sha, amount, why) => {
      if (!this.commitById.has(sha)) return;
      const e = cand.get(sha) || { sha, score: 0, why: new Set(), roles: new Set() };
      e.score += amount;
      if (why) e.why.add(why);
      cand.set(sha, e);
    };

    for (const { node: a, score } of link.anchors) {
      const w = Math.min(3, 1 + score / 12);
      const changed = (this.inc.get(a.id) || []).filter(e => e.type === 'CHANGED')
        .map(e => ({ e, c: this.byId.get(e.from) })).filter(x => x.c)
        .sort((x, y) => (x.c.date || '').localeCompare(y.c.date || ''));
      const uniqChanged = [];
      for (const x of changed) if (!uniqChanged.some(u => u.c.sha === x.c.sha)) uniqChanged.push(x);
      uniqChanged.forEach((x, i) => {
        const latest = i === uniqChanged.length - 1;
        const matchesHead = a.current?.text && x.e.after && norm(x.e.after) === norm(a.current.text);
        bump(x.c.sha, w + (latest ? 3.6 : 0.3) + (matchesHead ? 1.6 : 0), `changed ${a.label}`);
        cand.get(x.c.sha).roles.add(latest ? 'current-definition' : 'earlier-definition');
        if (matchesHead) cand.get(x.c.sha).roles.add('matches-head');
      });
      for (const b of a.blameTop || []) {
        bump(b.sha, w * 0.9 + Math.min(1.2, b.lines / 6), `owns ${a.label}`);
        cand.get(b.sha).roles.add('owns-current-code');
      }
      for (const e of (this.inc.get(a.id) || []).filter(e => e.type === 'MENTIONS')) {
        bump(e.from.replace('commit:', ''), w * 0.45, `mentions ${a.label}`);
      }
      /* decisions that retired or superseded this anchor */
      for (const e of (this.inc.get(a.id) || []).filter(e => e.type === 'SUPERSEDES')) {
        bump(e.from.replace('commit:', ''), 1.6, `supersedes ${a.label}`);
        cand.get(e.from.replace('commit:', '')).roles.add('supersedes');
      }
    }

    for (const { node: f } of link.files) {
      for (const e of (this.inc.get(f.id) || []).filter(e => e.type === 'TOUCHED')) {
        bump(e.from.replace('commit:', ''), 0.8, `touched ${f.label}`);
      }
    }
    for (const p of link.people) {
      for (const e of (this.out.get(p.id) || []).filter(e => e.type === 'AUTHORED_BY')) {
        bump(e.from.replace('commit:', ''), 0.5, `authored by ${p.label}`);
      }
    }
    for (const r of link.refs) {
      if (r.kind === 'commit') bump(r.node.sha, 12, 'explicitly cited');
      else {
        for (const e of (this.inc.get(r.node.id) || []).filter(e => e.type === 'IN_PR' || e.type === 'REFERENCES')) {
          bump(e.from.replace('commit:', ''), 8, `cited ${r.node.type}`);
        }
      }
    }

    /* code comments / literals: the line a term appears on points at the commit that wrote it */
    for (const hit of this.codeHits(link)) {
      if (hit.sha) bump(hit.sha, 0.8 * hit.score + 0.6, `code: ${hit.file}:${hit.line}`);
    }

    /* keyword evidence */
    for (const sha of this.commits.map(c => c.sha)) {
      const { score, hits } = this.textScore(sha, link.terms);
      if (score <= 0) continue;
      const c = this.commitById.get(sha);
      let s = score * 0.55;
      if (hits.length >= 2) s += 0.4;
      if (c.kind === 'docs' || c.kind === 'other') s *= 0.75;
      bump(sha, s, `text: ${hits.slice(0, 3).join(',')}`);
    }

    /* graph provenance boosts */
    for (const [, e] of cand) {
      const c = this.commitById.get(e.sha);
      if (!c) continue;
      const ev = (this.out.get(c.id) || []).map(x => x.type);
      if (ev.includes('IN_PR')) e.score += 1.8;
      if (ev.includes('REFERENCES')) e.score += 1.2;
      e.score += Math.min(1.5, (c.signal || 0) * 0.35);
      const years = (Date.now() - new Date(c.date).getTime()) / (365 * 864e5);
      if (years < 2) e.score += 0.8;
      else if (years > 8) e.score -= 0.3;
    }
    return [...cand.values()].sort((a, b) => b.score - a.score);
  }

  /* ---------- evidence assembly ---------- */

  evidenceFor(sha) {
    const c = this.commitById.get(sha);
    if (!c) return null;
    const out = { commit: c, pr: null, issues: [], comments: [], docs: [], people: [] };
    for (const e of this.out.get(c.id) || []) {
      if (e.type === 'IN_PR') {
        const pr = this.byId.get(e.to);
        if (pr) {
          out.pr = pr;
          for (const ce of this.out.get(pr.id) || []) {
            if (ce.type === 'HAS_COMMENT') {
              const cm = this.byId.get(ce.to);
              if (cm) out.comments.push({ ...cm, context: `PR #${pr.number}` });
            }
          }
        }
      }
      if (e.type === 'REFERENCES') {
        const iss = this.byId.get(e.to);
        if (iss) {
          out.issues.push(iss);
          for (const ce of this.out.get(iss.id) || []) {
            if (ce.type === 'HAS_COMMENT') {
              const cm = this.byId.get(ce.to);
              if (cm) out.comments.push({ ...cm, context: `issue #${iss.number}` });
            }
          }
        }
      }
      if (e.type === 'AUTHORED_BY') {
        const p = this.byId.get(e.to);
        if (p) out.people.push({ person: p, role: 'author' });
      }
    }
    /* issues referenced by the PR body too */
    for (const m of `${out.pr?.body || ''}`.matchAll(/(?:closes|fixes|resolves)\s+#(\d+)/gi)) {
      const iss = this.byId.get(`issue:${m[1]}`);
      if (iss && !out.issues.some(i => i.id === iss.id)) {
        out.issues.push(iss);
        for (const ce of this.out.get(iss.id) || []) {
          if (ce.type === 'HAS_COMMENT') {
            const cm = this.byId.get(ce.to);
            if (cm) out.comments.push({ ...cm, context: `issue #${iss.number}` });
          }
        }
      }
    }
    return out;
  }

  quotesFor(link, sha, anchors) {
    const ev = this.evidenceFor(sha);
    if (!ev) return [];
    const sources = [];
    const push = (kind, node, text, author, date, url, weight) => {
      for (const s of sentences(text)) {
        if (META_RE.test(s)) continue;
        const cleaned = s.replace(/https?:\/\/\S+/g, '[link]').replace(/\s+/g, ' ').trim();
        if (cleaned.length < 40) continue;
        const toks = new Set(tokenize(cleaned));
        let score = weight;
        if (REASON_RE.test(cleaned)) score += 2.2;
        if (SECURITY_RE.test(cleaned)) score += 2.4;
        if (/\bby default\b/i.test(cleaned)) score += 1.0;
        if (/https?:\/\//.test(s)) score -= 0.8;
        if (PROCESS_RE.test(cleaned)) score -= 1.6;
        if (/^[>*+-]\s/.test(cleaned)) score -= 2.2;
        let overlap = 0;
        for (const t of link.terms) if (toks.has(t)) overlap++;
        score += overlap * 0.9;
        for (const a of anchors) if (norm(cleaned).includes(norm(a.node.label))) score += 0.5;
        if (cleaned.length > 300) score -= 0.4;
        sources.push({ kind, nodeId: node.id, text: cleaned, author, date, url, score, context: node.context });
      }
    };
    push('commit', ev.commit, ev.commit.body, ev.commit.author, ev.commit.date, ev.commit.url, 1.4);
    if (ev.pr) push('pr', ev.pr, ev.pr.body, ev.pr.author, ev.pr.date, ev.pr.url, 2.0);
    for (const i of ev.issues) push('issue', i, i.body, i.author, i.date, i.url, 1.8);
    for (const cm of ev.comments) push('comment', cm, cm.body, cm.author, cm.date, cm.url, 1.9);
    /* de-duplicate and prefer one quote per source */
    sources.sort((a, b) => b.score - a.score);
    const perSource = new Map(), seenText = new Set(), out = [];
    for (const s of sources) {
      const used = perSource.get(s.nodeId) || 0;
      if (used >= 2) continue;
      const key = s.text.slice(0, 80);
      if (seenText.has(key)) continue;
      perSource.set(s.nodeId, used + 1);
      seenText.add(key);
      out.push(s);
      if (out.length >= 5) break;
    }
    return out;
  }

  codeHits(link) {
    const out = [];
    for (const [file, text] of Object.entries(this.g.snapshot || {})) {
      if (!text || file.startsWith('__')) continue;
      const rows = this.g.blame?.[file] || [];
      text.split('\n').forEach((line, i) => {
        if (line.trim().length < 8) return;
        const toks = new Set(tokenize(line));
        const hits = link.terms.filter(t => toks.has(t));
        if (!hits.length) return;
        const rare = hits.some(h => this.idf(h) > 4.2);
        if (hits.length < 2 && !rare) return;
        const row = rows.find(r => r.line === i + 1);
        const c = row ? this.commitById.get(row.sha) : null;
        out.push({
          file, line: i + 1, text: line.trim(), sha: row?.sha || null,
          isComment: /^(?:\/\/|\*|\/\*)/.test(line.trim()) || /\b(TODO|NOTE|back-compat|deprecated|must stay|workaround)\b/i.test(line),
          author: c?.author || row?.author, date: c?.date || row?.date,
          subject: c?.label, score: hits.length + (rare ? 1.5 : 0) + (c?.signal || 0) * 0.1
        });
      });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 4);
  }

  docScore(d, anchors, terms) {
    const text = d.full || d.label || '';
    const toks = new Set(tokenize(text));
    const overlap = terms.reduce((s, t) => s + (toks.has(t) ? 1 : 0), 0);
    const named = anchors.some(a => norm(text).includes(norm(a.node.label))) ? 2 : 0;
    const configish = anchors.some(a => norm(text).includes(norm(a.node.label)) &&
      /\bset\(|setting|default|deprecat|ignore|instead|use .* instead|remove|revert/i.test(text)) ? 3 : 0;
    const exactDefault = anchors.some(a => {
      const n = String(a.node.label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`set\\(\\s*['"]${n}['"]`, 'i').test(text) ||
        new RegExp(`${n}.{0,40}default|default.{0,40}${n}`, 'i').test(text);
    }) ? 3 : 0;
    return overlap + named + configish + exactDefault;
  }

  rankDocs(docs, anchors, terms) {
    return [...docs].sort((a, b) => this.docScore(b, anchors, terms) - this.docScore(a, anchors, terms));
  }

  mergeDocs(a, b) {
    const seen = new Set();
    return [...a, ...b].filter(d => (seen.has(d.id) ? false : (seen.add(d.id), true)));
  }

  docsFor(anchors, terms = []) {
    const out = [];
    for (const { node: a } of anchors) {
      for (const e of (this.inc.get(a.id) || []).filter(e => e.type === 'DOCUMENTS')) {
        const d = this.byId.get(e.from);
        if (d && !out.some(x => x.id === d.id)) out.push(d);
      }
    }
    const score = d => {
      const toks = new Set(tokenize(d.full || d.label));
      const overlap = terms.reduce((s, t) => s + (toks.has(t) ? 1 : 0), 0);
      const named = anchors.some(a => norm(d.full || '').includes(norm(a.node.label))) ? 2 : 0;
      const changeish = /default|setting|deprecat|ignore|remove|instead|revert/i.test(d.full || '') ? 1.2 : 0;
      return overlap + named + changeish;
    };
    return out.sort((a, b) => score(b) - score(a)).slice(0, 4);
  }

  ownersFor(anchors, primary = null, quotes = []) {
    const scored = new Map();
    const add = (person, score, role, file) => {
      if (!person) return null;
      const rec = scored.get(person.id) || { person, score: 0, files: new Set(), roles: [] };
      rec.score += score;
      if (role && !rec.roles.includes(role)) rec.roles.push(role);
      if (file) rec.files.add(file);
      scored.set(person.id, rec);
      return rec;
    };
    if (primary) {
      const p = this.personFor(primary.author);
      if (p) add(p, 6, `wrote ${primary.short}`);
    }
    for (const { node: a } of anchors) {
      const changed = (this.inc.get(a.id) || []).filter(e => e.type === 'CHANGED')
        .map(e => this.byId.get(e.from)).filter(Boolean)
        .sort((x, y) => (y.date || '').localeCompare(x.date || '')).slice(0, 4);
      for (const c of changed) {
        const p = this.personFor(c.author);
        if (p) add(p, 1.8, `changed ${a.label} in ${c.short}`);
      }
    }
    for (const q of new Set(quotes.filter(q => q.kind !== 'commit').map(q => q.author))) {
      const p = this.personFor(q);
      if (p) add(p, 3 + Math.min(3, Math.log10((p.commits || 1) + 1)), 'in the recorded discussion');
    }
    for (const { node: a } of anchors) {
      for (const f of a.files || []) {
        const fid = `file:${f}`;
        for (const e of (this.inc.get(fid) || []).filter(x => x.type === 'OWNS')) {
          const p = this.byId.get(e.from);
          if (!p) continue;
          const years = (Date.now() - new Date(p.last).getTime()) / 3.15e10;
          const recency = years < 2 ? 1 : years < 6 ? 0.6 : 0.25;
          const rec = add(p, Math.min(3, Math.log2((e.commits || 1) + 1)) * recency, `owns ${f}`, f);
        }
      }
    }
    return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 3);
  }

  personFor(name) {
    const n = norm(name);
    if (!n) return null;
    const cands = this.people.filter(p => {
      const np = norm(p.label);
      const ne = norm(p.email || '');
      const nl = norm(p.login || '');
      if (np === n || ne.includes(n) || (nl && nl === n)) return true;
      if (n.length >= 6 && np.length >= 6) {
        return np.includes(n.slice(0, 4)) && np.includes(n.slice(-4));
      }
      return false;
    });
    return cands.sort((a, b) => (b.commits || 0) - (a.commits || 0))[0] || null;
  }

  /* ---------- supersession ---------- */

  timelineFor(anchors) {
    const rows = [];
    for (const { node: a } of anchors) {
      for (const e of (this.inc.get(a.id) || []).filter(x => x.type === 'CHANGED')) {
        const c = this.byId.get(e.from);
        if (!c) continue;
        rows.push({ anchor: a, commit: c, before: e.before, after: e.after });
      }
    }
    rows.sort((a, b) => (a.commit.date || '').localeCompare(b.commit.date || ''));
    return rows;
  }

  supersessionFor(sha, anchors) {
    const c = this.commitById.get(sha);
    const out = { revertedBy: null, supersededBy: [], supersedes: [], retiredNames: [] };
    if (c?.revertedBy) out.revertedBy = this.commitById.get(c.revertedBy) || null;
    for (const e of this.out.get(`commit:${sha}`) || []) {
      if (e.type === 'SUPERSEDES') {
        const t = this.byId.get(e.to);
        if (t?.type === 'commit') out.supersedes.push({ commit: t, kind: e.kind, anchor: e.anchor });
      }
    }
    for (const e of this.inc.get(`commit:${sha}`) || []) {
      if (e.type === 'SUPERSEDES') {
        const t = this.byId.get(e.from);
        if (t?.type === 'commit') out.supersededBy.push({ commit: t, kind: e.kind, anchor: e.anchor });
      }
    }
    for (const { node: a } of anchors) {
      for (const r of a.retiredNames || []) if (r.removedBy === sha) out.retiredNames.push({ ...r, anchor: a });
    }
    return out;
  }

  /* ---------- answer ---------- */

  askWho(link, anchors) {
    const cands = this.candidates(link).slice(0, 3);
    const anchor = anchors[0]?.node || null;
    const primary = (anchor && this.governingFor(anchor)) || this.commitById.get(cands[0]?.sha) || null;
    const quotes = primary ? this.quotesFor(link, primary.sha, anchors) : [];
    const owners = this.ownersFor(anchors, primary, quotes);
    if (!owners.length) return this.refuse(link, cands);
    const top = owners[0];
    const person = top.person;
    const said = quotes.find(q => this.personFor(q.author)?.id === person.id);
    const files = [...top.files];
    return {
      question: link.q,
      kind: 'person',
      verdict: `Ask ${person.label}.`,
      detail: [
        `${person.label} has ${(person.commits || 0).toLocaleString()} commits in ${this.g.meta.repo}, last active ${fmtDate(person.last)}.`,
        anchors[0] ? `The graph connects them to \`${anchors[0].node.label}\`: ${top.roles.join('; ')}.` : top.roles.join('; ') + '.',
        files.length ? `Deepest ownership: ${files.slice(0, 3).map(f => `\`${f}\``).join(', ')}.` : '',
        said ? `In the thread they said: “${clip(said.text, 220)}”` : ''
      ].filter(Boolean).join(' '),
      anchor: anchors[0] ? this.publicAnchor(anchors[0].node) : null,
      primary: primary ? this.publicCommit(primary) : null,
      people: owners.map(o => ({
        name: o.person.label, email: o.person.email, roles: o.roles,
        files: [...o.files].slice(0, 4), commits: o.person.commits, last: o.person.last, score: Math.round(o.score)
      })),
      owners: owners.map(o => ({ name: o.person.label, roles: o.roles, files: [...o.files], score: Math.round(o.score) })),
      quotes: quotes.map(q => ({ kind: q.kind, text: q.text, author: q.author, date: q.date, url: q.url, context: q.context })),
      docs: [], timeline: [], docGap: false,
      confidence: { score: 84, band: 'high', reasons: [
        { op: '+', text: 'person linked through authorship, discussion and file ownership' },
        { op: '+', text: 'every role is a typed edge in the graph' }
      ] },
      followups: primary ? [`What did ${person.label} change in ${primary.short}?`, 'Which files have they owned longest?', `What else landed around ${primary.short}?`] : [],
      graph: this.subgraph([person.id, ...anchors.map(a => a.node.id), ...(primary ? [primary.id] : [])])
    };
  }

  ask(question) {
    const link = this.link(question);
    const cands = this.candidates(link).slice(0, 8);
    const top = cands[0];
    const anchors = link.anchors.slice(0, 3);

    const whoIntent = /^(who|whom|owner|maintainer)\b/i.test(link.q.trim()) || /\bwho (should|do) (i|we) ask\b/i.test(link.q);
    if (whoIntent) return this.askWho(link, anchors);

    /* HONESTY GATE: a shared word is not evidence.
       Without an entity, a cited thread, a CVE id, a file or a near-verbatim subject,
       the graph does not contain an answer — say so. */
    const hasCve = /\bcve-\d{4}-\d+/i.test(link.q);
    const hasQuoted = /`[^`]{3,}`/.test(link.q);
    const nearVerbatim = top && this.commitById.get(top.sha) &&
      norm(link.q).includes(norm(this.commitById.get(top.sha).label)) && norm(this.commitById.get(top.sha).label).length > 18;
    const named = anchors.length || link.refs.length || link.files.length || hasCve || hasQuoted || nearVerbatim;
    if (!named) {
      return this.refuse(link, cands, { nearest: this.commitById.get(top.sha), reason: 'Only generic words matched; no entity, thread or identifier anchors the question.' });
    }

    if (!top || (top.score < 2.2 && !anchors.length && !link.refs.length)) {
      return this.refuse(link, cands);
    }

    let primary = this.commitById.get(top.sha);
    let reversal = null;
    let retired = null;
    let supersededBy = null;

    /* A. the candidate is itself a revert: the story is the reversal */
    const revEdge = (this.out.get(primary.id) || []).find(e => e.type === 'REVERTS');
    if (revEdge) {
      const target = this.commitById.get(revEdge.to.replace('commit:', ''));
      if (target) reversal = { reverted: target, revert: primary };
    }
    /* B. the candidate was reverted: lead with the revert */
    if (!reversal && primary.revertedBy) {
      const r = this.commitById.get(primary.revertedBy);
      if (r) { reversal = { reverted: primary, revert: r }; primary = r; }
    }

    /* C. a retired spelling (res.sendfile → res.sendFile) */
    const renameIntent = /\b(rename|renamed|replace|replaced|remove|removed|deprecat|legacy|old|no longer)\b/i.test(link.q);
    if (!reversal) {
      for (const { node: a } of anchors) {
        for (const r of a.retiredNames || []) {
          if (renameIntent || link.qNorm.includes(norm(r.name))) {
            const c = this.commitById.get(r.removedBy);
            if (c) { retired = { ...r, anchor: a }; primary = c; break; }
          }
        }
        if (retired) break;
      }
    }

    /* D. a newer decision explicitly supersedes the candidate */
    const sup = this.supersessionFor(primary.sha, anchors);
    if (!reversal && !retired && sup.supersededBy.length) {
      const newer = sup.supersededBy.map(s => s.commit).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
      if (newer && newer.sha !== primary.sha) { supersededBy = primary; primary = newer; }
    }

    const quotes = this.quotesFor(link, primary.sha, anchors);
    const refCommit = link.refs.find(r => r.kind === 'commit')?.node || null;
    const docTerms = refCommit ? tokenize(`${refCommit.label} ${refCommit.body || ''}`) : [...link.terms, ...tokenize(primary.label)];
    let docs = this.mergeDocs(this.docsFor(anchors, docTerms), this.docSearch(docTerms));
    docs = this.rankDocs(docs, anchors, docTerms);
    const docFloor = anchors.length ? 2.5 : 1;
    docs = docs.filter(d => this.docScore(d, anchors, docTerms) >= docFloor).slice(0, 4);
    const coded = this.codeHits(link).filter(h => h.sha && h.isComment).slice(0, 2);
    if (reversal && docs.length) {
      const rank = d => (/rejected|erroneous|no longer/i.test(d.full || '') ? 2 : 0) + (/revert/i.test(d.full || '') ? 1 : 0);
      docs = [...docs].sort((a, b) => rank(b) - rank(a));
    }
    if (retired && docs.length) {
      const rank = d => (/use .* instead/i.test(d.full || '') ? 3 : 0) + (/deprecat/i.test(d.full || '') ? 2 : 0) + (norm(d.full || '').includes(norm(retired.name)) ? 2 : 0);
      docs = [...docs].sort((a, b) => rank(b) - rank(a));
    }
    const owners = this.ownersFor(anchors, primary, quotes);
    const timeline = this.timelineFor(anchors);
    const supFinal = this.supersessionFor(primary.sha, anchors);

    const primaryAnchor = anchors[0]?.node || null;
    const currentValue = primaryAnchor ? this.currentValue(primaryAnchor) : null;
    const docGap = docs.length === 0;

    const confidence = this.confidence({
      link, primary, quotes, docs, owners, reversal, supersededBy, retired
    });

    const answer = this.compose({
      question, link, primary, reversal, supersededBy, retired, quotes, docs, owners,
      anchor: primaryAnchor, currentValue, timeline, sup: supFinal, docGap, codeEvidence: coded
    });

    if (confidence.score < 32) {
      return this.refuse(link, cands, { nearest: primary, reason: 'Evidence found, but too thin to stand behind.' });
    }

    return {
      question,
      kind: reversal ? 'superseded' : retired ? 'retired' : supersededBy ? 'updated' : primaryAnchor ? 'decision' : 'commit',
      verdict: answer.verdict,
      detail: answer.detail,
      anchor: primaryAnchor ? this.publicAnchor(primaryAnchor) : null,
      primary: this.publicCommit(primary),
      reverted: reversal ? this.publicCommit(reversal.reverted) : null,
      revertCommit: reversal ? this.publicCommit(reversal.revert) : null,
      retired: retired ? { name: retired.name, removedBy: retired.removedBy, addedBy: retired.addedBy, date: retired.date } : null,
      supersededBy: supersededBy ? this.publicCommit(supersededBy) : null,
      timeline: timeline.map(t => ({
        sha: t.commit.sha, short: t.commit.short, date: t.commit.date, subject: t.commit.label,
        before: t.before, after: t.after, url: t.commit.url
      })),
      quotes: quotes.map(q => ({
        kind: q.kind, text: q.text, author: q.author, date: q.date, url: q.url, context: q.context
      })),
      docs: docs.map(d => ({ text: d.full || d.label, file: d.file, line: d.line, url: this.docUrl(d) })),
      codeEvidence: coded.map(h => ({ file: h.file, line: h.line, text: h.text, sha: h.sha, author: h.author, date: h.date })),
      docGap,
      owners: owners.map(o => ({ name: o.person.label, email: o.person.email, files: [...o.files], roles: o.roles, score: Math.round(o.score) })),
      confidence,
      followups: this.followups(link, primary, anchors, owners),
      graph: this.subgraph([primary.id, reversal?.reverted?.id, ...anchors.map(a => a.node.id)]),
      candidates: cands.slice(0, 5).map(c => ({ sha: this.commitById.get(c.sha)?.short, subject: this.commitById.get(c.sha)?.label, score: +c.score.toFixed(2) }))
    };
  }

  publicCommit(c) {
    return {
      sha: c.sha, short: c.short, subject: c.label, body: c.body, author: c.author,
      email: c.email, date: c.date, kind: c.kind, url: c.url, pr: c.pr,
      files: c.files, add: c.add, del: c.del, revertedBy: c.revertedBy
    };
  }

  publicAnchor(a) {
    return {
      id: a.id, label: a.label, kind: a.kind, canonical: a.canonical,
      names: a.names, current: a.current, file: a.current?.file, line: a.current?.line,
      span: a.span, historicalOnly: a.historicalOnly, firstSeen: a.firstSeen, lastSeen: a.lastSeen
    };
  }

  currentValue(a) {
    const line = a.current?.text || '';
    const m = line.match(/\.(set|enable|disable)\(\s*['"]([^'"]+)['"]\s*(?:,\s*(.+?))?\)/);
    if (m) {
      if (m[1] === 'enable') return 'enabled';
      if (m[1] === 'disable') return 'disabled';
      return (m[3] || '').trim();
    }
    return a.current?.text?.slice(0, 120) || null;
  }

  compose(ctx) {
    const { primary, reversal, retired, supersededBy, quotes, docs, owners, anchor, currentValue, codeEvidence } = ctx;
    const date = fmtDate(primary.date);
    const first = quotes[0];
    const key = anchor ? `\`${anchor.label}\`` : null;

    /* 1. a reversal: never present the dead decision as current truth */
    if (reversal) {
      const { reverted, revert } = reversal;
      const doc = docs.find(d => /revert|reject|erroneous|no longer/i.test(d.full || ''));
      const verdict = revert.sha === reverted.sha
        ? `This decision no longer governs the code. It was reverted on ${fmtDate(revert.date)} (${revert.short}).`
        : `That decision no longer governs the code. ${reverted.short} was reverted on ${fmtDate(revert.date)} by ${revert.short} (${revert.author})` +
          (anchor && currentValue ? `, so \`${anchor.label}\` is back to the earlier behaviour.` : '.');
      const detail = [
        doc ? `Release notes confirm it: “${clip(doc.full, 260)}”` : null,
        first && first.kind !== 'commit' ? `From the thread: “${clip(first.text, 220)}”` : null,
        `The revert is an explicit REVERTS edge in the graph — the original commit is still in history, but it is marked as dead.`
      ].filter(Boolean).join(' ');
      return { verdict, detail };
    }

    /* 2. a retired spelling */
    if (retired) {
      const added = retired.addedBy ? this.commitById.get(retired.addedBy) : null;
      const deprecated = this.commits
        .filter(c => /deprecat/i.test(c.label) && norm(c.label).includes(norm(retired.name)) && c.date <= retired.date)
        .sort((a, b) => (a.date || '').localeCompare(b.date || '')).pop();
      return {
        verdict: `\`${retired.name}\` no longer exists. It was retired on ${fmtDate(retired.date)} by ${primary.short}, and the surviving name is \`${anchor?.canonical || 'the current spelling'}\`.`,
        detail: [
          added ? `It was introduced in ${added.short} (${fmtDate(added.date)}).` : null,
          deprecated ? `It was deprecated first in ${deprecated.short} (${fmtDate(deprecated.date)}), then removed — a real deprecation cycle, not a silent rename.` : null,
          first ? `Recorded reason: “${clip(first.text, 260)}”` : `The graph links both spellings to one entity, so the old name still resolves — you get a supersession warning instead of stale advice.`
        ].filter(Boolean).join(' ')
      };
    }

    /* 3. a newer decision overrides an older one */
    if (supersededBy) {
      const value = anchor?.kind === 'config' && currentValue ? currentValue.replace(/^['"]|['"]$/g, '') : null;
      return {
        verdict: `${key || 'This'}${value ? ` is \`${value}\`` : ''} today. That was set on ${date} in ${primary.short} (${primary.author}), replacing the decision from ${fmtDate(supersededBy.date)}.`,
        detail: [
          first ? `Recorded reason: “${clip(first.text, 280)}”` : '',
          `The older decision (${supersededBy.short}) is kept as history, but it is not the current answer.`
        ].filter(Boolean).join(' ')
      };
    }

    /* 4. anchor question */
    if (anchor) {
      const isConfig = anchor.kind === 'config';
      const value = isConfig && currentValue ? currentValue.replace(/^['"]|['"]$/g, '') : null;
      const setter = (ctx.timeline || []).filter(t => t.commit.sha === primary.sha && t.after).pop();
      const lastSet = (ctx.timeline || []).filter(t => t.after).pop();
      let verdict;
      if (!isConfig) {
        verdict = `${key} is defined at ${anchor.current?.file || 'the source'}:${anchor.current?.line || '?'} and last changed on ${date} in ${primary.short} (${primary.author}).`;
      } else if (setter) {
        verdict = `${key} is currently \`${value || 'set'}\`. That value was chosen on ${date} in ${primary.short} (${primary.author}).`;
      } else if (lastSet) {
        verdict = `${key} is currently \`${value || 'set'}\`, set in ${lastSet.commit.short} (${fmtDate(lastSet.commit.date)}). The most recent decision shaping it is ${primary.short} on ${date} (${primary.author}).`;
      } else {
        verdict = `${key} is currently \`${value || 'set'}\`.`;
      }
      const detail = [
        first ? `Recorded reason: “${clip(first.text, 280)}”` : `No rationale was recorded in the commit, PR or issue text.`,
        !first && codeEvidence?.length ? `The code itself records it at \`${codeEvidence[0].file}:${codeEvidence[0].line}\`: “${clip(codeEvidence[0].text, 160)}”` : null,
        docs.length ? `Documentation says: “${clip(docs[0].full, 150)}” — it records the what, not the why.` : `No documentation mentions ${key}; the reasoning exists only in the history.`,
        owners[0] ? `${owners[0].person.label} has the deepest ownership of the touched files — the person to ask.` : null
      ].filter(Boolean).join(' ');
      return { verdict, detail };
    }

    /* 5. plain commit question */
    return {
      verdict: `${primary.short} — “${primary.label}” (${primary.author}, ${date}).`,
      detail: [first ? `Recorded reason: “${clip(first.text, 300)}”` : `No explanatory text survives in the graph; confidence is limited to what the commit touched.`,
        docs.length ? `Docs: “${clip(docs[0].full, 150)}”` : null].filter(Boolean).join(' ')
    };
  }

  confidence({ link, primary, quotes, docs, owners, reversal, supersededBy, retired }) {
    const reasons = [];
    let score = 0;
    if (link.anchors.length) { score += 22; reasons.push({ op: '+', text: `linked to ${link.anchors.length} graph entit${link.anchors.length > 1 ? 'ies' : 'y'}` }); }
    else if (link.refs.length) { score += 20; reasons.push({ op: '+', text: 'question cites a commit or thread' }); }
    else { score += 8; reasons.push({ op: '+', text: 'keyword match only, no named entity' }); }

    if (primary) { score += 12; reasons.push({ op: '+', text: 'a governing commit was found on the HEAD history' }); }
    if (quotes.length) { score += 14 + Math.min(8, quotes.length * 3); reasons.push({ op: '+', text: `${quotes.length} verbatim rationale quote${quotes.length > 1 ? 's' : ''}` }); }
    else { reasons.push({ op: '−', text: 'no recorded rationale — commit text is empty of explanation' }); }
    const ev = this.evidenceFor(primary?.sha);
    if (ev?.pr || ev?.issues?.length) { score += 12; reasons.push({ op: '+', text: 'linked PR / issue discussion' }); }
    else { reasons.push({ op: '−', text: 'no linked PR or issue in the cache' }); }
    if (docs.length) { score += 8; reasons.push({ op: '+', text: `documentation corroborates (${docs[0].file}:${docs[0].line})` }); }
    else { reasons.push({ op: '−', text: 'documentation is silent on this decision' }); }
    if (owners.length) { score += 6; reasons.push({ op: '+', text: `owner identified: ${owners[0].person.label}` }); }
    if (reversal) {
      if (docs.length) { score += 6; reasons.push({ op: '+', text: 'release notes confirm the reversal' }); }
      else { score -= 6; reasons.push({ op: '−', text: 'the decision was reverted; the answer leads with the reversal' }); }
    }
    if (retired) { score += docs.length ? 10 : 3; reasons.push({ op: '+', text: 'both spellings resolve to one entity (rename detected)' }); }
    if (supersededBy) { score -= 4; reasons.push({ op: '−', text: 'an older decision was superseded; ambiguity resolved by date' }); }
    if (primary && (Date.now() - new Date(primary.date).getTime()) / 3.15e10 > 6 && !quotes.length) { score -= 8; reasons.push({ op: '−', text: 'old commit with no surviving discussion' }); }

    score = Math.max(4, Math.min(96, Math.round(score)));
    const band = score >= 75 ? 'high' : score >= 50 ? 'medium' : score >= 32 ? 'low' : 'refuse';
    return { score, band, reasons };
  }

  refuse(link, cands, opts = {}) {
    const unknown = link.terms.filter(t => !this.postings.has(t)).slice(0, 4);
    const named = [...(link.q.match(/\b(?:redis|kafka|mongodb|postgres|docker|kubernetes|graphql|grpc|oauth|jwt|websocket|lambda|s3)\b/gi) || [])];
    const missing = [];
    if (named.length) missing.push(`No node for ${[...new Set(named)].map(n => `\`${n}\``).join(', ')}`);
    if (link.anchors.length === 0) missing.push('No file, config key or API member from the question is in this graph');
    if (unknown.length) missing.push(`Terms with zero occurrences: ${unknown.map(t => `\`${t}\``).join(', ')}`);
    missing.push('No commit, PR or issue text that records a decision about it');
    return {
      question: link.q,
      kind: 'refusal',
      refusal: true,
      verdict: 'I do not have evidence for that, so I am not going to invent an answer.',
      detail: `The graph contains ${this.g.meta.commits.toLocaleString()} commits and ${this.g.meta.anchors} code entities from ${this.g.meta.repo}, but none of them connect to this question.`,
      missing,
      suggestions: [
        'Why does Express default the query parser to simple?',
        'Why does res.clearCookie ignore expires and maxAge?',
        'Who should I ask about query parsing?'
      ],
      nearest: opts.nearest ? [{ sha: opts.nearest.short, subject: opts.nearest.label, why: 'closest commit, not evidence' }] : [],
      confidence: { score: 6, band: 'refuse', reasons: [{ op: '−', text: 'no entity link and no decision text above threshold' }] },
      graph: { nodes: [], edges: [] }
    };
  }

  followups(link, primary, anchors, owners) {
    const out = [];
    const a = anchors[0]?.node;
    if (a?.files?.length) out.push(`Which commits changed ${a.files[0]} most recently?`);
    if (owners[0]) out.push(`What else has ${owners[0].person.label} decided in this repository?`);
    const sup = (this.inc.get(`commit:${primary.sha}`) || []).filter(e => e.type === 'SUPERSEDES');
    if (sup.length) out.push('What did the decision that this replaced say?');
    if (primary.pr) out.push(`What did reviewers say on PR #${primary.pr}?`);
    out.push(`What else landed within 30 days of ${primary.short}?`);
    return [...new Set(out)].slice(0, 3);
  }

  docUrl(d) {
    const remote = this.g.meta.remote?.replace(/\.git$/, '') || '';
    return remote ? `${remote}/blob/${this.g.meta.head.slice(0, 12)}/${d.file}#L${d.line}` : null;
  }

  subgraph(ids) {
    const keep = new Set(ids.filter(Boolean));
    for (const id of [...keep]) {
      for (const e of this.out.get(id) || []) {
        if (['CHANGED', 'MENTIONS', 'SUPERSEDES', 'REVERTS', 'IN_PR', 'REFERENCES', 'AUTHORED_BY', 'DOCUMENTS', 'DECLARED_IN'].includes(e.type)) {
          if (['IN_PR', 'REFERENCES', 'DOCUMENTS'].includes(e.type)) keep.add(e.to);
          if (['AUTHORED_BY', 'SUPERSEDES'].includes(e.type)) keep.add(e.to);
          if (e.type === 'CHANGED' && keep.size < 20) keep.add(e.from);
        }
      }
      for (const e of this.inc.get(id) || []) {
        if (['HAS_COMMENT', 'CHANGED', 'MENTIONS'].includes(e.type)) keep.add(e.from);
      }
    }
    const nodes = [...keep].map(id => this.byId.get(id)).filter(Boolean).slice(0, 26);
    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = this.g.edges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to) &&
      ['CHANGED', 'MENTIONS', 'SUPERSEDES', 'REVERTS', 'IN_PR', 'REFERENCES', 'AUTHORED_BY', 'DOCUMENTS', 'DECLARED_IN', 'HAS_COMMENT'].includes(e.type))
      .slice(0, 48);
    return { nodes, edges };
  }

  /* ---------- line-level ---------- */

  explainLine(file, line) {
    const rows = this.g.blame?.[file] || [];
    const row = rows.find(r => r.line === line);
    if (!row) {
      return { error: 'No blame data for that line.', file, line, refusal: true };
    }
    const exactConfig = this.anchors.find(a => a.kind === 'config' && a.current?.file === file && a.current?.line === line);
    const containing = this.anchors.filter(a => a.span && a.span.file === file && line >= a.span.start && line <= a.span.end);
    const anchor = exactConfig || containing.sort((a, b) => (a.span.end - a.span.start) - (b.span.end - b.span.start))[0];
    const lineCommit = this.commitById.get(row.sha);
    if (!lineCommit) return { error: 'That line is attributed to a commit outside the ingested history.', file, line };

    /* the commit that wrote this line is not always the decision that governs it */
    let governing = lineCommit;
    if (anchor) governing = this.governingFor(anchor) || lineCommit;
    const primary = governing;
    const link = { terms: tokenize(`${anchor?.label || ''} ${file}`), anchors: anchor ? [{ node: anchor }] : [], refs: [], files: [], people: [], q: '' };
    const quotes = this.quotesFor(link, primary.sha, anchor ? [{ node: anchor }] : []);
    const ownersRaw = this.ownersFor(anchor ? [{ node: anchor }] : [], primary, quotes);
    const anchorOwners = ownersRaw.length ? ownersRaw : this.fileOwners(file);
    const docs = anchor ? this.docsFor([{ node: anchor }], link.terms) : [];
    const reversal = primary.revertedBy ? { reverted: this.commitById.get(primary.revertedBy), revert: primary } : null;
    const confidence = this.confidence({ link, primary, quotes, docs, owners: anchorOwners, reversal, supersededBy: null, retired: null });
    return {
      file, line,
      text: (this.g.snapshot[file] || '').split('\n')[line - 1] || '',
      anchor: anchor ? this.publicAnchor(anchor) : null,
      primary: this.publicCommit(primary),
      lineCommit: this.publicCommit(lineCommit),
      governing: primary.sha !== lineCommit.sha,
      authors: [{ name: row.author, date: row.date }],
      quotes: quotes.map(q => ({ kind: q.kind, text: q.text, author: q.author, date: q.date, url: q.url, context: q.context })),
      owners: anchorOwners.map(o => ({ name: o.person.label, files: [...o.files], roles: o.roles, score: Math.round(o.score) })),
      docs: docs.map(d => ({ text: d.full, file: d.file, line: d.line, url: this.docUrl(d) })),
      reverted: reversal ? this.publicCommit(reversal.reverted) : null,
      confidence,
      graph: this.subgraph([primary.id, lineCommit.id, anchor?.id].filter(Boolean))
    };
  }

  governingFor(anchor) {
    const pool = new Map();
    const bump = (sha, score) => {
      const c = this.commitById.get(sha);
      if (!c) return;
      pool.set(sha, Math.max(pool.get(sha) || 0, score));
    };
    const years = d => Math.max(0, 1 - (Date.now() - new Date(d).getTime()) / (8 * 3.15e10));
    for (const b of anchor.blameTop || []) {
      const ev = this.evidenceFor(b.sha);
      const bonus = (ev?.pr ? 2 : 0) + (ev?.issues?.length ? 1.2 : 0) + Math.min(1.5, (this.commitById.get(b.sha)?.signal || 0) / 3);
      bump(b.sha, years(b.date) * 3 + bonus + Math.min(1.5, b.lines / 8));
    }
    const changed = (this.inc.get(anchor.id) || []).filter(e => e.type === 'CHANGED')
      .map(e => this.byId.get(e.from)).filter(Boolean)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const latest = changed[changed.length - 1];
    if (latest) {
      const ev = this.evidenceFor(latest.sha);
      bump(latest.sha, years(latest.date) * 3 + (ev?.pr ? 2 : 0) + (ev?.issues?.length ? 1.2 : 0) + 1.4);
    }
    const best = [...pool.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? this.commitById.get(best[0]) : null;
  }

  fileOwners(file) {
    const fid = `file:${file}`;
    return (this.inc.get(fid) || []).filter(e => e.type === 'OWNS')
      .map(e => ({ person: this.byId.get(e.from), score: e.commits, files: new Set([file]) }))
      .filter(x => x.person).sort((a, b) => b.score - a.score).slice(0, 3);
  }

  /* ---------- browse ---------- */

  overview() {
    const NOISY = new Set(['env', 'views', 'home', 'viewengine', 'locals', 'header', 'render', 'download', 'basepath', 'charset', 'root', 'foo', 'hints', 'set', 'get', 'use', 'all', 'listen', 'engine', 'init', 'handle', 'path', 'next', 'end', 'body', 'headers', 'query', 'params', 'app', 'req', 'res', 'viewreloading', 'reloadviews', 'partials', 'cacheviews', 'viewoptions', 'streamthreshold', 'jsonpcallback']);
    const FEATURED = ['query parser', 'etag', 'trust proxy', 'x-powered-by', 'json escape', 'view cache', 'subdomain offset', 'sendFile', 'clearCookie', 'view engine'];
    const pool = this.anchors.filter(a => !NOISY.has(String(a.label).toLowerCase()) && !/ fn$/i.test(a.label));
    const picked = [];
    for (const name of FEATURED) {
      const want = name.toLowerCase();
      const hit = pool.find(a => String(a.label).toLowerCase() === want ||
        (a.names || []).some(nm => String(nm).toLowerCase() === want));
      if (hit) picked.push(hit);
    }
    const anchors = picked.slice(0, 12)
      .map(a => ({ id: a.id, label: a.label, kind: a.kind, changes: (a.timeline || []).length, live: !a.historicalOnly, file: a.current?.file }));
    const hot = this.g.nodes.filter(n => n.type === 'file' && n.atHead)
      .sort((a, b) => b.touches - a.touches).slice(0, 12)
      .map(f => ({ id: f.id, label: f.label, touches: f.touches, authors: f.authors }));
    const people = this.people.slice().sort((a, b) => b.commits - a.commits).slice(0, 10)
      .map(p => ({ id: p.id, name: p.label, commits: p.commits, last: p.last }));
    const recent = this.commits.slice(-12).reverse().map(c => ({
      id: c.id, sha: c.short, subject: c.label, date: c.date, author: c.author, kind: c.kind, url: c.url
    }));
    return { meta: this.g.meta, anchors, hot, people, recent };
  }

  entity(id) {
    const n = this.byId.get(id);
    if (!n) return null;
    const out = (this.out.get(id) || []).map(e => ({ type: e.type, node: this.brief(this.byId.get(e.to)), props: pickProps(e) }));
    const inc = (this.inc.get(id) || []).map(e => ({ type: e.type, node: this.brief(this.byId.get(e.from)), props: pickProps(e) }));
    return { node: n, out, in: inc };
  }

  brief(n) {
    if (!n) return null;
    return { id: n.id, type: n.type, label: n.label, date: n.date, author: n.author, url: n.url, sha: n.sha ? n.sha.slice(0, 8) : undefined };
  }

  search(q) {
    const t = q.toLowerCase();
    const hits = this.g.nodes.filter(n => ['anchor', 'config', 'api', 'file', 'person', 'commit'].includes(n.type) || n.type === 'config' || n.type === 'api')
      .filter(n => (n.label || '').toLowerCase().includes(t) || (n.sha || '').startsWith(t) || (n.names || []).some(x => x.toLowerCase().includes(t)))
      .slice(0, 24)
      .map(n => ({ id: n.id, type: n.type, label: n.label, sub: n.type === 'commit' ? `${n.short} · ${n.date?.slice(0, 10)}` : n.current?.file || n.url || '' }));
    return hits;
  }
}

const fmtDate = s => {
  if (!s) return 'unknown date';
  const d = new Date(s);
  if (Number.isNaN(+d)) return s;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const clip = (s, n) => {
  const t = String(s || '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};
const pickProps = e => {
  const o = {};
  for (const k of ['before', 'after', 'kind', 'count', 'snippet', 'anchor', 'commits']) if (e[k] != null) o[k] = e[k];
  return o;
};

module.exports = { Reasoner };

'use strict';
/**
 * Trust harness — a fixed set of questions with expected evidence.
 * This is deliberately allowed to fail: a green dashboard that hides a miss
 * would be worse than no dashboard.
 */

const CASES = [
  {
    id: 'query-parser-default',
    q: 'Why does Express default the query parser to simple?',
    expect: { kind: 'decision', primary: '450c468d', minConf: 70, quote: /xss|security|bypass|query string parsing/i, docs: /query parser/i },
    note: 'The governing commit and the security thread that produced it.'
  },
  {
    id: 'clearcookie-ignore',
    q: 'Why does res.clearCookie ignore expires and maxAge?',
    expect: { primary: '82fc12a4', minConf: 70, quote: /maxAge|relative|delete a cookie/i, docs: /clearCookie/i },
    note: 'Body-level change found through function-span blame, not a signature diff.'
  },
  {
    id: 'cve-reversal',
    q: 'What happened to the CVE-2024-51999 patch?',
    expect: { kind: 'superseded', primary: '697547cd', reverted: '2f64f68c', doc: /rejected|erroneous/i },
    note: 'The security patch was reverted the same day; the answer must lead with the reversal.'
  },
  {
    id: 'sendfile-rename',
    q: 'Why was res.sendfile replaced by res.sendFile?',
    expect: { kind: 'retired', retired: 'sendfile', canonical: 'sendFile' },
    note: 'Entity resolution across two spellings plus a deprecation cycle.'
  },
  {
    id: 'who-query-parser',
    q: 'Who should I ask about query parsing?',
    expect: { kind: 'person', person: /Douglas/i },
    note: 'Person-to-ask is a graph answer: authorship + thread + ownership.'
  },
  {
    id: 'who-clearcookie',
    q: 'Who should I ask about res.clearCookie?',
    expect: { kind: 'person', person: /Jon Church/i },
    note: 'Author of the governing change outranks a historical file owner.'
  },
  {
    id: 'refuse-redis',
    q: 'Why does Express use Redis for sessions?',
    expect: { kind: 'refusal' },
    note: 'Redis appears in dependency commits, but no decision governs Express itself.'
  },
  {
    id: 'refuse-retry',
    q: 'Why is the retry limit three?',
    expect: { kind: 'refusal' },
    note: 'A classic codebase question with no evidence in this graph.'
  },
  {
    id: 'etag-weak',
    q: 'Why is etag set to weak?',
    expect: { primary: 'c21226aa', minConf: 30 },
    note: 'Low-confidence answer is allowed and labelled rather than fabricated.'
  },
  {
    id: 'trust-proxy',
    q: 'Why does trust proxy need a back-compat inheritance block?',
    expect: { primary: 'b40e74d6' },
    note: 'Comment-level evidence plus blame points at the inheritance fix.'
  },
  {
    id: 'line-clearcookie',
    q: 'line:lib/response.js:715',
    line: ['lib/response.js', 715],
    expect: { primary: '82fc12a4', governing: true },
    note: 'Line written in 2015, behaviour governed by the 2024 change.'
  },
  {
    id: 'line-query-parser',
    q: 'line:lib/application.js:97',
    line: ['lib/application.js', 97],
    expect: { primary: '450c468d', minConf: 70 }
  },
  {
    id: 'commit-lookup',
    q: 'What did commit 82fc12a4 change?',
    expect: { primary: '82fc12a4', docs: /clearCookie/i }
  }
];

function runEval(reasoner) {
  const cases = CASES.map(c => {
    const actual = c.line ? reasoner.explainLine(c.line[0], c.line[1]) : reasoner.ask(c.q);
    const checks = [];
    const add = (label, ok, actualValue) => checks.push({ label, ok: !!ok, actual: actualValue == null ? null : String(actualValue).slice(0, 160) });
    const e = c.expect;

    if (e.kind) add('kind', actual.kind === e.kind, actual.kind);
    if (e.primary) add('primary commit', (actual.primary?.sha || '').startsWith(e.primary), actual.primary?.sha?.slice(0, 8));
    if (e.reverted) add('reverted commit', (actual.reverted?.sha || '').startsWith(e.reverted), actual.reverted?.sha?.slice(0, 8));
    if (e.retired) add('retired spelling', actual.retired?.name === e.retired, actual.retired?.name);
    if (e.canonical) add('surviving spelling', actual.anchor?.canonical === e.canonical, actual.anchor?.canonical);
    if (e.person) add('person to ask', e.person.test(actual.people?.[0]?.name || ''), actual.people?.[0]?.name);
    if (e.governing != null) add('governing decision', actual.governing === e.governing, String(actual.governing));
    if (e.minConf != null) add(`confidence ≥ ${e.minConf}`, (actual.confidence?.score || 0) >= e.minConf, actual.confidence?.score);
    if (e.quote) add('rationale quote', (actual.quotes || []).some(q => e.quote.test(q.text)), (actual.quotes || [])[0]?.text?.slice(0, 80));
    if (e.docs) add('documentation match', (actual.docs || []).some(d => e.docs.test(d.text)), (actual.docs || [])[0]?.text?.slice(0, 80));
    if (e.doc) add('release note', (actual.docs || []).some(d => e.doc.test(d.text)), (actual.docs || [])[0]?.text?.slice(0, 80));

    return {
      id: c.id, q: c.q, note: c.note, pass: checks.every(x => x.ok), checks
    };
  });
  const passed = cases.filter(c => c.pass).length;
  return {
    summary: { passed, total: cases.length, rate: Math.round((passed / cases.length) * 100) },
    cases
  };
}

module.exports = { runEval, CASES };

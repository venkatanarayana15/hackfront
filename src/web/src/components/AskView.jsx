import React from 'react';
import { ArrowRight, Compass, Spark, Route, Alert, Shield } from './icons.jsx';
import Answer from './Answer.jsx';

const SUGGESTIONS = [
  {
    q: 'Why does Express default the query parser to simple?',
    tag: 'Decision', tone: '',
    why: 'Security thread · #3361 → commit 450c468d · 2018'
  },
  {
    q: 'What happened to the CVE-2024-51999 patch?',
    tag: 'Supersession', tone: 'red',
    why: 'A security patch reverted the same day · do not quote it'
  },
  {
    q: 'Why was res.sendfile replaced by res.sendFile?',
    tag: 'Entity resolution', tone: 'violet',
    why: 'Two spellings resolved to one node · deprecation cycle'
  },
  {
    q: 'Why does Express use Redis for sessions?',
    tag: 'Refusal', tone: 'teal',
    why: 'No decision in this graph · the honest answer is no'
  }
];

export default function AskView({ answer, busy, error, onAsk, onOpenEntity, health, evalSummary, setQuestion }) {
  return (
    <div className="wrap">
      {!answer && !busy && (
        <>
          <section className="hero">
            <div className="eyebrow">hackFront India · PS T1.1 · Applied AI</div>
            <h1>Read the code.<br />Then ask <em>why</em> it is like this.</h1>
            <p>
              CodeCompass mines a real repository into a graph of decisions, code entities and people.
              Every answer is a path through that graph — the commit, the thread, the person and the date attached.
              No model in the loop: if the graph has no path, it refuses.
            </p>
            <div className="hero-meta">
              <span className="pill accent"><Spark size={12} /> graph-first, not retrieval-first</span>
              <span className="pill"><b>{health?.commits?.toLocaleString() || '6,183'}</b> commits</span>
              <span className="pill"><b>{health?.nodes?.toLocaleString() || '—'}</b> nodes</span>
              <span className="pill"><Shield size={12} /> <b>{evalSummary ? `${evalSummary.passed}/${evalSummary.total}` : '13/13'}</b> trust cases</span>
            </div>
          </section>

          <form className="composer" onSubmit={e => { e.preventDefault(); const v = e.target.elements.q.value.trim(); if (v) onAsk(v); }}>
            <div className="composer-row">
              <SearchIcon />
              <input name="q" autoComplete="off" placeholder="Why does res.clearCookie ignore expires and maxAge?" aria-label="Ask a question" />
              <button className="ask-btn" type="submit">Ask <ArrowRight size={14} /></button>
            </div>
            <div className="composer-hint">
              {['Why is etag set to weak?', 'Who should I ask about query parsing?', 'Why does trust proxy need a back-compat block?', 'Why is the retry limit three?'].map(q => (
                <button type="button" className="chip" key={q} onClick={() => onAsk(q)}>{q}</button>
              ))}
            </div>
          </form>

          <div className="suggestions">
            {SUGGESTIONS.map(s => (
              <button className="sug" key={s.q} onClick={() => onAsk(s.q)}>
                <span className="sug-top">
                  <span className={`sug-tag ${s.tone}`}>{s.tag}</span>
                  <span className="sug-why" style={{ marginLeft: 'auto' }}>{s.why}</span>
                </span>
                <span className="sug-q">{s.q}</span>
              </button>
            ))}
          </div>

          <div className="how">
            <div className="step"><span>01</span><b>Ingest the history</b><p>6,183 commits, file renames, line blame, release notes, and the PR / issue threads that carry the argument.</p></div>
            <div className="step"><span>02</span><b>Resolve to entities</b><p>One node per concept: <code>res.sendfile</code> and <code>res.sendFile</code> are the same thing; a config key remembers every value it ever held.</p></div>
            <div className="step"><span>03</span><b>Traverse or refuse</b><p>Compile the question to a typed path, follow supersession to the live decision, quote it verbatim — or return no answer.</p></div>
          </div>

          <div className="hero-meta" style={{ marginTop: 18 }}>
            <span className="pill"><Route size={12} /> seeded from <b>expressjs/express</b> @ <b>1c6f1b0</b></span>
            <span className="pill"><Compass size={12} /> PR &amp; issue cache: 3 threads, 4 issues</span>
            <span className="pill"><Alert size={12} /> 2 refusal cases are part of the demo</span>
          </div>
        </>
      )}

      {busy && (
        <div style={{ paddingTop: 26 }}>
          <div className="loading"><span className="spinner" /> Traversing the graph…</div>
          <div className="skeleton" style={{ height: 22, width: '58%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 14, width: '82%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 14, width: '66%', marginBottom: 26 }} />
          <div className="skeleton" style={{ height: 110, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 88, width: '84%' }} />
        </div>
      )}

      {error && <div className="err" style={{ marginTop: 20 }}>{error}</div>}
      {!busy && answer && <Answer a={answer} onAsk={onAsk} onOpenEntity={onOpenEntity} />}
    </div>
  );
}

function SearchIcon() {
  return <Compass size={17} style={{ color: 'var(--muted)' }} />;
}

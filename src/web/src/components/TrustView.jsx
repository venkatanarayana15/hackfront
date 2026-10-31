import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Shield, Check, X, Alert, Clock } from './icons.jsx';
import { Ring } from './ui.jsx';

export default function TrustView({ onAsk }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.eval().then(setData).catch(e => setErr(String(e))); }, []);

  return (
    <div className="wrap">
      <div className="trust-head">
        <div className="trust-title">
          <div className="eyebrow">Trust harness</div>
          <h2>The demo includes the questions it should fail.</h2>
          <p>
            Every case below runs against the live graph at request time. Answerable questions check the
            governing commit, the rationale quote and the person; two cases must refuse. A green board that
            hides a miss would be worse than no board at all.
          </p>
        </div>
        <div className="big-ring">
          <Ring score={data ? data.summary.rate : 0} size={132} stroke={7} />
        </div>
      </div>

      {err && <div className="err">{err}</div>}
      {!data && <div className="loading"><span className="spinner" /> running 13 graph cases…</div>}

      {data && (
        <>
          <div className="hero-meta" style={{ marginTop: 0, marginBottom: 16 }}>
            <span className="pill accent"><Shield size={12} /> {data.summary.passed}/{data.summary.total} passing</span>
            <span className="pill"><Clock size={12} /> run against HEAD 1c6f1b0</span>
            <span className="pill"><Check size={12} /> deterministic — same input, same path</span>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="case-table">
              <thead>
                <tr><th style={{ width: 46 }}>#</th><th>Question</th><th style={{ width: 86 }}>Result</th><th style={{ width: '44%' }}>Checks</th></tr>
              </thead>
              <tbody>
                {data.cases.map((c, i) => (
                  <tr key={c.id}>
                    <td style={{ color: 'var(--muted-2)', fontFamily: 'var(--mono)' }}>{String(i + 1).padStart(2, '0')}</td>
                    <td>
                      <button className="case-q" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'var(--text)' }}
                        onClick={() => onAsk(c.q)}>{c.q}</button>
                      <div className="case-note">{c.note}</div>
                    </td>
                    <td><span className={`badge ${c.pass ? 'pass' : 'fail'}`}>{c.pass ? <Check size={11} /> : <X size={11} />}{c.pass ? 'pass' : 'fail'}</span></td>
                    <td>
                      <ul className="check-list">
                        {c.checks.map((k, j) => (
                          <li key={j} className={k.ok ? 'ok' : 'no'}>
                            {k.ok ? <Check size={10} /> : <X size={10} />} {k.label}{!k.ok && k.actual ? ` — got ${k.actual}` : ''}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-head"><h3>Known limits, stated up front</h3></div>
          <div className="limits">
            <div className="limit"><b>HEAD-only history</b><span>Only commits reachable from HEAD can govern current code. Unmerged branches are deliberately excluded — a real trap in this repository.</span></div>
            <div className="limit"><b>Discussion cache is curated</b><span>PR and issue threads are fetched and cached for the demo. A production ingest would backfill every thread under rate limits.</span></div>
            <div className="limit"><b>No embeddings, no model</b><span>Retrieval is graph traversal plus IDF over commit text. That is why a shared word never becomes a confident answer.</span></div>
            <div className="limit"><b>Language coverage</b><span>Anchor extraction understands JS-style config keys and <code>res/req/app</code> members. Other ecosystems need their own adapters.</span></div>
            <div className="limit"><b>Docs are thin on purpose</b><span>History.md records what changed, almost never why. The engine marks that gap instead of paraphrasing it away.</span></div>
            <div className="limit"><b>Confidence is a heuristic</b><span>The score is documented, not calibrated. It is a reading aid, not a probability.</span></div>
          </div>
        </>
      )}
    </div>
  );
}

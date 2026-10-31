import React from 'react';
import { Commit, Doc, Chat, User, Alert, ArrowRight, Route, Clock } from './icons.jsx';
import { Avatar, CopyBtn, External, Inline, Ring, fmtDate, short } from './ui.jsx';
import GraphCanvas from './GraphCanvas.jsx';

function Kind({ icon: Icon, children, tone = '' }) {
  return <span className={`card-kind ${tone}`} style={tone ? { color: tone } : undefined}><Icon size={12} />{children}</span>;
}

function CommitCard({ c, label = 'Decision', tone = 'accent', bodyChars = 220 }) {
  if (!c) return null;
  return (
    <div className={`node ${tone}`}>
      <div className="card click">
        <div className="card-top">
          <Kind icon={Commit}>{label}</Kind>
          <span className="hash">{short(c.sha)}</span>
          {c.kind && c.kind !== 'other' && <span className="badge">{c.kind}</span>}
          {c.revertedBy && <span className="badge fail">reverted</span>}
          {c.url && <External href={c.url}>GitHub</External>}
        </div>
        <div className="card-title">{c.subject}</div>
        <div className="card-sub">
          <span>{c.author}</span><span className="dot">·</span><span>{fmtDate(c.date)}</span>
          {c.files != null && <><span className="dot">·</span><span>{c.files} file{c.files === 1 ? '' : 's'}, +{c.add} −{c.del}</span></>}
        </div>
        {bodyChars > 0 && c.body && <div className="card-body">{c.body.slice(0, bodyChars)}{c.body.length > bodyChars ? '…' : ''}</div>}
      </div>
    </div>
  );
}

function QuoteCard({ q, tone = 'teal' }) {
  const label = q.kind === 'pr' ? 'Pull request' : q.kind === 'issue' ? 'Issue thread' : q.kind === 'comment' ? 'Discussion' : 'Commit rationale';
  return (
    <div className={`node ${tone}`}>
      <div className="card">
        <div className="card-top">
          <Kind icon={Chat}>{label}{q.context ? ` · ${q.context}` : ''}</Kind>
          {q.url && <External href={q.url}>Open</External>}
        </div>
        <blockquote className="quote">
          <div className="quote-text"><Inline text={q.text} /></div>
        </blockquote>
        <div className="quote-by"><Avatar name={q.author} tone={tone === 'teal' ? 'teal' : ''} /> {q.author} <span className="dot">·</span> {fmtDate(q.date)}</div>
      </div>
    </div>
  );
}

function DocCard({ d }) {
  return (
    <div className="node">
      <div className="card">
        <div className="card-top">
          <Kind icon={Doc}>Documentation</Kind>
          <span className="doc-file">{d.file}:{d.line}</span>
          {d.url && <External href={d.url}>History</External>}
        </div>
        <div className="card-body"><Inline text={d.text} /></div>
      </div>
    </div>
  );
}

function TimelineCard({ timeline, anchor }) {
  if (!timeline || timeline.length < 2) return null;
  return (
    <div className="node">
      <div className="card">
        <div className="card-top"><Kind icon={Clock}>Change timeline{anchor ? ` · ${anchor.label}` : ''}</Kind></div>
        <div className="timeline">
          {timeline.slice(-6).map((t, i) => (
            <div className="tl-row" key={t.sha + i}>
              <span className="tl-date">{fmtDate(t.date)}</span>
              <span className="tl-body">
                <b>{short(t.sha)}</b> {t.subject}
                {(t.before || t.after) && (
                  <div>
                    {t.before && <span className="tl-before">{t.before.replace(/\s+/g, ' ').slice(0, 64)}</span>}
                    {t.before && t.after && <span className="tl-after"> → </span>}
                    {t.after && <span className="tl-after">{t.after.replace(/\s+/g, ' ').slice(0, 64)}</span>}
                  </div>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Refusal({ a, onAsk }) {
  return (
    <div className="answer fade-up">
      <div className="answer-main">
        <div className="answer-head">
          <span className="qmark" style={{ color: 'var(--danger)', background: 'var(--danger-soft)', borderColor: 'rgba(255,115,115,.3)' }}>!</span>
          <div className="answer-q"><b>{a.question}</b></div>
        </div>
        <div className="banner danger">
          <span className="b-icon"><Alert size={17} /></span>
          <div><b>No answer.</b> The graph does not contain a decision about this — so CodeCompass refuses instead of assembling a plausible one from keyword matches.</div>
        </div>
        <h2 className="verdict">{a.verdict}</h2>
        <p className="detail"><Inline text={a.detail} /></p>

        <div className="section-head"><h3>What is missing</h3><span>{a.missing?.length || 0} gaps</span></div>
        <div className="chain">
          {(a.missing || []).map((m, i) => (
            <div className="node red" key={i}>
              <div className="card"><div className="card-title"><Inline text={m} /></div></div>
            </div>
          ))}
          {a.nearest?.map((n, i) => (
            <div className="node" key={'n' + i}>
              <div className="card">
                <div className="card-top"><Kind icon={Route}>Closest commit</Kind><span className="hash">{n.sha}</span><span className="badge">not evidence</span></div>
                <div className="card-title">{n.subject}</div>
                <div className="card-sub">{n.why}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="section-head"><h3>What this graph can answer</h3></div>
        <div className="followups" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(a.suggestions || []).map((s, i) => (
            <button className="chip" key={i} onClick={() => onAsk(s.replace(/^Ask about /, ''))}>{s.replace(/`/g, '')}</button>
          ))}
        </div>
      </div>
      <aside className="meta-col">
        <div className="panel">
          <div className="panel-title">Trust</div>
          <div className="conf">
            <Ring score={a.confidence.score} />
            <div className="conf-copy">
              <div className={`conf-band ${a.confidence.band}`}>{a.confidence.band}</div>
              <div className="conf-note">refusal is the correct output</div>
            </div>
          </div>
          <div className="reasons">
            {a.confidence.reasons.map((r, i) => (
              <div className="reason" key={i}><b className={r.op === '+' ? 'plus' : 'minus'}>{r.op}</b><span>{r.text}</span></div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">Why refuse</div>
          <div className="doc-text" style={{ lineHeight: 1.6 }}>
            A retrieval-only system would return the nearest dependency bump or an unrelated session example.
            This one requires a typed path from the question to a decision node. No path, no answer.
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function Answer({ a, onAsk, onOpenEntity }) {
  if (!a) return null;
  if (a.kind === 'refusal') return <Refusal a={a} onAsk={onAsk} />;

  const isReversal = a.kind === 'superseded';
  const isRetired = a.kind === 'retired';
  const g = a.graph || { nodes: [], edges: [] };

  return (
    <div className="answer fade-up">
      <div className="answer-main">
        <div className="answer-head">
          <span className="qmark">?</span>
          <div className="answer-q"><b>{a.question}</b></div>
          <div style={{ marginLeft: 'auto' }}><CopyBtn text={`${a.verdict}\n\n${a.detail}`} label="Copy answer" /></div>
        </div>

        {isReversal && (
          <div className="banner danger">
            <span className="b-icon"><Alert size={17} /></span>
            <div>
              <b>This decision is dead.</b> <code>{short(a.reverted?.sha)}</code> was reverted on {fmtDate(a.revertCommit?.date || a.primary.date)} by{' '}
              <code>{short(a.revertCommit?.sha || a.primary.sha)}</code>. The live behaviour follows the earlier code, so the old patch must not be quoted as current truth.
            </div>
          </div>
        )}
        {isRetired && (
          <div className="banner">
            <span className="b-icon"><Route size={17} /></span>
            <div>
              <b>Retired spelling.</b> <code>{a.retired?.name}</code> and <code>{a.anchor?.canonical}</code> are one entity in the graph.
              The old name resolves with a supersession warning instead of stale advice.
            </div>
          </div>
        )}

        <h2 className="verdict"><Inline text={a.verdict} /></h2>
        <p className="detail"><Inline text={a.detail} /></p>

        <div className="section-head">
          <h3>Evidence chain</h3>
          <span>every claim is a node · click any node to inspect</span>
        </div>

        <div className="chain">
          {isReversal ? (
            <>
              <CommitCard c={a.revertCommit} label="Revert" tone="red" />
              <CommitCard c={a.reverted} label="Reverted decision" tone="red" bodyChars={140} />
            </>
          ) : (
            <CommitCard c={a.primary} label={isRetired ? 'Retirement' : 'Governing decision'} tone="accent" />
          )}

          {a.quotes?.filter(q => !/^This reverts commit/i.test(q.text)).slice(0, 3).map((q, i) => <QuoteCard q={q} key={i} tone={i === 0 ? 'teal' : ''} />)}

          {a.codeEvidence?.map((c, i) => (
            <div className="node" key={'code' + i}>
              <div className="card">
                <div className="card-top">
                  <Kind icon={Doc}>Code comment</Kind>
                  <span className="doc-file">{c.file}:{c.line}</span>
                  <span className="hash">{short(c.sha)}</span>
                </div>
                <div className="card-body" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{c.text}</div>
                <div className="card-sub">{c.author} · {fmtDate(c.date)}</div>
              </div>
            </div>
          ))}

          {a.docs?.slice(0, 1).map((d, i) => <DocCard d={d} key={'doc' + i} />)}
          <TimelineCard timeline={a.timeline} anchor={a.anchor} />
        </div>

        {a.followups?.length > 0 && (
          <>
            <div className="section-head"><h3>Keep pulling the thread</h3></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {a.followups.map((f, i) => (
                <button className="chip" key={i} onClick={() => onAsk(f)}>{f} <ArrowRight size={11} /></button>
              ))}
            </div>
          </>
        )}
      </div>

      <aside className="meta-col">
        <div className="panel">
          <div className="panel-title">Trust</div>
          <div className="conf">
            <Ring score={a.confidence.score} />
            <div className="conf-copy">
              <div className={`conf-band ${a.confidence.band}`}>{a.confidence.band} confidence</div>
              <div className="conf-note">{a.confidence.band === 'high' ? 'multiple independent evidence nodes' : a.confidence.band === 'medium' ? 'evidence is real but thin' : 'answer is labelled, not hidden'}</div>
            </div>
          </div>
          <div className="reasons">
            {a.confidence.reasons.map((r, i) => (
              <div className="reason" key={i}><b className={r.op === '+' ? 'plus' : 'minus'}>{r.op}</b><span>{r.text}</span></div>
            ))}
          </div>
        </div>

        {a.owners?.length > 0 && (
          <div className="panel">
            <div className="panel-title">Person to ask</div>
            {a.owners.slice(0, 2).map((o, i) => (
              <div key={i} style={{ marginBottom: i === 0 ? 10 : 0 }}>
                <div className="person-row">
                  <Avatar name={o.name} tone={i === 0 ? 'amber' : ''} />
                  <div>
                    <div className="person-name">{o.name}</div>
                    <div className="person-role">{i === 0 ? 'strongest graph connection' : 'also connected'}</div>
                  </div>
                </div>
                <div className="role-chips">{o.roles?.slice(0, 3).map((r, j) => <span className="role-chip" key={j}>{r}</span>)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="panel">
          <div className="panel-title">Documentation</div>
          {a.docGap ? (
            <div className="doc-gap"><Alert size={15} /><div><b>Docs are silent.</b> No release note or README line explains this decision. That is exactly the gap the graph fills.</div></div>
          ) : (
            a.docs.slice(0, 2).map((d, i) => (
              <div className="doc-item" key={i}>
                <div className="doc-file">{d.file}:{d.line}</div>
                <div className="doc-text"><Inline text={d.text.slice(0, 190)} /></div>
              </div>
            ))
          )}
          {!a.docGap && <div className="conf-note" style={{ marginTop: 8 }}>It records the what, not the why.</div>}
        </div>

        <div className="panel">
          <div className="panel-title">Traversed subgraph</div>
          <div className="graph-box">
            <GraphCanvas nodes={g.nodes} edges={g.edges} width={280} height={210}
              onSelect={n => onOpenEntity(n.id)} labelTypes={['config', 'api', 'person']} maxLabels={4} />
          </div>
          <div className="legend">
            <span><i style={{ background: 'var(--accent)' }} />commit</span>
            <span><i style={{ background: 'var(--accent-2)' }} />config</span>
            <span><i style={{ background: 'var(--accent-3)' }} />person</span>
            <span><i style={{ background: 'var(--ok)' }} />PR / issue</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

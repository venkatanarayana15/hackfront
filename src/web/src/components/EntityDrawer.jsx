import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { X, ArrowUpRight, Commit, User, Doc, Chat, Route } from './icons.jsx';
import { fmtDate, short } from './ui.jsx';

const ICON = { commit: Commit, person: User, pr: Chat, issue: Chat, comment: Chat, doc: Doc, config: Route, api: Route, file: Doc, marker: Doc };

export default function EntityDrawer({ id, onClose, onNavigate }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!id) return;
    setData(null);
    api.entity(id).then(d => { if (d.error) setErr(d.error); else setData(d); }).catch(e => setErr(String(e)));
  }, [id]);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!id) return null;
  const n = data?.node;
  const Icon = ICON[n?.type] || Route;

  const props = n ? Object.entries(n).filter(([k]) => !['id', 'type', 'label', 'body', 'timeline', 'occurrences'].includes(k)) : [];

  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Entity details">
        <div className="drawer-head">
          <Icon size={17} style={{ color: 'var(--accent)' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>{n?.type || 'entity'}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{n?.label || id}</div>
          </div>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        <div className="drawer-body">
          {err && <div className="err">{err}</div>}
          {!data && !err && <div className="loading"><span className="spinner" /> loading node…</div>}
          {n && (
            <>
              <dl className="kv">
                {n.sha && <><dt>commit</dt><dd>{short(n.sha)}</dd></>}
                {n.date && <><dt>date</dt><dd>{fmtDate(n.date)}</dd></>}
                {n.author && <><dt>author</dt><dd>{n.author}</dd></>}
                {n.commits != null && <><dt>commits</dt><dd>{n.commits}</dd></>}
                {n.kind && <><dt>kind</dt><dd>{n.kind}</dd></>}
                {n.current && <><dt>defined</dt><dd>{n.current.file}:{n.current.line}</dd></>}
                {n.span && <><dt>span</dt><dd>{n.span.start}–{n.span.end}</dd></>}
                {n.names?.length > 1 && <><dt>spellings</dt><dd>{n.names.join(' · ')}</dd></>}
                {n.url && <><dt>source</dt><dd><a href={n.url} target="_blank" rel="noreferrer">open <ArrowUpRight size={10} /></a></dd></>}
              </dl>

              {n.body && <div className="card-body" style={{ marginTop: 12 }}>{n.body.slice(0, 700)}</div>}

              {n.timeline?.length > 0 && (
                <div className="edge-group">
                  <h4>Change timeline</h4>
                  {n.timeline.slice(-8).map((t, i) => (
                    <div className="tl-row" key={i}>
                      <span className="tl-date">{fmtDate(t.date)}</span>
                      <span className="tl-body"><b>{short(t.sha)}</b> {t.subject}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="edge-group">
                <h4>Outgoing · {data.out.length}</h4>
                {data.out.slice(0, 14).map((e, i) => (
                  <button className="edge-row" key={i} onClick={() => e.node && onNavigate(e.node.id)}>
                    <span className="edge-type">{e.type}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.node?.label || '—'}</span>
                  </button>
                ))}
              </div>
              <div className="edge-group">
                <h4>Incoming · {data.in.length}</h4>
                {data.in.slice(0, 14).map((e, i) => (
                  <button className="edge-row" key={i} onClick={() => e.node && onNavigate(e.node.id)}>
                    <span className="edge-type">{e.type}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.node?.label || '—'}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

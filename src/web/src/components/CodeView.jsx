import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Code, Commit, Doc, User, Alert, ArrowRight } from './icons.jsx';
import { highlight, Inline, fmtDate, short, Avatar, Ring } from './ui.jsx';

const AGE = iso => {
  const y = (Date.now() - new Date(iso).getTime()) / 3.15e10;
  return y < 2 ? 'age-new' : y < 6 ? 'age-mid' : 'age-old';
};

export default function CodeView({ onAsk, onOpenEntity }) {
  const [files, setFiles] = useState([]);
  const boot = useRef(new URLSearchParams(window.location.search)).current;
  const pendingLine = useRef(parseInt(boot.get('line'), 10) || null);
  const [path, setPath] = useState(boot.get('file') || 'lib/response.js');
  const [file, setFile] = useState(null);
  const [filter, setFilter] = useState('');
  const [line, setLine] = useState(pendingLine.current);
  const [exp, setExp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.file('index.js').then(d => setFiles(d.files || [])).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    setErr(null);
    api.file(path).then(d => {
      if (!alive) return;
      if (d.error) { setErr(d.error); return; }
      setFile(d);
      if (pendingLine.current) { const n = pendingLine.current; pendingLine.current = null; pick(n); }
      else { setLine(null); setExp(null); }
    }).catch(e => { if (alive) setErr('Cannot load ' + path + ': ' + String(e)); });
    return () => { alive = false; };
  }, [path]);

  const blameByLine = useMemo(() => {
    const m = new Map();
    for (const b of file?.blame || []) m.set(b.line, b);
    return m;
  }, [file]);

  const anchorsByLine = useMemo(() => {
    const m = new Map();
    for (const a of file?.anchors || []) m.set(a.line, a);
    return m;
  }, [file]);

  async function pick(n) {
    setLine(n);
    setBusy(true);
    try { setExp(await api.explain(path, n)); } catch (e) { setExp({ error: String(e) }); }
    setBusy(false);
  }

  async function openAt(p, n) {
    if (p === path) { pick(n); return; }
    pendingLine.current = n;
    setPath(p);
  }

  const shown = files.filter(f => /\.js$/.test(f)).filter(f => f.toLowerCase().includes(filter.toLowerCase()));

  useEffect(() => {
    if (!line) return;
    const scroller = document.querySelector('.code-scroll');
    const el = scroller?.querySelector('.code-line.sel');
    if (scroller && el) scroller.scrollTop = Math.max(0, el.offsetTop - scroller.clientHeight / 2);
  }, [line, path, file]);

  return (
    <div className="wrap-wide">
      <div className="graph-toolbar">
        <div className="section-head" style={{ margin: 0, border: 0, padding: 0 }}>
          <h3>Code reader</h3><span>every line has an owner · click a line to ask why</span>
        </div>
        <div style={{ marginLeft: 'auto' }} className="pill"><Commit size={12} /> blame at HEAD</div>
      </div>

      <div className={`code-layout ${exp && !busy ? 'inspecting' : ''}`}>
        <div className="file-list">
          <div className="file-list-head"><span>Source</span><span>{shown.length}</span></div>
          <div style={{ padding: '8px 8px 4px' }}>
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter files…"
              style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 7px', fontSize: 11, outline: 'none' }} />
          </div>
          <div style={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto', paddingBottom: 6 }}>
            {shown.map(f => (
              <button key={f} className={`file-item ${path === f ? 'on' : ''} ${file?.anchors?.length && path === f ? 'has-anchor' : ''}`} onClick={() => setPath(f)}>
                <span className="fdot" />{f.replace('lib/', '')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="code-panel">
            <div className="code-head">
              <Code size={14} style={{ color: 'var(--muted)' }} />
              <span className="code-path">{path}</span>
              <span className="code-tag">{file?.lines?.length || 0} lines</span>
              <span className="code-tag">{file?.anchors?.length || 0} entities</span>
              {line && <span className="code-tag" style={{ color: 'var(--accent)', borderColor: 'var(--accent-line)' }}>line {line}</span>}
              <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted-2)' }}>teal bar = recent · slate = old</span>
            </div>
            <div className="code-scroll">
              {(file?.lines || []).map((text, i) => {
                const n = i + 1;
                const b = blameByLine.get(n);
                const anchor = anchorsByLine.get(n);
                return (
                  <button key={n} className={`code-line ${line === n ? 'sel' : ''} ${b ? AGE(b.date) : ''} ${anchor ? 'anchor' : ''}`} onClick={() => pick(n)}>
                    <span className="ln">{n}</span>
                    <span className="src">{highlight(text)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {err && <div className="err" style={{ marginTop: 10 }}>{err}</div>}
          {busy && <div className="loading"><span className="spinner" /> reading blame + graph…</div>}
          {!busy && !exp && (
            <div className="empty" style={{ marginTop: 12, textAlign: 'left', display: 'flex', gap: 14, alignItems: 'center' }}>
              <Commit size={20} style={{ color: 'var(--accent)' }} />
              <div>
                <b style={{ color: 'var(--text)' }}>Click any line.</b>{' '}
                <span style={{ color: 'var(--muted)' }}>CodeCompass separates the commit that wrote the text from the decision that governs its behaviour.</span>
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="chip" onClick={() => openAt('lib/response.js', 715)}>try lib/response.js:715</button>
                  <button className="chip" onClick={() => openAt('lib/application.js', 97)}>try lib/application.js:97</button>
                </div>
              </div>
            </div>
          )}
          {exp?.error && <div className="err" style={{ marginTop: 10 }}>{exp.error}</div>}
        </div>

        {(exp && !busy) && (
          <aside className="inspector">
            <LinePanel e={exp} onAsk={onAsk} />
          </aside>
        )}
      </div>
    </div>
  );
}

function LinePanel({ e, onAsk }) {
  const a = e.anchor;
  return (
    <div className="line-explain fade-up">
      <div className="section-head" style={{ marginTop: 14 }}>
        <h3>Line {e.line}</h3>
        <span>{e.primary === e.lineCommit ? 'the governing decision wrote this line' : 'line author ≠ governing decision'}</span>
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="card-top">
          <span className="card-kind"><Commit size={12} /> Line author</span>
          <span className="hash">{short(e.lineCommit.sha)}</span>
          <span className="card-sub">{e.lineCommit.author} · {fmtDate(e.lineCommit.date)}</span>
          {e.lineCommit.url && <a className="mini-link" href={e.lineCommit.url} target="_blank" rel="noreferrer">GitHub</a>}
        </div>
        <div className="card-body" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{e.text}</div>
      </div>

      {e.governing && (
        <div className="banner">
          <span className="b-icon"><Alert size={16} /></span>
          <div>
            <b>This line is older than its behaviour.</b> The exact text is from <code>{short(e.lineCommit.sha)}</code>, but the current meaning of{' '}
            {a ? <code>{a.label}</code> : 'this code'} was set later on {fmtDate(e.primary.date)} in <code>{short(e.primary.sha)}</code>.
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="card-top">
          <span className="card-kind"><Commit size={12} /> Governing decision</span>
          <span className="hash">{short(e.primary.sha)}</span>
          <span className="badge">{e.primary.kind}</span>
          <span style={{ marginLeft: 'auto' }}><Ring score={e.confidence.score} size={40} stroke={3.5} /></span>
        </div>
        <div className="card-title">{e.primary.subject}</div>
        <div className="card-sub">{e.primary.author} · {fmtDate(e.primary.date)}</div>
        {e.primary.body && <div className="card-body">{e.primary.body.slice(0, 300)}</div>}
      </div>

      {e.quotes?.[0] && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="card-top"><span className="card-kind"><Doc size={12} /> Why</span>{e.quotes[0].url && <a className="mini-link" href={e.quotes[0].url} target="_blank" rel="noreferrer">source</a>}</div>
          <blockquote className="quote"><div className="quote-text"><Inline text={e.quotes[0].text} /></div></blockquote>
          <div className="quote-by">{e.quotes[0].author} · {fmtDate(e.quotes[0].date)}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {a && <button className="chip" onClick={() => onAsk(`Why is ${a.label} set the way it is?`)}>Ask about {a.label} <ArrowRight size={11} /></button>}
        <button className="chip" onClick={() => onAsk(`What did ${short(e.primary.sha)} change?`)}>Open the decision <ArrowRight size={11} /></button>
        {e.owners?.[0] && <span className="chip" style={{ cursor: 'default' }}><User size={11} /> ask {e.owners[0].name}</span>}
      </div>
    </div>
  );
}

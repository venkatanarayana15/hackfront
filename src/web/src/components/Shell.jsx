import React, { useEffect, useRef } from 'react';
import { Compass, Search, Code, Graph, Shield, Sun, Moon, ArrowRight } from './icons.jsx';

export function TopBar({ health, value, setValue, onSubmit, theme, setTheme, busy }) {
  const input = useRef(null);
  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); input.current?.focus(); input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><Compass size={18} /></span>
        <div className="brand-text">
          <span className="brand-name">CodeCompass</span>
          <span className="brand-sub">why the code is like this</span>
        </div>
      </div>

      <div className="repo-chip" title={health?.remote || ''}>
        <span className="repo-dot" />
        <span className="repo-name">{(health?.remote || 'https://github.com/expressjs/express').replace('https://github.com/', '').replace(/\.git$/, '')}</span>
        <span className="repo-meta">{health ? `${health.commits.toLocaleString()} commits · ${health.head.slice(0, 8)}` : 'loading'}</span>
      </div>

      <form className="askbox" onSubmit={e => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()); }}>
        <Search size={15} />
        <input ref={input} value={value} onChange={e => setValue(e.target.value)}
          placeholder="Ask why the code is the way it is…" aria-label="Ask a question" />
        <span className="kbd">{typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</span>
        <button type="submit" className="icon-btn" style={{ width: 26, height: 26, border: 0, background: 'none' }}
          aria-label="Ask" disabled={busy}><ArrowRight size={15} /></button>
      </form>

      <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label="Toggle theme" title="Toggle light / dark">
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </header>
  );
}

const NAV = [
  { id: 'ask', label: 'Ask', icon: Search },
  { id: 'code', label: 'Code', icon: Code },
  { id: 'graph', label: 'Graph', icon: Graph },
  { id: 'trust', label: 'Trust', icon: Shield }
];

export function Rail({ view, setView, overview, onEntity, health }) {
  const anchors = overview?.anchors || [];
  return (
    <aside className="rail">
      <div>
        <div className="rail-label">Workspace</div>
        <nav className="nav" aria-label="Workspace">
          {NAV.map(n => {
            const Icon = n.icon;
            return (
              <button key={n.id} className={`nav-item ${view === n.id ? 'active' : ''}`} onClick={() => setView(n.id)}>
                <Icon size={16} /> {n.label}
                {n.id === 'trust' && overview && <span className="nav-count">13 cases</span>}
              </button>
            );
          })}
        </nav>
      </div>

      <div>
        <div className="rail-label">Graph</div>
        <div className="rail-stats">
          <div className="stat"><b>{health ? health.commits.toLocaleString() : '—'}</b><span>commits</span></div>
          <div className="stat"><b>{health ? health.anchors : '—'}</b><span>entities</span></div>
          <div className="stat"><b>{health ? health.nodes.toLocaleString() : '—'}</b><span>nodes</span></div>
          <div className="stat"><b>{health ? health.edges.toLocaleString() : '—'}</b><span>edges</span></div>
        </div>
      </div>

      <div>
        <div className="rail-label">Live entities</div>
        <div className="rail-list">
          {anchors.slice(0, 9).map(a => (
            <button key={a.id} className={`rail-entity ${a.kind}`} onClick={() => onEntity(a.id)} title={a.label}>
              <i /> {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rail-foot">
        HEAD-only history · every answer cites a commit.<br />
        No model in the loop.
      </div>
    </aside>
  );
}

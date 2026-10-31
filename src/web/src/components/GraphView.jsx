import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import GraphCanvas from './GraphCanvas.jsx';
import { Graph as GraphIcon, Alert, Route, User, Commit } from './icons.jsx';

const FILTERS = [
  { id: 'all', label: 'Everything' },
  { id: 'decisions', label: 'Decisions only' },
  { id: 'entities', label: 'Code entities' }
];

export default function GraphView({ onOpenEntity }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [err, setErr] = useState(null);

  useEffect(() => { api.graph().then(setData).catch(e => setErr(String(e))); }, []);

  const view = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    if (filter === 'all') return data;
    const types = filter === 'decisions' ? ['commit', 'pr', 'issue'] : ['config', 'api', 'person'];
    const nodes = data.nodes.filter(n => types.includes(n.type));
    const ids = new Set(nodes.map(n => n.id));
    return { nodes, edges: data.edges.filter(e => ids.has(e.from) && ids.has(e.to)) };
  }, [data, filter]);

  return (
    <div className="wrap-wide">
      <div className="graph-toolbar">
        <div className="section-head" style={{ margin: 0, border: 0, padding: 0 }}>
          <h3>Decision graph</h3>
          <span>{data ? `${view.nodes.length} nodes · ${view.edges.length} edges · ${data.stats.anchors} anchor clusters` : 'loading'}</span>
        </div>
        <div className="seg" style={{ marginLeft: 'auto' }}>
          {FILTERS.map(f => <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>)}
        </div>
      </div>

      {err && <div className="err">{err}</div>}

      <div className="graph-box" style={{ padding: 8 }}>
        <GraphCanvas nodes={view.nodes} edges={view.edges} width={1100} height={560} onSelect={n => onOpenEntity(n.id)} maxLabels={0} pinTypes={['config', 'api']} labelTypes={[]} />
      </div>

      <div className="legend" style={{ marginTop: 12 }}>
        <span><i style={{ background: 'var(--accent)' }} />decision / commit</span>
        <span><i style={{ background: 'var(--accent-2)' }} />config key</span>
        <span><i style={{ background: 'var(--blue)' }} />API member</span>
        <span><i style={{ background: 'var(--accent-3)' }} />person</span>
        <span><i style={{ background: 'var(--ok)' }} />PR / issue</span>
        <span style={{ marginLeft: 'auto', color: 'var(--muted-2)' }}>dashed red = supersession / revert</span>
      </div>

      <div className="limits" style={{ marginTop: 18 }}>
        <div className="limit">
          <b><Commit size={12} /> What is drawn</b>
          <span>Commits with a rationale signal, the entities they changed, and the three strongest people. The full graph holds every commit — 6,183 of them.</span>
        </div>
        <div className="limit">
          <b><Route size={12} /> How to read an edge</b>
          <span>A red dashed edge is a decision overriding an older one. That is the structure the answer engine follows before it quotes anything.</span>
        </div>
        <div className="limit">
          <b><Alert size={12} /> Why not show everything</b>
          <span>A 6k-node hairball hides the argument. This view is a reading aid; the API exposes the full graph and the path used for any answer.</span>
        </div>
      </div>
    </div>
  );
}

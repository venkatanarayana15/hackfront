import React, { useMemo } from 'react';

const COLORS = {
  commit: 'var(--accent)',
  config: 'var(--accent-2)',
  api: 'var(--blue)',
  person: 'var(--accent-3)',
  pr: 'var(--ok)',
  issue: 'var(--ok)',
  comment: 'var(--muted)',
  doc: 'var(--muted-2)',
  marker: 'var(--danger)',
  file: 'var(--muted)'
};
const RADIUS = { commit: 4, config: 6.5, api: 5.5, person: 6, pr: 5, issue: 5, comment: 3, doc: 3.4, marker: 3 };

function layout(nodes, edges, width, height, pinTypes = []) {
  const n = Math.max(1, nodes.length);
  const pos = new Map();
  const pins = nodes.filter(nd => pinTypes.includes(nd.type));
  nodes.forEach((nd, i) => {
    const a = (i / n) * Math.PI * 2 + 1;
    const r = Math.min(width, height) * (0.18 + ((i * 37) % 100) / 420);
    pos.set(nd.id, { x: width / 2 + Math.cos(a) * r, y: height / 2 + Math.sin(a) * r * 0.82, vx: 0, vy: 0 });
  });
  pins.forEach((nd, i) => {
    const angle = -Math.PI / 2 + (i / Math.max(1, pins.length)) * Math.PI * 2;
    pos.set(nd.id, {
      x: width / 2 + Math.cos(angle) * width * 0.37,
      y: height / 2 + Math.sin(angle) * height * 0.36,
      vx: 0, vy: 0, fixed: true
    });
  });
  const links = edges.filter(e => pos.has(e.from) && pos.has(e.to));
  const k = Math.sqrt((width * height) / n) * 0.95;
  for (let it = 0; it < 230; it++) {
    const alpha = 1 - it / 230;
    const arr = [...pos.entries()];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const [ia, a] = arr[i], [ib, b] = arr[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (Math.random() - 0.5) * 2; dy = (Math.random() - 0.5) * 2; d2 = 1; }
        const d = Math.sqrt(d2);
        const f = (k * k) / d2;
        a.vx += (dx / d) * f * 0.06; a.vy += (dy / d) * f * 0.06;
        b.vx -= (dx / d) * f * 0.06; b.vy -= (dy / d) * f * 0.06;
      }
    }
    for (const e of links) {
      const a = pos.get(e.from), b = pos.get(e.to);
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = (d - k * 1.35) / d * 0.035;
      a.vx += dx * f; a.vy += dy * f;
      b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const [, p] of pos) {
      if (p.fixed) continue;
      p.vx += (width / 2 - p.x) * 0.0025;
      p.vy += (height / 2 - p.y) * 0.0035;
      p.x += p.vx * alpha; p.y += p.vy * alpha;
      p.vx *= 0.6; p.vy *= 0.6;
      p.x = Math.max(34, Math.min(width - 34, p.x));
      p.y = Math.max(26, Math.min(height - 22, p.y));
    }
  }
  return pos;
}

export default function GraphCanvas({
  nodes = [], edges = [], width = 560, height = 340,
  onSelect, selectedId, labelTypes = ['config', 'api', 'person', 'pr', 'commit'], maxLabels = 16, pinTypes = []
}) {
  const degree = useMemo(() => {
    const d = new Map();
    for (const e of edges) {
      d.set(e.from, (d.get(e.from) || 0) + 1);
      d.set(e.to, (d.get(e.to) || 0) + 1);
    }
    return d;
  }, [edges]);

  const pos = useMemo(() => layout(nodes, edges, width, height, pinTypes), [nodes, edges, width, height, pinTypes]);

  const labelled = useMemo(() => {
    const pins = nodes.filter(n => pinTypes.includes(n.type));
    const rest = [...nodes]
      .filter(n => labelTypes.includes(n.type) && !pins.includes(n))
      .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
      .slice(0, Math.max(0, maxLabels - pins.length));
    return new Set([...pins, ...rest].map(n => n.id));
  }, [nodes, degree, labelTypes, maxLabels, pinTypes]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evidence graph">
      <defs>
        <radialGradient id="gvignette" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="rgba(242,169,80,0.05)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      <rect width={width} height={height} fill="url(#gvignette)" />
      {edges.map((e, i) => {
        const a = pos.get(e.from), b = pos.get(e.to);
        if (!a || !b) return null;
        const cls = e.type === 'SUPERSEDES' ? 'gedge supersede' : e.type === 'REVERTS' ? 'gedge revert' : e.type === 'AUTHORED_BY' ? 'gedge author' : 'gedge';
        return <line key={i} className={cls} x1={a.x} y1={a.y} x2={b.x} y2={b.y} opacity={0.5} />;
      })}
      {nodes.map(n => {
        const p = pos.get(n.id);
        if (!p) return null;
        const r = RADIUS[n.type] || 3.5;
        const selected = n.id === selectedId;
        const color = COLORS[n.type] || 'var(--muted)';
        const pinned = pos.get(n.id)?.fixed;
        const rightHalf = p.x >= width / 2;
        return (
          <g key={n.id} className="gnode" transform={`translate(${p.x},${p.y})`}
            onClick={() => onSelect && onSelect(n)}>
            <title>{`${n.type}: ${n.label}`}</title>
            {selected && <circle r={r + 6} fill="none" stroke={color} strokeWidth="1" opacity="0.5" />}
            <circle r={r} fill={color} stroke="var(--panel)" strokeWidth="1.5" opacity={n.type === 'comment' || n.type === 'doc' ? 0.7 : 0.95} />
            {labelled.has(n.id) && (
              <text
                x={pinned ? (rightHalf ? r + 7 : -(r + 7)) : 0}
                y={pinned ? 3.5 : -r - 5}
                textAnchor={pinned ? (rightHalf ? 'start' : 'end') : 'middle'}
                style={{ paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 2.5 }}>
                {(n.label || '').length > 22 ? (n.label || '').slice(0, 21) + '…' : n.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

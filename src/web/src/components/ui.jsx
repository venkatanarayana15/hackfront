import React from 'react';
import { ArrowUpRight } from './icons.jsx';

export const initials = name => String(name || '?')
  .replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export const fmtDate = iso => {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return String(iso).slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export const short = sha => (sha || '').slice(0, 8);

export function Inline({ text }) {
  const src = String(text || '');
  const parts = src.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
        if (p.startsWith('**') && p.endsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>;
        const m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (m) return <a key={i} href={m[2]} target="_blank" rel="noreferrer">{m[1]}</a>;
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </>
  );
}

export function Avatar({ name, tone = '' }) {
  return <span className={`avatar ${tone}`}>{initials(name)}</span>;
}

export function Ring({ score, size = 68, stroke = 5 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score || 0)) / 100;
  const color = score >= 75 ? 'var(--ok)' : score >= 50 ? 'var(--accent)' : 'var(--danger)';
  return (
    <div className="ring" style={{ width: size, height: size, flexBasis: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
      </svg>
      <div className="ring-text"><b>{score ?? '—'}</b><span>trust</span></div>
    </div>
  );
}

export function CopyBtn({ text, label = 'Copy' }) {
  const [done, setDone] = React.useState(false);
  return (
    <button className="copy-btn" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* ignore */ }
    }}>{done ? 'Copied' : label}</button>
  );
}

export function External({ href, children }) {
  if (!href) return <span>{children}</span>;
  return <a className="mini-link" href={href} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={12} /></a>;
}

/* minimal JS tokenizer for the reader */
export function highlight(line) {
  const out = [];
  let i = 0;
  const push = (text, cls) => { if (text) out.push(cls ? <span key={out.length} className={cls}>{text}</span> : text); };
  const keyword = /^(?:var|let|const|function|return|if|else|for|while|new|this|typeof|instanceof|try|catch|throw|switch|case|break|continue|delete|in|of|async|await|class|extends|super|do|void|yield)$/;
  while (i < line.length) {
    const rest = line.slice(i);
    if (rest.startsWith('//')) { push(rest, 'tok-com'); break; }
    if (rest.startsWith('/*')) {
      const end = line.indexOf('*/', i + 2);
      push(line.slice(i, end === -1 ? line.length : end + 2), 'tok-com');
      i = end === -1 ? line.length : end + 2;
      continue;
    }
    const ch = line[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === '\\') { j += 2; continue; }
        if (line[j] === ch) { j++; break; }
        j++;
      }
      push(line.slice(i, j), 'tok-str');
      i = j;
      continue;
    }
    const num = rest.match(/^\d+(?:\.\d+)?/);
    if (num) { push(num[0], 'tok-num'); i += num[0].length; continue; }
    const ident = rest.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
    if (ident) {
      const word = ident[0];
      const after = line.slice(i + word.length);
      if (keyword.test(word)) push(word, 'tok-key');
      else if (/^\s*\(/.test(after)) push(word, 'tok-fn');
      else push(word);
      i += word.length;
      continue;
    }
    push(ch, /[{}()[\];,.]/.test(ch) ? 'tok-punc' : undefined);
    i++;
  }
  return out;
}

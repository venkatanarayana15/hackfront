const base = import.meta.env.VITE_API_BASE || '';

async function get(path) {
  const res = await fetch(base + path, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

export const api = {
  health: () => get('/api/health'),
  overview: () => get('/api/overview'),
  ask: q => get('/api/ask?q=' + encodeURIComponent(q)),
  explain: (file, line) => get(`/api/explain?file=${encodeURIComponent(file)}&line=${line}`),
  file: path => get('/api/file?path=' + encodeURIComponent(path)),
  graph: () => get('/api/graph'),
  eval: () => get('/api/eval'),
  entity: id => get('/api/entity?id=' + encodeURIComponent(id))
};

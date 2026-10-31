import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { TopBar, Rail } from './components/Shell.jsx';
import AskView from './components/AskView.jsx';
import CodeView from './components/CodeView.jsx';
import GraphView from './components/GraphView.jsx';
import TrustView from './components/TrustView.jsx';
import EntityDrawer from './components/EntityDrawer.jsx';

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('cc-theme') || 'dark');
  const [view, setView] = useState('ask');
  const [health, setHealth] = useState(null);
  const [overview, setOverview] = useState(null);
  const [evalSummary, setEvalSummary] = useState(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [drawer, setDrawer] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cc-theme', theme);
  }, [theme]);

  useEffect(() => {
    api.health().then(setHealth).catch(e => setError(String(e)));
    api.overview().then(setOverview).catch(() => {});
    api.eval().then(d => setEvalSummary(d.summary)).catch(() => {});
  }, []);

  const ask = useCallback(async q => {
    const text = String(q || '').trim();
    if (!text) return;
    setQuestion(text);
    setView('ask');
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const out = await api.ask(text);
      setAnswer(out.error ? { kind: 'refusal', question: text, verdict: out.error, detail: '', confidence: { score: 0, band: 'refuse', reasons: [] }, missing: [], suggestions: [] } : out);
      window.history.replaceState(null, '', '?q=' + encodeURIComponent(text));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  /* deep link: /?q=… runs the question on load (used by the demo and screenshots) */
  const booted = React.useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('theme');
    if (t === 'light' || t === 'dark') setTheme(t);
    const v = params.get('view');
    if (['ask', 'code', 'graph', 'trust'].includes(v)) setView(v);
    const q = params.get('q');
    if (q) ask(q);
  }, [ask]);

  const openEntity = useCallback(id => setDrawer(id), []);

  return (
    <div className="app">
      <TopBar health={health} value={question} setValue={setQuestion} onSubmit={ask}
        theme={theme} setTheme={setTheme} busy={busy} />
      <div className="shell">
        <Rail view={view} setView={setView} overview={overview} onEntity={openEntity} health={health} />
        <main className="main">
          {view === 'ask' && (
            <AskView answer={answer} busy={busy} error={error} onAsk={ask}
              onOpenEntity={openEntity} health={health} evalSummary={evalSummary} setQuestion={setQuestion} />
          )}
          {view === 'code' && <CodeView onAsk={ask} onOpenEntity={openEntity} />}
          {view === 'graph' && <GraphView onOpenEntity={openEntity} />}
          {view === 'trust' && <TrustView onAsk={ask} />}
        </main>
      </div>
      {drawer && <EntityDrawer id={drawer} onClose={() => setDrawer(null)} onNavigate={setDrawer} />}
    </div>
  );
}

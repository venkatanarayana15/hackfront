const pptxgen = require('../.pw/node_modules/pptxgenjs');
const fs = require('fs');

const pngSize = p => {
  const b = fs.readFileSync(p);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';           // 13.33 x 7.5
pres.author = 'CodeCompass';
pres.title = 'CodeCompass — Why The Code Is Like This';
pres.subject = 'hackFront India 2026 · PS T1.1';

const W = 13.33, H = 7.5, M = 0.62;
const C = {
  dark: '0B0F16', dark2: '121A26', ink: '0F1A2B', muted: '5B6A80', muted2: '8794A8',
  light: 'F7F8FA', white: 'FFFFFF', line: 'DDE3EC', amber: 'E8A24A', amberDeep: 'A85C11',
  teal: '1E9E8F', red: 'C25050', violet: '6B4FD8', paleAmber: 'FBF3E6'
};
const SANS = 'Segoe UI', MONO = 'Consolas';

const txt = (slide, text, x, y, w, h, o = {}) => slide.addText(text, {
  x, y, w, h, fontFace: SANS, fontSize: 16, color: C.ink, margin: 0, valign: 'top', ...o
});
const label = (slide, text, x, y, color = C.amberDeep, w = 6) => slide.addText(text, {
  x, y, w, h: 0.24, fontFace: MONO, fontSize: 9.5, color, charSpacing: 2.2, margin: 0, bold: false
});
const rule = (slide, x, y, w, color = C.line, width = 0.75) =>
  slide.addShape(pres.shapes.LINE, { x, y, w, h: 0, line: { color, width } });
const card = (slide, x, y, w, h, fill = C.white, line = C.line) =>
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.07, fill: { color: fill }, line: { color: line, width: 0.75 }
  });
const shadow = () => ({ type: 'outer', color: '0F1A2B', blur: 10, offset: 3, angle: 90, opacity: 0.12 });
const page = (slide, n, dark = false) => {
  slide.addText('CodeCompass', { x: M, y: 7.06, w: 2.2, h: 0.2, fontFace: MONO, fontSize: 8.5, color: dark ? '58657A' : C.muted2, margin: 0, charSpacing: 1.5 });
  slide.addText('hackFront India 2026 · PS T1.1', { x: W - M - 3.6, y: 7.06, w: 3.6, h: 0.2, fontFace: MONO, fontSize: 8.5, color: dark ? '58657A' : C.muted2, align: 'right', margin: 0 });
  slide.addText(String(n).padStart(2, '0'), { x: W - M - 0.4, y: 0.42, w: 0.4, h: 0.24, fontFace: MONO, fontSize: 9, color: dark ? '58657A' : C.muted2, align: 'right', margin: 0 });
};

/* ============================ 1 · cover ============================ */
{
  const s = pres.addSlide();
  s.background = { color: C.dark };

  // graph motif
  const nodes = [
    [9.55, 2.05, 0.18, C.amber], [10.9, 1.65, 0.13, C.teal], [12.35, 2.45, 0.22, C.amber],
    [11.35, 3.15, 0.16, C.violet], [12.55, 4.05, 0.12, C.teal], [10.4, 4.5, 0.2, C.amber],
    [9.15, 3.6, 0.12, C.violet], [11.7, 5.15, 0.14, C.teal], [12.7, 5.75, 0.1, C.amber]
  ];
  const links = [[0, 1], [1, 2], [1, 3], [3, 4], [3, 5], [0, 3], [0, 6], [5, 7], [7, 8], [2, 4], [4, 8]];
  for (const [a, b] of links) {
    s.addShape(pres.shapes.LINE, {
      x: nodes[a][0], y: nodes[a][1], w: nodes[b][0] - nodes[a][0], h: nodes[b][1] - nodes[a][1],
      line: { color: '2A3648', width: 0.9 }
    });
  }
  for (const [x, y, r, c] of nodes) {
    s.addShape(pres.shapes.OVAL, { x: x - r / 2, y: y - r / 2, w: r, h: r, fill: { color: c }, line: { color: C.dark, width: 1 } });
  }
  s.addText('SUPERSEDES', { x: 11.7, y: 3.45, w: 1, h: 0.16, fontFace: MONO, fontSize: 6.5, color: '7A4A4A', margin: 0 });
  s.addShape(pres.shapes.LINE, { x: 11.55, y: 3.35, w: 0.75, h: -0.1, line: { color: '8A4A4A', width: 0.8, dashType: 'dash' } });

  s.addText([{ text: '◈ ', options: { color: C.amber } }, { text: 'CodeCompass', options: { color: C.white, bold: true } }],
    { x: M, y: 0.55, w: 4, h: 0.4, fontFace: SANS, fontSize: 17, margin: 0 });
  label(s, 'HACKFRONT INDIA 2026  ·  THEME T1  ·  PS T1.1', M, 1.32, C.amber, 7);

  s.addText('Read the code.\nThen ask why.', {
    x: M, y: 1.72, w: 7.2, h: 2.35, fontFace: SANS, fontSize: 54, bold: true, color: C.white,
    lineSpacingMultiple: 0.92, margin: 0
  });
  s.addText('A graph-native answer engine for the reasoning that walks out of the door. Every answer carries the commit, the thread, the person and the date — or it refuses.', {
    x: M, y: 4.3, w: 6.5, h: 1.1, fontFace: SANS, fontSize: 17, color: 'AAB7C8', lineSpacingMultiple: 1.15, margin: 0
  });

  const facts = [['6,183', 'commits'], ['8,982', 'graph nodes'], ['13/13', 'trust cases']];
  facts.forEach(([n, l], i) => {
    const x = M + i * 2.1;
    s.addText(n, { x, y: 5.9, w: 1.9, h: 0.4, fontFace: MONO, fontSize: 21, color: C.white, margin: 0 });
    s.addText(l, { x, y: 6.35, w: 1.9, h: 0.2, fontFace: MONO, fontSize: 8.5, color: '6E7C90', charSpacing: 1.4, margin: 0 });
  });
  s.addText('no model in the loop', { x: 9.6, y: 6.9, w: 3.2, h: 0.2, fontFace: MONO, fontSize: 8.5, color: '58657A', align: 'right', margin: 0 });
  s.addNotes('Open with the problem, not the tech. "Every team has one person who knows why. CodeCompass makes that knowledge queryable, with evidence."');
}

/* ============================ 2 · problem ============================ */
{
  const s = pres.addSlide();
  s.background = { color: C.light };
  page(s, 2);
  label(s, 'THE PROBLEM', M, 0.62);
  txt(s, 'The reasoning is not in the code.', M, 0.92, 8.2, 0.6, { fontSize: 33, bold: true });
  txt(s, 'A new developer can read code. They cannot read intent. The why lives in commits, closed PRs, incident threads and one senior engineer’s head.', M, 1.55, 7.4, 0.8, { fontSize: 15, color: C.muted, lineSpacingMultiple: 1.15 });

  const rows = [
    ['01', 'Docs drift; commits keep telling the truth.', 'Documentation is written once and edited rarely. The commit that changed the behaviour keeps its reason — if you can find it.'],
    ['02', 'A reversed decision still looks authoritative.', 'A patch from 2025 sits in history next to its own revert. Search quotes the dead one.'],
    ['03', 'Search returns mentions, not decisions.', 'Vector search finds text that talks about the topic. It does not find the line of code that the incident changed.']
  ];
  rows.forEach(([n, lead, body], i) => {
    const y = 2.82 + i * 1.28;
    rule(s, M, y - 0.12, 7.4);
    s.addText(n, { x: M, y, w: 0.5, h: 0.25, fontFace: MONO, fontSize: 11, color: C.amberDeep, margin: 0 });
    s.addText(lead, { x: M + 0.55, y: y - 0.02, w: 6.7, h: 0.3, fontFace: SANS, fontSize: 17, bold: true, color: C.ink, margin: 0 });
    s.addText(body, { x: M + 0.55, y: y + 0.32, w: 6.6, h: 0.62, fontFace: SANS, fontSize: 12.5, color: C.muted, lineSpacingMultiple: 1.1, margin: 0 });
  });

  card(s, 8.35, 1.15, 4.35, 4.95, C.dark, C.dark);
  s.addText('“', { x: 8.62, y: 1.32, w: 0.6, h: 0.7, fontFace: SANS, fontSize: 46, color: C.amber, margin: 0 });
  s.addText('In every engineering team there is one person who knows why. Why the retry limit is three. Why that service was never migrated. When that engineer leaves, the codebase stays and the reasoning walks out of the door.', {
    x: 8.7, y: 2.02, w: 3.65, h: 2.65, fontFace: SANS, fontSize: 15.5, color: 'E6ECF6', lineSpacingMultiple: 1.25, margin: 0
  });
  s.addText('— problem statement, T1.1', { x: 8.7, y: 5.25, w: 3.4, h: 0.3, fontFace: MONO, fontSize: 9, color: '8FA0B8', margin: 0 });
  s.addText('414 identities', { x: 8.7, y: 5.62, w: 1.45, h: 0.28, fontFace: MONO, fontSize: 13, color: C.amber, margin: 0 });
  s.addText('in this one repository’s history', { x: 10.3, y: 5.64, w: 2.1, h: 0.3, fontFace: SANS, fontSize: 10, color: '8FA0B8', margin: 0 });
  s.addNotes('Do not read the quote. Let the judge read it. Say: the knowledge is real, it is just not addressable.');
}

/* ============================ 3 · behaviours ============================ */
{
  const s = pres.addSlide();
  s.background = { color: C.light };
  page(s, 3);
  label(s, 'THE PRODUCT', M, 0.62);
  txt(s, 'Four behaviours, not a chat box.', M, 0.92, 9, 0.6, { fontSize: 33, bold: true });
  txt(s, 'The question is compiled into a path through decisions. The graph, not a model, chooses the evidence.', M, 1.55, 8.6, 0.5, { fontSize: 14.5, color: C.muted });

  const steps = [
    ['01', 'Link', 'One entity per concept. res.sendfile and res.sendFile resolve to the same node.'],
    ['02', 'Walk', 'Typed edges: CHANGED, AUTHORED_BY, IN_PR, REFERENCES, DOCUMENTS.'],
    ['03', 'Resolve', 'REVERTS and SUPERSEDES decide what is live before anything is quoted.'],
    ['04', 'Answer', 'Quote the commit, the thread, the person, the date — or refuse.']
  ];
  steps.forEach(([n, t, b], i) => {
    const x = M + i * 3.08;
    card(s, x, 2.3, 2.72, 2.25, C.white);
    s.addText(n, { x: x + 0.22, y: 2.48, w: 0.6, h: 0.24, fontFace: MONO, fontSize: 10, color: C.amberDeep, margin: 0 });
    s.addText(t, { x: x + 0.22, y: 2.78, w: 2.3, h: 0.35, fontFace: SANS, fontSize: 20, bold: true, color: C.ink, margin: 0 });
    s.addText(b, { x: x + 0.22, y: 3.24, w: 2.3, h: 1.0, fontFace: SANS, fontSize: 11.5, color: C.muted, lineSpacingMultiple: 1.15, margin: 0 });
    if (i < 3) s.addText('→', { x: x + 2.76, y: 3.22, w: 0.28, h: 0.3, fontFace: SANS, fontSize: 16, color: C.muted2, margin: 0 });
  });

  // branch
  s.addShape(pres.shapes.LINE, { x: 8.78, y: 4.55, w: 0, h: 0.55, line: { color: C.red, width: 1, dashType: 'dash' } });
  card(s, 6.95, 5.12, 5.75, 1.05, 'FDF2F2', 'E8C4C4');
  s.addText('No typed path  →  no answer', { x: 7.15, y: 5.28, w: 5.3, h: 0.3, fontFace: SANS, fontSize: 15, bold: true, color: C.red, margin: 0 });
  s.addText('The refusal is a graph result, not a prompt instruction. A shared word is never enough.', { x: 7.15, y: 5.62, w: 5.2, h: 0.4, fontFace: SANS, fontSize: 11, color: '7A4A4A', margin: 0 });

  s.addText('Deterministic · offline · no API keys', { x: M, y: 5.35, w: 5.2, h: 0.3, fontFace: MONO, fontSize: 10, color: C.muted2, charSpacing: 1, margin: 0 });
  s.addNotes('This slide is the mental model. Point at the branch: refusal is designed, not an error state.');
}

/* ============================ 4 · schema ============================ */
{
  const s = pres.addSlide();
  s.background = { color: C.light };
  page(s, 4);
  label(s, 'THE MODEL', M, 0.62);
  txt(s, 'The graph is the product.', M, 0.92, 8, 0.6, { fontSize: 33, bold: true });
  txt(s, 'The same module carries different names across years; the same question crosses commits, threads and people. That is a graph, not a text index.', M, 1.55, 8.3, 0.45, { fontSize: 13.5, color: C.muted, lineSpacingMultiple: 1.05 });

  const node = (x, y, w, text, fill, color) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.52, rectRadius: 0.06, fill: { color: fill }, line: { color, width: 1 } });
    s.addText(text, { x: x + 0.1, y: y + 0.13, w: w - 0.2, h: 0.26, fontFace: MONO, fontSize: 10.5, color, align: 'center', margin: 0 });
  };
  node(4.45, 2.75, 1.95, 'commit', 'FBF3E6', C.amberDeep);
  node(2.05, 2.05, 1.95, 'config key', 'EAF6F4', C.teal);
  node(2.05, 3.55, 1.95, 'API member', 'EAF6F4', C.teal);
  node(7.05, 2.0, 1.95, 'person', 'F1EEFC', C.violet);
  node(7.15, 3.55, 1.95, 'PR / issue', 'EAF5EF', '1E7A55');
  node(4.35, 4.55, 2.1, 'release note', 'F1F3F6', C.muted);

  const edge = (x1, y1, x2, y2, color = C.muted2, dash = false) => s.addShape(pres.shapes.LINE, {
    x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color, width: 1.1, dashType: dash ? 'dash' : 'solid' }
  });
  edge(4.45, 2.95, 4.0, 2.45);
  edge(4.45, 3.2, 4.0, 3.7);
  edge(6.4, 2.9, 7.05, 2.35);
  edge(6.4, 3.15, 7.15, 3.7);
  edge(5.4, 3.27, 5.4, 4.55, C.muted2, true);

  const tag = (x, y, text, color = C.muted) => s.addText(text, { x, y, w: 1.3, h: 0.18, fontFace: MONO, fontSize: 7.5, color, margin: 0, charSpacing: 0.6 });
  tag(4.18, 2.55, 'CHANGED');
  tag(4.18, 3.55, 'CHANGED');
  tag(6.5, 2.42, 'AUTHORED_BY');
  tag(6.55, 3.35, 'IN_PR / REFERENCES');
  tag(5.5, 3.95, 'DOCUMENTS');

  // revert pair
  node(4.5, 5.55, 1.85, 'revert commit', 'FDF2F2', C.red);
  s.addShape(pres.shapes.LINE, { x: 5.4, y: 5.55, w: 0, h: -0.45, line: { color: C.red, width: 1.2, dashType: 'dash' } });
  s.addText('REVERTS', { x: 5.55, y: 5.16, w: 1.1, h: 0.18, fontFace: MONO, fontSize: 7.5, color: C.red, margin: 0 });

  const stats = [['8,982', 'nodes'], ['30,597', 'typed edges'], ['96', 'code entities'], ['1,312', 'doc lines']];
  stats.forEach(([n, l], i) => {
    const y = 1.65 + i * 1.12;
    s.addText(n, { x: 9.85, y, w: 2.6, h: 0.38, fontFace: MONO, fontSize: 22, color: C.ink, margin: 0 });
    s.addText(l, { x: 9.87, y: y + 0.4, w: 2.6, h: 0.2, fontFace: MONO, fontSize: 8.5, color: C.muted2, charSpacing: 1.2, margin: 0 });
  });
  rule(s, 9.85, 6.1, 2.8);
  s.addText('Only commits reachable from HEAD can govern shipped code. An unmerged x-powered-by removal is excluded, on purpose.', {
    x: 9.85, y: 6.2, w: 2.85, h: 0.7, fontFace: SANS, fontSize: 9.5, color: C.muted, lineSpacingMultiple: 1.1, margin: 0
  });
  s.addNotes('If asked about Neo4j: the model exports to AuraDB with one command. The demo runs embedded for offline determinism.');
}

/* ============================ 5 · demo query parser ============================ */
const imageSlide = ({ n, kicker, title, bullets, quote, attribution, img, caption, note }) => {
  const s = pres.addSlide();
  s.background = { color: C.light };
  page(s, n);
  label(s, kicker, M, 0.62);
  txt(s, title, M, 0.95, 4.35, 1.25, { fontSize: 27, bold: true, lineSpacingMultiple: 1.02 });

  bullets.forEach(([lead, body], i) => {
    const y = 2.42 + i * 1.02;
    s.addText(lead, { x: M, y, w: 4.2, h: 0.25, fontFace: MONO, fontSize: 9.5, color: C.amberDeep, charSpacing: 0.8, margin: 0 });
    s.addText(body, { x: M, y: y + 0.25, w: 4.15, h: 0.62, fontFace: SANS, fontSize: 12.5, color: C.ink, lineSpacingMultiple: 1.12, margin: 0 });
  });

  if (quote) {
    card(s, M, 5.5, 4.25, 1.25, C.dark, C.dark);
    s.addText(`“${quote}”`, { x: M + 0.18, y: 5.6, w: 3.9, h: 0.75, fontFace: SANS, fontSize: 10.5, italic: true, color: 'E6ECF6', lineSpacingMultiple: 1.1, margin: 0 });
    s.addText(attribution, { x: M + 0.18, y: 6.38, w: 3.9, h: 0.2, fontFace: MONO, fontSize: 7.5, color: C.amber, margin: 0 });
  }

  // screenshot frame, sized to the image's real aspect ratio
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.12, y: 1.12, w: 7.58, h: 5.55, rectRadius: 0.08, fill: { color: C.dark }, line: { color: '2A3648', width: 1 }, shadow: shadow() });
  const dim = pngSize(img);
  const scale = Math.min(7.34 / dim.w, 5.31 / dim.h);
  const iw = dim.w * scale, ih = dim.h * scale;
  s.addImage({ path: img, x: 5.24 + (7.34 - iw) / 2, y: 1.24 + (5.31 - ih) / 2, w: iw, h: ih });
  if (caption) s.addText(caption, { x: 5.12, y: 6.75, w: 7.58, h: 0.22, fontFace: MONO, fontSize: 8, color: C.muted2, align: 'right', margin: 0 });
  if (note) s.addNotes(note);
  return s;
};

imageSlide({
  n: 5,
  kicker: 'DEMO · A REAL DECISION',
  title: 'Why does the query parser default to simple?',
  bullets: [
    ['THE GOVERNING COMMIT', '450c468d · Czarek · 15 Apr 2018. It replaced the 2014 default of extended.'],
    ['THE DISCUSSION', 'Issue #3361: an XSS-filter bypass through extended query parsing.'],
    ['THE GAP', 'History.md records the new default. It never records the reason.']
  ],
  quote: 'disabling the extended query parsing by default would be one way to solve this issue for the filter.',
  attribution: 'randomdross · issue #3361 · 11 Jul 2017',
  img: 'docs/screenshots/answer-query-parser.png',
  caption: 'LIVE UI · Confidence 82 · 5 verbatim quotes · owner: Douglas Christopher Wilson',
  note: 'Point at the chain, not the verdict. The value of the product is that the chain is clickable.'
});

/* ============================ 6 · CVE ============================ */
imageSlide({
  n: 6,
  kicker: 'DEMO · SUPERSESSION',
  title: 'A dead decision, caught before it is quoted.',
  bullets: [
    ['THE PATCH', '2f64f68c · 01 Dec 2025. A security fix for CVE-2024-51999.'],
    ['THE REVERT', '697547cd · same day. The graph carries an explicit REVERTS edge.'],
    ['THE RECORD', 'History.md 5.2.1: the CVE was rejected and the change fully reverted.']
  ],
  quote: 'There is no actual security vulnerability associated with this behavior. CVE-2024-51999 has been rejected.',
  attribution: 'History.md · express 5.2.1',
  img: 'docs/screenshots/answer-cve.png',
  caption: 'LIVE UI · the answer leads with the reversal · old patch shown, never presented as current',
  note: 'This is the exact failure mode T1.1 names. A reversed decision sits in the archive looking authoritative.'
});

/* ============================ 7 · refusal ============================ */
{
  const s = pres.addSlide();
  s.background = { color: C.light };
  page(s, 7);
  label(s, 'DEMO · REFUSAL', M, 0.62);
  txt(s, 'The answer is sometimes no.', M, 0.95, 4.3, 0.9, { fontSize: 30, bold: true });
  txt(s, '“Why does Express use Redis for sessions?”', M, 1.95, 4.2, 0.55, { fontSize: 14.5, italic: true, color: C.ink });

  const miss = [
    ['No entity', 'Redis is not a node in this graph.'],
    ['No code path', 'No config key, API member or file connects to the question.'],
    ['No decision', 'No commit, PR or issue records a choice about it.']
  ];
  miss.forEach(([a, b], i) => {
    const y = 2.75 + i * 0.94;
    rule(s, M, y - 0.1, 4.1);
    s.addText(a, { x: M, y, w: 1.55, h: 0.25, fontFace: MONO, fontSize: 9.5, color: C.red, margin: 0 });
    s.addText(b, { x: M + 1.6, y: y - 0.03, w: 2.5, h: 0.55, fontFace: SANS, fontSize: 11.5, color: C.muted, lineSpacingMultiple: 1.1, margin: 0 });
  });
  s.addText('A vector search would return the nearest dependency commit. That is the bug, not the feature.', {
    x: M, y: 5.75, w: 4.2, h: 0.7, fontFace: SANS, fontSize: 12, bold: true, color: C.ink, lineSpacingMultiple: 1.1, margin: 0
  });

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.12, y: 1.12, w: 7.58, h: 5.55, rectRadius: 0.08, fill: { color: C.dark }, line: { color: '2A3648', width: 1 }, shadow: shadow() });
  { const dim = pngSize('docs/screenshots/refusal.png'); const scale = Math.min(7.34 / dim.w, 5.31 / dim.h);
    s.addImage({ path: 'docs/screenshots/refusal.png', x: 5.24 + (7.34 - dim.w * scale) / 2, y: 1.24 + (5.31 - dim.h * scale) / 2, w: dim.w * scale, h: dim.h * scale }); }
  s.addText('LIVE UI · trust 6 · three named gaps · closest commit labelled “not evidence”', { x: 5.12, y: 6.75, w: 7.58, h: 0.22, fontFace: MONO, fontSize: 8, color: C.muted2, align: 'right', margin: 0 });
  s.addNotes('This is the honesty slide. Do not apologise for the refusal; it is the product decision.');
}

/* ============================ 8 · trust ============================ */
{
  const s = pres.addSlide();
  s.background = { color: C.light };
  page(s, 8);
  label(s, 'TRUST HARNESS', M, 0.62);
  txt(s, 'Trust is part of the demo.', M, 0.92, 8, 0.6, { fontSize: 33, bold: true });
  txt(s, 'The same 13 cases run at request time. Two of them must refuse; the low-confidence one must stay low.', M, 1.55, 8.6, 0.5, { fontSize: 14, color: C.muted });

  s.addText('13/13', { x: M, y: 2.25, w: 2.2, h: 0.75, fontFace: MONO, fontSize: 54, color: C.ink, margin: 0 });
  s.addText('cases passing', { x: M, y: 3.02, w: 2.2, h: 0.25, fontFace: MONO, fontSize: 9, color: C.muted2, charSpacing: 1.4, margin: 0 });
  s.addText('30/30', { x: M, y: 3.62, w: 2.2, h: 0.6, fontFace: MONO, fontSize: 34, color: C.teal, margin: 0 });
  s.addText('engine assertions', { x: M, y: 4.25, w: 2.3, h: 0.25, fontFace: MONO, fontSize: 9, color: C.muted2, charSpacing: 1.4, margin: 0 });

  const rows = [
    ['Query parser default', '450c468d + XSS quote', 'pass'],
    ['clearCookie ignore', '82fc12a4 + reason', 'pass'],
    ['CVE-2024-51999', 'reversal + “rejected”', 'pass'],
    ['sendfile → sendFile', 'one entity, retired name', 'pass'],
    ['Redis sessions', 'refusal', 'pass'],
    ['Retry limit three', 'refusal', 'pass'],
    ['Line 715', 'author ≠ governing commit', 'pass']
  ];
  const table = [
    [
      { text: 'CASE', options: { fontFace: MONO, fontSize: 8.5, color: C.muted2, charSpacing: 1.2 } },
      { text: 'EXPECTED EVIDENCE', options: { fontFace: MONO, fontSize: 8.5, color: C.muted2, charSpacing: 1.2 } },
      { text: 'RESULT', options: { fontFace: MONO, fontSize: 8.5, color: C.muted2, charSpacing: 1.2 } }
    ],
    ...rows.map(([a, b, c]) => [
      { text: a, options: { fontFace: SANS, fontSize: 11, color: C.ink } },
      { text: b, options: { fontFace: SANS, fontSize: 10.5, color: C.muted } },
      { text: c.toUpperCase(), options: { fontFace: MONO, fontSize: 8.5, color: '1E7A55' } }
    ])
  ];
  s.addTable(table, {
    x: 3.15, y: 2.15, w: 6.1,
    colW: [2.0, 2.75, 1.35],
    rowH: 0.42,
    border: { pt: 0.5, color: C.line },
    fill: { color: C.white },
    margin: 0.07,
    valign: 'middle'
  });

  // right: line-level proof
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 9.55, y: 1.5, w: 3.15, h: 4.7, rectRadius: 0.07, fill: { color: C.dark }, line: { color: '2A3648', width: 1 }, shadow: shadow() });
  s.addText('LINE 715', { x: 9.75, y: 1.68, w: 1.5, h: 0.2, fontFace: MONO, fontSize: 8.5, color: C.amber, charSpacing: 1.5, margin: 0 });
  s.addText('res.clearCookie = function clearCookie(name, options) {', { x: 9.75, y: 1.98, w: 2.75, h: 0.5, fontFace: MONO, fontSize: 8.5, color: 'DDE6F3', margin: 0 });
  s.addShape(pres.shapes.LINE, { x: 9.75, y: 2.62, w: 2.7, h: 0, line: { color: '2A3648', width: 0.8 } });
  s.addText('WRITTEN BY', { x: 9.75, y: 2.78, w: 1.4, h: 0.18, fontFace: MONO, fontSize: 7.5, color: '8FA0B8', charSpacing: 1.2, margin: 0 });
  s.addText('bb53b20d · 2015', { x: 9.75, y: 2.98, w: 2.4, h: 0.22, fontFace: MONO, fontSize: 10.5, color: 'DDE6F3', margin: 0 });
  s.addText('GOVERNED BY', { x: 9.75, y: 3.38, w: 1.5, h: 0.18, fontFace: MONO, fontSize: 7.5, color: '8FA0B8', charSpacing: 1.2, margin: 0 });
  s.addText('82fc12a4 · 2024', { x: 9.75, y: 3.58, w: 2.4, h: 0.22, fontFace: MONO, fontSize: 10.5, color: C.amber, margin: 0 });
  s.addText('The text is older than its behaviour. A signature diff misses it; blame over the function span does not.', {
    x: 9.75, y: 4.05, w: 2.7, h: 1.1, fontFace: SANS, fontSize: 10, color: 'AAB7C8', lineSpacingMultiple: 1.15, margin: 0
  });
  s.addText('trust 82', { x: 9.75, y: 5.55, w: 1.4, h: 0.25, fontFace: MONO, fontSize: 9, color: C.teal, margin: 0 });

  s.addText('Every case is visible, including the ones designed to fail.', { x: 3.15, y: 5.55, w: 5.8, h: 0.3, fontFace: SANS, fontSize: 11, italic: true, color: C.muted, margin: 0 });
  s.addNotes('Open /api/eval on request if a judge wants to see the raw results.');
}

/* ============================ 9 · engineering ============================ */
{
  const s = pres.addSlide();
  s.background = { color: C.light };
  page(s, 9);
  label(s, 'UNDER THE HOOD', M, 0.62);
  txt(s, 'How it is built.', M, 0.92, 7, 0.6, { fontSize: 33, bold: true });
  txt(s, 'Three git passes, one graph file, a deterministic reasoner. No service dependency in the demo path.', M, 1.55, 9, 0.5, { fontSize: 14, color: C.muted });

  const boxes = [
    ['GIT HISTORY', '6,183 commits', 'metadata · numstat · patch\nrenames · blame · release notes'],
    ['GRAPH', '8,982 / 30,597', 'commits, entities, people,\nPRs, issues, docs, markers'],
    ['REASONER', 'link · walk · score', 'entity resolution, supersession,\nconfidence, refusal'],
    ['ANSWER', 'quote or refuse', 'extractive; every sentence has\nauthor, date and URL']
  ];
  boxes.forEach(([t, n, b], i) => {
    const x = M + i * 3.08;
    card(s, x, 2.35, 2.72, 2.55, C.white);
    s.addText(t, { x: x + 0.2, y: 2.5, w: 2.3, h: 0.2, fontFace: MONO, fontSize: 8.5, color: C.amberDeep, charSpacing: 1.3, margin: 0 });
    s.addText(n, { x: x + 0.2, y: 2.78, w: 2.35, h: 0.34, fontFace: MONO, fontSize: 15, color: C.ink, margin: 0 });
    s.addText(b, { x: x + 0.2, y: 3.3, w: 2.3, h: 1.15, fontFace: SANS, fontSize: 10.5, color: C.muted, lineSpacingMultiple: 1.15, margin: 0 });
    if (i < 3) s.addText('→', { x: x + 2.76, y: 3.4, w: 0.28, h: 0.3, fontFace: SANS, fontSize: 15, color: C.muted2, margin: 0 });
  });

  const stats = [['7 MB', 'graph file'], ['~110 ms', 'boot (warm)'], ['30–70 ms', 'per question'], ['0', 'API keys']];
  stats.forEach(([n, l], i) => {
    const x = M + i * 3.08;
    s.addText(n, { x, y: 5.5, w: 2.6, h: 0.4, fontFace: MONO, fontSize: 20, color: C.ink, margin: 0 });
    s.addText(l, { x, y: 5.95, w: 2.6, h: 0.2, fontFace: MONO, fontSize: 8.5, color: C.muted2, charSpacing: 1.1, margin: 0 });
  });
  rule(s, M, 6.35, 12.0);
  s.addText('Neo4j AuraDB path: npm run export:cypher → CSVs + idempotent import + the same traversals in Cypher. The demo runs embedded so it stays offline and reproducible.', {
    x: M, y: 6.45, w: 11.8, h: 0.4, fontFace: SANS, fontSize: 10, color: C.muted, margin: 0
  });
  s.addNotes('Say explicitly: no model call, no network. If asked about scale, the ingest is linear in commits; the graph is 7 MB for 17 years of Express.');
}

/* ============================ 10 · close ============================ */
{
  const s = pres.addSlide();
  s.background = { color: C.dark };
  s.addText('Ask it something\nit cannot answer.', {
    x: M, y: 1.25, w: 9.5, h: 2.0, fontFace: SANS, fontSize: 46, bold: true, color: C.white, lineSpacingMultiple: 0.98, margin: 0
  });
  s.addText('The refusal is the feature. 6,183 commits, 30,597 edges, and still no invented answers.', {
    x: M, y: 3.45, w: 8.8, h: 0.6, fontFace: SANS, fontSize: 17, color: 'AAB7C8', margin: 0
  });

  const facts = [['6,183', 'commits reachable from HEAD'], ['13/13', 'trust cases, refusals included'], ['0', 'model calls in the demo']];
  facts.forEach(([n, l], i) => {
    const y = 4.75 + i * 0.62;
    s.addText(n, { x: M, y, w: 1.6, h: 0.3, fontFace: MONO, fontSize: 18, color: C.amber, margin: 0 });
    s.addText(l, { x: M + 1.75, y: y + 0.04, w: 4.5, h: 0.3, fontFace: SANS, fontSize: 12.5, color: 'AAB7C8', margin: 0 });
  });

  s.addText('CodeCompass', { x: 9.6, y: 4.85, w: 3.2, h: 0.4, fontFace: SANS, fontSize: 20, bold: true, color: C.white, align: 'right', margin: 0 });
  s.addText('hackFront India 2026\nTheme T1 · PS T1.1\nExpress · 2009 → 2026', {
    x: 9.6, y: 5.32, w: 3.2, h: 0.9, fontFace: MONO, fontSize: 9, color: '7E8CA1', align: 'right', lineSpacingMultiple: 1.5, margin: 0
  });
  s.addText('no model in the loop', { x: M, y: 6.95, w: 3, h: 0.2, fontFace: MONO, fontSize: 8.5, color: '58657A', margin: 0 });
  s.addNotes('End on the refusal line. It is the most memorable claim and it is demonstrable.');
}

pres.writeFile({ fileName: 'docs/CodeCompass-hackFront-India.pptx' })
  .then(f => console.log('wrote', f))
  .catch(e => { console.error(e); process.exit(1); });

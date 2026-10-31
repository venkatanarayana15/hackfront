// ---- the exact traversals the product runs ----

// 1. Why does the query parser default to 'simple'?
MATCH (a:Node {type:'config', label:'query parser'})<-[ch:CHANGED]-(c:Node)
RETURN c.label, c.date, ch.before, ch.after ORDER BY c.date;

// 2. Has that decision been superseded or reverted?
MATCH (newer:Node)-[s:SUPERSEDES]->(older:Node)
WHERE older.id CONTAINS '450c468d' OR newer.id CONTAINS '450c468d'
RETURN newer.label, type(s), s.kind, older.label;

// 3. The CVE patch that was reverted the same day
MATCH (rev:Node)-[:REVERTS]->(patched:Node)
WHERE patched.label CONTAINS 'CVE-2024-51999'
OPTIONAL MATCH (rev)-[:AUTHORED_BY]->(p:Node)
RETURN rev.label, rev.date, patched.label, p.label;

// 4. Person to ask: authorship + thread + ownership
MATCH (c:Node)-[:AUTHORED_BY]->(p:Node)-[o:OWNS]->(f:Node)
WHERE c.label CONTAINS 'query parser'
RETURN p.label, f.label, o.commits ORDER BY o.commits DESC LIMIT 5;

// 5. Code entities whose old spelling was retired
MATCH (a:Node)
WHERE a.type IN ['config','api']
WITH a, apoc.convert.fromJsonMap(a.props) AS p
WHERE p.retiredNames IS NOT NULL AND size(p.retiredNames) > 0
RETURN a.label AS entity, p.retiredNames AS retired;

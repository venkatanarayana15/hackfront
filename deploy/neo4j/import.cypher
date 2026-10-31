// CodeCompass → Neo4j AuraDB import
// 1. Create a free AuraDB instance, open Neo4j Browser / Query.
// 2. Upload nodes.csv and rels.csv to the import area, or use `neo4j-admin database import`.
// 3. Run this file. Requires APOC core (enabled by default on AuraDB).

CREATE CONSTRAINT node_id IF NOT EXISTS FOR (n:Node) REQUIRE n.id IS UNIQUE;

LOAD CSV WITH HEADERS FROM 'file:///nodes.csv' AS row
MERGE (n:Node {id: row.id})
SET n.label = row.label,
    n.type = row.type,
    n.props = row.props
WITH n, row
CALL apoc.create.addLabels(n, [row.type]) YIELD node
RETURN count(node) AS labelledNodes;

LOAD CSV WITH HEADERS FROM 'file:///rels.csv' AS row
MATCH (a:Node {id: row[':START_ID']})
MATCH (b:Node {id: row[':END_ID']})
CALL apoc.merge.relationship(a, row[':TYPE'], {}, apoc.convert.fromJsonMap(row.props), b) YIELD rel
RETURN count(rel) AS relationships;

// Sanity: 6,183 commits, 904 paths, 96 entities, 30k+ edges
MATCH (n) RETURN labels(n)[0] AS type, count(*) AS n ORDER BY n DESC;
MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS n ORDER BY n DESC;

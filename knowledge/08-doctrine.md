# Doctrine 08 — Scope, Architecture, Demo Rules

## Scope (FREEZE)
- P0: Explain *why* code is the way it is using git history + structure. (Core)
- P0: Works fully offline, zero external API keys. (Demo safety)
- P1: Query bar (natural-language-ish keyword query over commits).
- P1: Per-line attribution panel.
- P2: Sponsor-ready adapter interface (LLM_ENDPOINT / LLM_API_KEY env hook) — presence only, not required.

## Out of scope
- No real GitHub OAuth in demo path (mock repo loads from seed).
- No live LLM inference for the demo (engine is deterministic + labeled).
- No multi-tenant permissions matrix.

## Architecture
```
Browser (React+Vite)  ⇄  Express API (runs locally; deploys as Catalyst Advanced I/O)
                            ├─ GET /api/repos            → list seeded repos
                            ├─ GET /api/repos/:id        → repo tree + files
                            ├─ GET /api/explain/:id/:file?line=N → per-line why
                            └─ POST /api/query           → ask over repo corpus
Engine = deterministic reasoning over injected git history (commits → blame ranges → code structure heuristics)
```

## Demo Rules
1. Demo data = "seeded data labeled as such" — never imply live platform.
2. Demo path must run with `npm run dev` only — no keys, no network.
3. If live LLM adapter is added later, demo must still show offline mode first.
4. Every screen visible in demo must be pre-tested in a 90-second walk.

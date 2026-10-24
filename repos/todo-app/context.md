Product: A simple todo app for individual users to add, complete, edit and delete todos.
Stack: Node.js 22, TypeScript (strict), Express REST API, SQLite via better-sqlite3, Vitest. Minimal static HTML/JS frontend served by the API. Greenfield repo: the first change scaffolds the project (package.json, tsconfig, src/, test/).
Architecture notes: Layers are routes -> services -> repository. Only the repository touches the database. IDs are UUIDs. The database file path comes from the DATABASE_URL env var; tests use an in-memory database.
Conventions: JSON API under /api/v1. Errors return {"error": {"code": "...", "message": "..."}} with correct HTTP status. Timestamps are ISO 8601 UTC. No secrets in the repo; config via env vars. Small modules, no unused dependencies.
Testing: Vitest. Tests live in test/ and are named after the requirement ID (e.g. TODO-001). Run with `npm test`.
Definition of done: every scenario has a passing named test, openspec validate --strict is clean

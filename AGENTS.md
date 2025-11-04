# Repository Guidelines

## Project Structure & Modules
- `server.js`: Node HTTP server + SSE; no external deps.
- `public/`: Client assets (`index.html`, `admin.html`, `client.js`, `style.css`).
- `package.json`: App metadata and `start` script.
- `Dockerfile`, `fly.toml`: Container + Fly.io deploy config.
- `README.md`: Usage, API, and deploy notes.

## Build, Run, and Dev
- `npm start`: Run locally on `http://localhost:3000`.
- `PORT=4000 npm start`: Override port.
- `ADMIN_SECRET=your-secret npm start`: Set admin secret for privileged actions.
- Docker: `docker build -t goc .` then `docker run -p 8080:8080 -e ADMIN_SECRET=... goc`.

## Coding Style & Conventions
- Language: Node.js (>=16). Keep zero external dependencies.
- Indentation: 2 spaces; include semicolons; prefer `const`/`let`.
- Naming: camelCase for JS; files lowercase (`server.js`, `client.js`); CSS classes kebab-case.
- HTTP API: additive, backwards-compatible changes; don’t break SSE event shape (`event: state`).
- Static serving: keep assets under `public/`; avoid directory traversal risks.

## Testing Guidelines
- No formal test suite yet. Use cURL for endpoints:
  - `curl localhost:3000/api/state`
  - `curl -X POST localhost:3000/api/join -H 'content-type: application/json' -d '{"name":"Ada"}'`
  - `curl -X POST localhost:3000/api/subject?secret=... -d '{}'`
- Validate client behavior by loading `/` and `/admin` in two browsers; confirm SSE updates.
- If adding features, include a minimal script under `scripts/` to smoke-test APIs.

## Commit & PR Guidelines
- Commits: clear, imperative, scoped (e.g., "server: add timer reset"). Group related changes.
- PRs: include summary, rationale, screenshots (UI), and manual test steps. Link issues.
- Keep diffs small and focused. Note any API/SSE payload changes explicitly.

## Security & Configuration
- Secrets: set `ADMIN_SECRET` via env or platform secrets; never hardcode or commit.
- Network: SSE uses long-lived connections; ensure proxies don’t buffer (`X-Accel-Buffering: no`).
- Limits: timer duration capped at 30 min; state is in-memory and resets on restart.

## Architecture Overview
- Single-process Node server exposes REST-ish APIs and an SSE stream. Clients render live state and resync periodically.

# Gratitude On Command

Real-time queue and countdown app for meetings. Public users can add their name to a queue and see their position and the live countdown. Admins can set the subject, manage the queue, and control the timer.

No external dependencies: a single Node server with Server-Sent Events (SSE) for realtime updates.

## Features

- Public view: join the queue, see queue with timestamps, live countdown, and connected count.
- Admin view (secret required for actions): set subject, configure/start/stop/reset countdown, pop/clear queue, see connected clients.
- Realtime: all changes broadcast via SSE; clients also resync periodically.

## Run

- Prereq: Node.js 16+
- Optional: set admin secret via `ADMIN_SECRET`. Default is `change-me`.

Commands:

```
npm start
# Server: http://localhost:3000
# Public: http://localhost:3000/
# Admin:  http://localhost:3000/admin
```

Environment variables:

- `PORT`: HTTP port (default 3000)
- `ADMIN_SECRET`: Shared secret for admin actions (default `change-me`)

In the Admin page, enter the secret in the "Admin Secret" box. Actions send it in the `x-admin-secret` header. You can also call APIs directly with `?secret=...` as a query param.

## API (brief)

- `GET /api/state` → current subject, queue, timer, connected count
- `GET /events` (SSE) → `state` events with same payload as `/api/state`
- `POST /api/join` `{ name }` → joins queue
- Admin (require secret):
  - `POST /api/subject` `{ subject }`
  - `POST /api/pop`
  - `POST /api/clear`
  - `POST /api/timer/config` `{ durationMs }`
  - `POST /api/timer/start` `{ durationMs? }`
  - `POST /api/timer/stop`
  - `POST /api/timer/reset`

## Notes

- Timer drift: clients compute time remaining locally and resync every ~15s.
- Persistence: in-memory only. Restarting the server clears state. For persistence, add a lightweight store (e.g., JSON on disk or a DB).

## Deploy (Fly.io + GitHub Actions)

This repo includes a Dockerfile, `fly.toml`, and a GitHub Actions workflow to deploy on push.

1) Create the Fly app once (choose a unique name):

```
fly auth signup   # if new to Fly
fly auth login    # or login
fly apps create <your-app-name>
```

2) Update `fly.toml`:

- Set `app = "<your-app-name>"`

3) Add GitHub repo secrets:

- `FLY_API_TOKEN` → `fly auth token` (or from https://fly.io/user/personal_access_tokens)
- `FLY_APP_NAME` → `<your-app-name>` (optional if you set `fly.toml`)
- `ADMIN_SECRET` → your admin secret value

4) Push to `main` (or `master`). The workflow builds the Docker image and runs `flyctl deploy`. Secrets are set with `flyctl secrets set`.

After deploy, your app is available at: `https://<your-app-name>.fly.dev/`

Alternative hosts: Render, Railway, or Heroku also work. For serverless platforms (Vercel/Netlify), long-lived SSE connections are not ideal; prefer a container host.

## Bootstrap GitHub Repo (gh CLI)

If you use the GitHub CLI (`gh`), you can create the repo, push code, and set the Actions secrets in one command:

```
OWNER=<your-gh-username-or-org> \
REPO=goc \
VISIBILITY=private \
FLY_APP_NAME=<your-fly-app> \
ADMIN_SECRET=<your-admin-secret> \
FLY_API_TOKEN=<fly-api-token> \
scripts/bootstrap_github.sh
```

Prereqs:
- `gh auth login` (ensure you’re logged in)
- `fly apps create <your-fly-app>` and optionally `fly secrets set ADMIN_SECRET=... -a <your-fly-app>`

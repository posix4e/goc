# Gratitude On Command

Real-time queue and countdown app for meetings. Public users can add their name to a queue and see their position and the live countdown. Admins can set the subject, manage the queue, and control the timer.

No external dependencies: a single Node server with Server-Sent Events (SSE) for realtime updates.

## Features

- Public view: join the queue, see queue with timestamps, live countdown, and connected count.
- Admin view (secret required for actions): set subject, configure/start/stop/reset countdown, pop/clear queue, see connected clients.
- Realtime: all changes broadcast via SSE; clients also resync periodically.
- Aplausos: when the timer runs out, clients show a big 3‑2‑1 countdown and a full‑screen 80s rainbow “¡APLAUSOS!” flash. Admins can also trigger this manually.

## Run

- Prereq: Node.js 16+
- Optional: set admin secret via `ADMIN_SECRET`. Default is `change-me`.
- Default timer: 3 minutes (can be configured by admin).

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
  - `POST /api/clap` → broadcast a clap event (manual trigger)

## Notes

- Timer drift: clients compute time remaining locally and resync every ~15s.
- Persistence: in-memory only. Restarting the server clears state. For persistence, add a lightweight store (e.g., JSON on disk or a DB).

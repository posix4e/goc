"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-me";

const state = {
  subject: "",
  queue: [], // { id, name, joinedAt }
  timer: {
    durationMs: 180000, // default 3 minutes
    startAt: null, // ms epoch when started, null when stopped
    speaker: null // { id, name } snapshot when started
  }
};

let nextId = 1;
const sseClients = new Set(); // of { id, res }
let nextClientId = 1;

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function text(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
  res.end(body);
}

function notFound(res) {
  text(res, 404, "Not found");
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (chunk) => {
      buf += chunk;
      if (buf.length > 1e6) {
        reject(new Error("request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      const contentType = req.headers["content-type"] || "";
      if (contentType.includes("application/json")) {
        try {
          resolve(JSON.parse(buf || "{}"));
        } catch (e) {
          reject(new Error("invalid json"));
        }
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams(buf);
        const obj = {};
        for (const [k, v] of params.entries()) obj[k] = v;
        resolve(obj);
      } else {
        resolve({ raw: buf });
      }
    });
    req.on("error", reject);
  });
}

function nowMs() {
  return Date.now();
}

function getPublicState() {
  // Do not leak admin secret; add derived info only
  return {
    subject: state.subject,
    queue: state.queue,
    timer: state.timer,
    stats: state.stats || {},
    serverNow: nowMs(),
    connected: sseClients.size
  };
}

function broadcast(event, dataObj) {
  const payload = `event: ${event}\n` +
    `data: ${JSON.stringify(dataObj)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(payload);
    } catch (e) {
      // Drop dead clients
      try { client.res.end(); } catch {}
      sseClients.delete(client);
    }
  }
}

function broadcastState() {
  broadcast("state", getPublicState());
}
function broadcastClap(reason = "manual") {
  broadcast("clap", { reason, at: nowMs() });
}

function ensureStats() {
  if (!state.stats) state.stats = {}; // name -> { totalMs, sessions }
}

function safeAddTalkTime(name, ms) {
  if (!name || !Number.isFinite(ms) || ms <= 0) return;
  ensureStats();
  const key = String(name);
  const s = state.stats[key] || { totalMs: 0, sessions: 0 };
  s.totalMs += Math.max(0, Math.floor(ms));
  s.sessions += 1;
  state.stats[key] = s;
}

function finalizeCurrentSpeaker(reason) {
  const t = state.timer;
  if (t.startAt && t.speaker && t.durationMs) {
    const elapsed = nowMs() - t.startAt;
    const credited = Math.min(Math.max(0, elapsed), t.durationMs);
    safeAddTalkTime(t.speaker.name, credited);
  }
  // Stop timer by default when finalizing
  state.timer.startAt = null;
  state.timer.speaker = null;
}

function isAdmin(reqUrl, headers) {
  const u = url.parse(reqUrl, true);
  const provided = headers["x-admin-secret"] || u.query.secret;
  return provided && String(provided) === String(ADMIN_SECRET);
}

function serveStatic(req, res, pathname) {
  const base = path.join(__dirname, "public");
  let filePath = path.join(base, pathname);
  if (!filePath.startsWith(base)) return notFound(res);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath)) return notFound(res);
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon"
  };
  const type = types[ext] || "application/octet-stream";
  fs.readFile(filePath, (err, data) => {
    if (err) return notFound(res);
    res.writeHead(200, { "Content-Type": type, "Content-Length": data.length });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = url.parse(req.url, true);
    const method = req.method || "GET";
    const pathname = u.pathname || "/";

    // SSE endpoint
    if (method === "GET" && pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no" // for proxies like nginx
      });
      const client = { id: nextClientId++, res };
      sseClients.add(client);
      // Immediately send current state
      res.write(`event: state\n` + `data: ${JSON.stringify(getPublicState())}\n\n`);
      // Heartbeat to keep connections alive
      const hb = setInterval(() => {
        try { res.write(`: ping ${Date.now()}\n\n`); } catch {}
      }, 15000);
      req.on("close", () => {
        clearInterval(hb);
        sseClients.delete(client);
        broadcastState(); // update connected count
      });
      return;
    }

    // APIs
    if (method === "GET" && pathname === "/api/state") {
      return json(res, 200, getPublicState());
    }

    if (method === "POST" && pathname === "/api/join") {
      const body = await parseBody(req);
      const name = String((body.name || "").trim()).slice(0, 100);
      if (!name) return json(res, 400, { error: "name required" });
      const id = nextId++;
      const entry = { id, name, joinedAt: nowMs() };
      state.queue.push(entry);
      broadcastState();
      return json(res, 200, { ok: true, id, position: state.queue.findIndex(e => e.id === id) + 1 });
    }

    if (method === "POST" && pathname === "/api/pop") {
      if (!isAdmin(req.url, req.headers)) return json(res, 403, { error: "forbidden" });
      // credit current speaker, then pop
      finalizeCurrentSpeaker("pop");
      const popped = state.queue.shift() || null;
      broadcastState();
      return json(res, 200, { ok: true, popped });
    }

    if (method === "POST" && pathname === "/api/clear") {
      if (!isAdmin(req.url, req.headers)) return json(res, 403, { error: "forbidden" });
      state.queue = [];
      broadcastState();
      return json(res, 200, { ok: true });
    }

    if (method === "POST" && pathname === "/api/subject") {
      if (!isAdmin(req.url, req.headers)) return json(res, 403, { error: "forbidden" });
      const body = await parseBody(req);
      state.subject = String((body.subject || "").trim()).slice(0, 200);
      broadcastState();
      return json(res, 200, { ok: true, subject: state.subject });
    }

    if (method === "POST" && pathname === "/api/timer/config") {
      if (!isAdmin(req.url, req.headers)) return json(res, 403, { error: "forbidden" });
      const body = await parseBody(req);
      let d = Number(body.durationMs);
      if (!Number.isFinite(d) || d <= 0) return json(res, 400, { error: "invalid durationMs" });
      d = Math.min(d, 30 * 60 * 1000); // cap at 30 minutes
      state.timer.durationMs = d;
      broadcastState();
      return json(res, 200, { ok: true, timer: state.timer });
    }

    if (method === "POST" && pathname === "/api/timer/start") {
      if (!isAdmin(req.url, req.headers)) return json(res, 403, { error: "forbidden" });
      const body = await parseBody(req).catch(() => ({}));
      if (body && body.durationMs) {
        let d = Number(body.durationMs);
        if (Number.isFinite(d) && d > 0) {
          state.timer.durationMs = Math.min(d, 30 * 60 * 1000);
        }
      }
      state.timer.startAt = nowMs();
      state.timer.speaker = state.queue[0] ? { id: state.queue[0].id, name: state.queue[0].name } : null;
      broadcastState();
      return json(res, 200, { ok: true, timer: state.timer });
    }

    if (method === "POST" && pathname === "/api/timer/stop") {
      if (!isAdmin(req.url, req.headers)) return json(res, 403, { error: "forbidden" });
      finalizeCurrentSpeaker("stop");
      broadcastState();
      return json(res, 200, { ok: true, timer: state.timer });
    }

    if (method === "POST" && pathname === "/api/timer/reset") {
      if (!isAdmin(req.url, req.headers)) return json(res, 403, { error: "forbidden" });
      // credit previous, then restart with current queue head as speaker
      finalizeCurrentSpeaker("reset");
      state.timer.startAt = nowMs();
      state.timer.speaker = state.queue[0] ? { id: state.queue[0].id, name: state.queue[0].name } : null;
      broadcastState();
      return json(res, 200, { ok: true, timer: state.timer });
    }

    if (method === "POST" && pathname === "/api/clap") {
      if (!isAdmin(req.url, req.headers)) return json(res, 403, { error: "forbidden" });
      broadcastClap("manual");
      return json(res, 200, { ok: true });
    }

    // Static files and pages
    if (pathname === "/") {
      return serveStatic(req, res, "/index.html");
    }
    if (pathname === "/admin") {
      return serveStatic(req, res, "/admin.html");
    }
    if (pathname.startsWith("/public/")) {
      return serveStatic(req, res, pathname.replace("/public", ""));
    }
    // Fallback to serve from /public
    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error("Error handling request:", err);
    try {
      json(res, 500, { error: "internal" });
    } catch {}
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Admin secret set? ${ADMIN_SECRET === "change-me" ? "NO (using default)" : "YES"}`);
});

(() => {
  const $ = (sel) => document.querySelector(sel);

  const secretInput = $("#secret");
  const subjectInput = $("#subject");
  const connectedEl = $("#connected");
  const qsizeEl = $("#qsize");
  const queueEl = $("#queue");

  const durationInput = $("#duration");
  const startBtn = $("#start");
  const stopBtn = $("#stop");
  const resetBtn = $("#reset");
  const applyBtn = $("#apply");
  const clapBtn = $("#clap");
  const remainingEl = $("#remaining");
  const configuredEl = $("#configured");

  const popBtn = $("#pop");
  const clearBtn = $("#clear");

  let appState = null;

  try { const saved = sessionStorage.getItem("adminSecret"); if (saved) secretInput.value = saved; } catch {}

  function msToClock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function render() {
    if (!appState) return;
    connectedEl.textContent = String(appState.connected ?? 0);
    qsizeEl.textContent = String(appState.queue?.length ?? 0);
    configuredEl.textContent = msToClock(appState.timer?.durationMs || 0);
    durationInput.value = Math.floor((appState.timer?.durationMs || 0) / 1000);

    const t = appState.timer || { durationMs: 0, startAt: null };
    const remaining = t.startAt ? Math.max(0, t.durationMs - (Date.now() - t.startAt)) : t.durationMs;
    remainingEl.textContent = msToClock(remaining);

    queueEl.innerHTML = "";
    (appState.queue || []).forEach((item, idx) => {
      const li = document.createElement("li");
      const when = new Date(item.joinedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
      li.textContent = `#${idx+1} ${item.name} • ${when}`;
      queueEl.appendChild(li);
    });
  }

  function adminHeaders() {
    const secret = secretInput.value.trim();
    if (secret) sessionStorage.setItem("adminSecret", secret);
    return secret ? { "x-admin-secret": secret } : {};
  }

  async function postJSON(path, body) {
    const r = await fetch(path + (path.includes('?') ? '' : ''), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
      body: JSON.stringify(body || {})
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`HTTP ${r.status}: ${txt}`);
    }
    return r.json();
  }

  async function sync() {
    try {
      const r = await fetch("/api/state");
      if (r.ok) {
        appState = await r.json();
        render();
      }
    } catch {}
  }

  // SSE
  function connectSSE() {
    const es = new EventSource("/events");
    es.addEventListener("state", (ev) => {
      try { appState = JSON.parse(ev.data); render(); } catch {}
    });
    es.addEventListener("clap", () => {
      try { window.__triggerClap && window.__triggerClap(); } catch {}
    });
  }

  subjectInput.addEventListener("change", async () => {
    try { await postJSON("/api/subject", { subject: subjectInput.value }); } catch (e) { alert(e.message); }
  });

  applyBtn.addEventListener("click", async () => {
    const seconds = Math.max(10, Math.min(1800, Number(durationInput.value) || 0));
    try { await postJSON("/api/timer/config", { durationMs: seconds * 1000 }); } catch (e) { alert(e.message); }
  });

  startBtn.addEventListener("click", async () => {
    const seconds = Math.max(10, Math.min(1800, Number(durationInput.value) || 0));
    try { await postJSON("/api/timer/start", { durationMs: seconds * 1000 }); } catch (e) { alert(e.message); }
  });

  stopBtn.addEventListener("click", async () => {
    try { await postJSON("/api/timer/stop"); } catch (e) { alert(e.message); }
  });

  resetBtn.addEventListener("click", async () => {
    try { await postJSON("/api/timer/reset"); } catch (e) { alert(e.message); }
  });

  popBtn.addEventListener("click", async () => {
    try { await postJSON("/api/pop"); } catch (e) { alert(e.message); }
  });

  clearBtn.addEventListener("click", async () => {
    if (!confirm("Clear entire queue?")) return;
    try { await postJSON("/api/clear"); } catch (e) { alert(e.message); }
  });

  clapBtn.addEventListener("click", async () => {
    try { await postJSON("/api/clap"); } catch (e) { alert(e.message); }
  });

  // Start
  connectSSE();
  sync();
  setInterval(sync, 15000);
  setInterval(render, 250);

  // Inject clap overlay if not present (shared with public page)
  (function ensureClapOverlay(){
    if (document.querySelector('.clap-overlay')) return;
    const el = document.createElement('div');
    el.className = 'clap-overlay';
    el.innerHTML = '<div class="clap-content"><div class="count">3</div><div class="clap-text">¡APLAUSOS!</div></div>';
    document.body.appendChild(el);
  })();
})();

(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const subjectEl = $("#subject");
  const timerRemainingEl = $("#timer-remaining");
  const timerConfigEl = $("#timer-config");
  const connectedEl = $("#connected");
  const joinForm = $("#join-form");
  const nameInput = $("#name");
  const positionEl = $("#position");
  const queueEl = $("#queue");

  let appState = null; // last-known state from server
  let myId = null;

  try { myId = JSON.parse(localStorage.getItem("myId")); } catch {}

  function msToClock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function render() {
    if (!appState) return;
    subjectEl.textContent = appState.subject || "Meeting";
    connectedEl.textContent = String(appState.connected ?? 0);
    timerConfigEl.textContent = msToClock(appState.timer?.durationMs || 0);

    // Countdown
    const t = appState.timer || { durationMs: 0, startAt: null };
    if (t.startAt) {
      const elapsed = Date.now() - t.startAt;
      const remaining = Math.max(0, t.durationMs - elapsed);
      timerRemainingEl.textContent = msToClock(remaining);
      timerRemainingEl.style.color = remaining === 0 ? 'var(--danger)' : 'var(--fg)';
    } else {
      timerRemainingEl.textContent = msToClock(t.durationMs);
      timerRemainingEl.style.color = 'var(--fg)';
    }

    // Queue
    queueEl.innerHTML = "";
    const q = appState.queue || [];
    q.forEach((item, idx) => {
      const li = document.createElement("li");
      if (item.id === myId) li.classList.add("me");
      const when = new Date(item.joinedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
      li.innerHTML = `<strong>${escapeHtml(item.name)}</strong> <span class="meta">#${idx+1} • ${when}</span>`;
      queueEl.appendChild(li);
    });

    // Position
    const idx = q.findIndex(x => x.id === myId);
    if (myId && idx >= 0) {
      positionEl.textContent = `You are #${idx + 1} in queue`;
    } else {
      positionEl.textContent = "";
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // SSE subscription
  function connectSSE() {
    const es = new EventSource("/events");
    es.addEventListener("state", (ev) => {
      try {
        appState = JSON.parse(ev.data);
        render();
      } catch {}
    });
    es.onerror = () => {
      // Reconnect will happen automatically by EventSource
    };
  }

  // Periodic drift correction
  async function sync() {
    try {
      const r = await fetch("/api/state");
      if (r.ok) {
        appState = await r.json();
        render();
      }
    } catch {}
  }
  setInterval(sync, 15000);

  // Join form
  joinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    try {
      const r = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      const data = await r.json();
      if (data && data.id) {
        myId = data.id;
        localStorage.setItem("myId", JSON.stringify(myId));
        nameInput.value = "";
        sync();
      }
    } catch {}
  });

  // Start
  connectSSE();
  sync();
  setInterval(render, 250); // smooth ticking
})();


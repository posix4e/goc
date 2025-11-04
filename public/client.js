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
  const historyEl = $("#history");

  let appState = null; // last-known state from server
  let myId = null;
  let lastStartAt = null;
  let clapShownForStart = false;

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
      if (lastStartAt !== t.startAt) {
        lastStartAt = t.startAt;
        clapShownForStart = false;
      }
      const elapsed = Date.now() - t.startAt;
      const remaining = Math.max(0, t.durationMs - elapsed);
      timerRemainingEl.textContent = msToClock(remaining);
      timerRemainingEl.style.color = remaining === 0 ? 'var(--danger)' : 'var(--fg)';
      if (remaining === 0 && !clapShownForStart) {
        clapShownForStart = true;
        triggerClap();
      }
    } else {
      const paused = Number.isFinite(t.pausedRemainingMs) && (t.pausedRemainingMs || 0) > 0;
      timerRemainingEl.textContent = paused ? msToClock(t.pausedRemainingMs) : msToClock(t.durationMs);
      timerRemainingEl.style.color = 'var(--fg)';
      lastStartAt = null;
      clapShownForStart = false;
    }

    // Queue with prior talk time
    queueEl.innerHTML = "";
    const q = appState.queue || [];
    q.forEach((item, idx) => {
      const li = document.createElement("li");
      if (item.id === myId) li.classList.add("me");
      const when = new Date(item.joinedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
      const stats = (appState.stats && appState.stats[item.name]) || null;
      const prior = stats ? ` • habló ${msToClock(stats.totalMs)}` : "";
      li.innerHTML = `<strong>${escapeHtml(item.name)}</strong> <span class="meta">#${idx+1} • ${when}${prior}</span>`;
      queueEl.appendChild(li);
    });

    // Position
    const idx = q.findIndex(x => x.id === myId);
    if (myId && idx >= 0) {
      positionEl.textContent = `You are #${idx + 1} in queue`;
    } else {
      positionEl.textContent = "";
    }

    // History of speaking (newest first)
    if (historyEl) {
      historyEl.innerHTML = "";
      const hist = (appState.history || []).slice().reverse();
      hist.forEach((h) => {
        const li = document.createElement("li");
        const ended = h.endedAt ? new Date(h.endedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : "";
        const dur = msToClock(h.durationMs || 0);
        li.innerHTML = `<strong>${escapeHtml(h.name)}</strong> <span class="meta">${dur}${ended ? ' • ' + ended : ''}</span>`;
        historyEl.appendChild(li);
      });
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
    es.addEventListener("clap", () => {
      triggerClap();
    });
    es.onerror = () => {
      // Reconnect will happen automatically by EventSource
    };
  }

  // Periodic drift correction
  async function sync() {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
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
  ensureClapOverlay();
  connectSSE();
  sync();
  setInterval(render, 250); // smooth ticking

  function ensureClapOverlay() {
    if (document.querySelector('.clap-overlay')) return;
    const el = document.createElement('div');
    el.className = 'clap-overlay';
    el.innerHTML = '<div class="clap-content"><div class="count">3</div><div class="clap-text">¡APLAUSOS!</div></div>';
    document.body.appendChild(el);
  }

  function triggerClap() {
    ensureClapOverlay();
    const overlay = document.querySelector('.clap-overlay');
    const countEl = overlay.querySelector('.count');
    const clapText = overlay.querySelector('.clap-text');
    overlay.classList.add('show');
    clapText.style.display = 'none';
    countEl.style.display = 'block';
    let nums = [3,2,1];
    let i = 0;
    countEl.textContent = String(nums[i]);
    const step = () => {
      i++;
      if (i < nums.length) {
        countEl.textContent = String(nums[i]);
        setTimeout(step, 700);
      } else {
        countEl.style.display = 'none';
        clapText.style.display = 'block';
        setTimeout(() => {
          overlay.classList.remove('show');
        }, 1500);
      }
    };
    setTimeout(step, 700);
  }

  // Expose for admin page to reuse
  window.__triggerClap = triggerClap;
})();

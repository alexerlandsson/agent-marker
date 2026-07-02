// Agent Marker content script.
// State lives in chrome.storage.local so marks persist across pages/tabs and
// marker mode survives navigation. UI is intentionally raw (functionality first).

(() => {
  if (window.__agentMarkerLoaded) return;
  window.__agentMarkerLoaded = true;

  let open = false;      // sidebar visible (toolbar icon)
  let marking = false;   // marker mode (Mark up button)
  let popupOpen = false;
  let editingId = null;
  let marks = [];

  // --- shadow-root UI host (isolates our controls from page CSS) -----------
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      .panel, .popup, .dialog { pointer-events:auto; box-sizing:border-box; font:13px/1.4 sans-serif; color:#000; background:#fff; border:1px solid #888; }
      .highlight { position:fixed; pointer-events:none; border:2px solid #d00; background:rgba(221,0,0,.12); display:none; }
      .panel { position:fixed; top:0; right:0; width:300px; height:100vh; overflow:auto; padding:8px; display:none; }
      .popup { position:fixed; width:260px; padding:8px; display:none; }
      .dialog { position:fixed; top:5vh; left:50%; transform:translateX(-50%); width:min(700px,90vw); max-height:85vh; overflow:auto; padding:12px; display:none; }
      textarea { width:100%; box-sizing:border-box; }
      ul { list-style:none; margin:0; padding:0; }
      li { border-bottom:1px solid #ddd; padding:6px 0; }
      button { cursor:pointer; }
      .muted { color:#666; }
    </style>
    <div class="highlight"></div>
    <div class="panel">
      <div><b>Agent Marker</b> <span class="muted" id="count"></span></div>
      <button id="toggleMark" style="margin:6px 0;">Mark up</button>
      <ul id="list"></ul>
      <div style="margin-top:8px;display:flex;gap:6px;">
        <button id="send">Send to agent</button>
        <button id="clear">Clear all</button>
      </div>
    </div>
    <div class="popup">
      <div class="muted" id="popupTarget"></div>
      <textarea id="msg" rows="3" placeholder="What should change here?"></textarea>
      <div style="margin-top:6px;display:flex;gap:6px;">
        <button id="ok">OK</button>
        <button id="cancel">Cancel</button>
      </div>
    </div>
    <div class="dialog">
      <div style="display:flex;justify-content:space-between;">
        <b>Prompt for your agent</b>
        <button id="dialogClose">Close</button>
      </div>
      <textarea id="prompt" rows="18" readonly></textarea>
      <button id="copy">Copy prompt</button>
    </div>
  `;
  (document.documentElement || document.body).appendChild(host);

  const $ = (id) => root.getElementById(id);
  const highlight = root.querySelector(".highlight");
  const panel = root.querySelector(".panel");
  const popup = root.querySelector(".popup");
  const dialog = root.querySelector(".dialog");

  let popupEl = null; // page element the popup targets

  // --- helpers ------------------------------------------------------------
  const inOurUI = (e) => e.composedPath().includes(host);

  function cssPath(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      let sel = el.nodeName.toLowerCase();
      if (el.id) { parts.unshift(`#${CSS.escape(el.id)}`); break; }
      if (el.classList.length) sel += "." + [...el.classList].map((c) => CSS.escape(c)).join(".");
      const parent = el.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter((c) => c.nodeName === el.nodeName);
        if (sameTag.length > 1) sel += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
      }
      parts.unshift(sel);
      el = el.parentElement;
    }
    return parts.join(" > ");
  }

  function describe(el) {
    let s = el.nodeName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    if (el.classList.length) s += "." + [...el.classList].join(".");
    return s;
  }

  const save = () => chrome.storage.local.set({ marks });

  // --- marking flow -------------------------------------------------------
  function onMove(e) {
    if (!open || !marking || popupOpen || inOurUI(e)) { highlight.style.display = "none"; return; }
    const el = e.target;
    if (!el || el === document.body) { highlight.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    Object.assign(highlight.style, {
      display: "block", left: r.left + "px", top: r.top + "px",
      width: r.width + "px", height: r.height + "px",
    });
  }

  function onClick(e) {
    if (!open || !marking || popupOpen || inOurUI(e)) return;
    e.preventDefault();
    e.stopPropagation();
    popupEl = e.target;
    openPopup(e.target);
  }

  function openPopup(el) {
    popupOpen = true;
    highlight.style.display = "none";
    $("popupTarget").textContent = describe(el);
    $("msg").value = "";
    const r = el.getBoundingClientRect();
    const top = Math.min(r.bottom + 8, window.innerHeight - 140);
    const left = Math.min(r.left, window.innerWidth - 280);
    Object.assign(popup.style, { display: "block", top: Math.max(8, top) + "px", left: Math.max(8, left) + "px" });
    $("msg").focus();
  }

  function closePopup() {
    popupOpen = false;
    popup.style.display = "none";
    popupEl = null;
  }

  $("ok").onclick = () => {
    const message = $("msg").value.trim();
    if (!message || !popupEl) return closePopup();
    marks.push({
      id: String(marks.length ? Math.max(...marks.map((m) => +m.id)) + 1 : 1),
      url: location.href,
      title: document.title,
      selector: cssPath(popupEl),
      element: describe(popupEl),
      text: (popupEl.textContent || "").trim().slice(0, 80),
      message,
    });
    save();
    closePopup();
  };
  $("cancel").onclick = closePopup;

  // --- sidebar ------------------------------------------------------------
  function renderPanel() {
    panel.style.display = open ? "block" : "none";
    $("count").textContent = open ? `(${marks.length})` : "";
    $("toggleMark").textContent = marking ? "Stop marking" : "Mark up";
    if (!open) return;
    const list = $("list");
    list.innerHTML = "";
    marks.forEach((m) => {
      const li = document.createElement("li");
      const meta = `<span class="muted">${escapeHtml(m.element)} — ${escapeHtml(shortUrl(m.url))}</span>`;
      if (editingId === m.id) {
        const ta = document.createElement("textarea");
        ta.rows = 2; ta.value = m.message;
        const saveBtn = document.createElement("button");
        saveBtn.textContent = "Save";
        saveBtn.onclick = () => {
          const v = ta.value.trim();
          if (v) m.message = v;
          editingId = null; save();
        };
        const cancel = document.createElement("button");
        cancel.textContent = "Cancel";
        cancel.onclick = () => { editingId = null; renderPanel(); };
        li.innerHTML = meta + "<br>";
        li.append(ta, saveBtn, cancel);
      } else {
        const label = document.createElement("div");
        label.innerHTML = `<b>${escapeHtml(m.message)}</b><br>${meta}`;
        const edit = document.createElement("button");
        edit.textContent = "Edit";
        edit.onclick = () => { editingId = m.id; renderPanel(); };
        const del = document.createElement("button");
        del.textContent = "Delete";
        del.onclick = () => { marks = marks.filter((x) => x.id !== m.id); save(); };
        li.append(label, edit, del);
      }
      list.appendChild(li);
    });
  }

  const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const shortUrl = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };

  $("toggleMark").onclick = () => { chrome.storage.local.set({ marking: !marking }); };

  $("send").onclick = () => {
    if (!marks.length) return;
    $("prompt").value = buildPrompt(marks);
    dialog.style.display = "block";
  };
  $("clear").onclick = () => { if (confirm("Clear all marks?")) { marks = []; save(); } };
  $("dialogClose").onclick = () => { dialog.style.display = "none"; };
  $("copy").onclick = async () => {
    await navigator.clipboard.writeText($("prompt").value);
    $("copy").textContent = "Copied!";
    setTimeout(() => ($("copy").textContent = "Copy prompt"), 1200);
  };

  function buildPrompt(marks) {
    const byUrl = {};
    marks.forEach((m) => (byUrl[m.url] ||= []).push(m));
    let out = `I marked ${marks.length} element(s) on my local site that need changes. For each, use the CSS selector and page URL to find the matching code and make the change.\n`;
    for (const [url, items] of Object.entries(byUrl)) {
      out += `\n## ${items[0].title || url}\n${url}\n`;
      items.forEach((m, i) => {
        out += `\n${i + 1}. Selector: \`${m.selector}\`\n   Element: ${m.element}${m.text ? ` — "${m.text}"` : ""}\n   Change: ${m.message}\n`;
      });
    }
    return out;
  }

  // --- wiring -------------------------------------------------------------
  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("scroll", () => (highlight.style.display = "none"), true);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (popupOpen) closePopup(); else if (dialog.style.display === "block") dialog.style.display = "none"; }
  });

  chrome.storage.local.get(["open", "marking", "marks"], (r) => {
    open = !!r.open;
    marking = !!r.marking;
    marks = r.marks || [];
    renderPanel();
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.open) { open = !!changes.open.newValue; if (!open) closePopup(); renderPanel(); }
    if (changes.marking) { marking = !!changes.marking.newValue; if (!marking) closePopup(); renderPanel(); }
    if (changes.marks) { marks = changes.marks.newValue || []; editingId = null; renderPanel(); }
  });
})();

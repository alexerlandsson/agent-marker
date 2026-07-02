// Agent Marker content script.
// State lives in chrome.storage.local so marks persist across pages/tabs and
// panel state survives navigation. Design: dark teal theme (see DESIGN.md).

(() => {
  if (window.__agentMarkerLoaded) return;
  window.__agentMarkerLoaded = true;

  // Inlined lucide icons (MIT). 24x24 viewBox, stroke = currentColor.
  const ICONS = {
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    "minimize-2": '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" x2="21" y1="10" y2="3"/><line x1="3" x2="10" y1="21" y2="14"/>',
    "maximize-2": '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>',
    "grip-vertical": '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  };
  const icon = (n, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

  let open = false;       // panel/bar visible (toolbar icon)
  let marking = false;    // marker mode (Mark / key M)
  let minimized = false;  // collapsed to floating mini-bar
  let barPos = null;      // {x,y} mini-bar position
  let popupOpen = false;
  let editingId = null;
  let marks = [];

  // Load Geist / Geist Mono. Fonts are document-scoped so they reach the shadow
  // root. Falls back to system fonts if the page CSP blocks Google Fonts.
  const fontLink = document.createElement("link");
  fontLink.rel = "stylesheet";
  fontLink.href = "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap";
  (document.head || document.documentElement).appendChild(fontLink);

  // --- shadow-root UI host -------------------------------------------------
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host {
        --bg:#0c0d0f; --panel:#161719; --card:#1e2023; --composer:#1a1b1e; --neutral:#26282b;
        --border:#303236; --border-card:#2c2f33; --border-subtle:#34363a; --divider:#26282b;
        --text:#e7e9ec; --muted:#8b929b; --dim:#6c7178; --faint:#5b6068;
        --accent:#5fe3c8; --accent-ink:#062b24; --tag-bg:#0f2a25; --tag-border:#1c4c43;
        --mono:'Geist Mono',ui-monospace,monospace;
        font-family:'Geist',system-ui,-apple-system,'Segoe UI',sans-serif;
      }
      * { box-sizing:border-box; }
      button { font-family:inherit; cursor:pointer; }
      .pe { pointer-events:auto; }

      /* highlight overlay */
      .highlight { position:fixed; pointer-events:none; border:2px solid var(--accent); border-radius:4px;
        box-shadow:0 0 0 4px rgba(95,227,200,.18); display:none; }
      .tagLabel { position:fixed; pointer-events:none; font-family:var(--mono); font-size:11px;
        background:#1a1b1e; color:var(--accent); padding:3px 8px; border-radius:5px; display:none; white-space:nowrap; }

      /* docked panel */
      .panel { position:fixed; top:0.25rem; right:0.25rem; bottom:0.25rem; width:360px; background:var(--panel);
        border:1px solid var(--border); border-radius:14px; display:none; flex-direction:column; overflow:hidden;
        box-shadow:0 24px 60px -20px rgba(0,0,0,.6); color:var(--text); }
      .header { display:flex; align-items:center; gap:11px; padding:16px; }
      .logo { width:26px; height:26px; border-radius:7px; background:#191a1c; border:1px solid #2f3a44;
        display:flex; flex-direction:column; align-items:center; justify-content:center; flex:none; }
      .logo b { font-weight:700; font-size:12px; color:#f2f3f5; line-height:1; }
      .logo i { width:13px; height:2.5px; background:var(--accent); border-radius:2px; margin-top:1.5px; }
      .title { font-size:13px; font-weight:600; line-height:1; }
      .count { font-size:11px; color:var(--muted); margin-top:3px; }
      .htools { margin-left:auto; display:flex; align-items:center; gap:8px; }
      .iconbtn { width:32px; height:32px; border:1px solid var(--border-card); border-radius:8px; background:transparent;
        display:flex; align-items:center; justify-content:center; padding:0; color:var(--muted); }
      .iconbtn:hover { color:var(--text); }
      .markbtn { display:flex; align-items:center; gap:8px; height:32px; padding:0 10px 0 13px; border:1px solid var(--accent);
        border-radius:8px; background:transparent; color:var(--accent); font-size:12.5px; font-weight:600; }
      .markbtn.active { background:var(--accent); color:var(--accent-ink); }

      .list { flex:1; overflow-y:auto; padding:4px 14px 12px; display:flex; flex-direction:column; gap:10px; }
      .list::-webkit-scrollbar { width:10px; }
      .list::-webkit-scrollbar-thumb { background:#3a3d42; border-radius:8px; border:3px solid transparent; background-clip:content-box; }
      .mark { background:var(--card); border:1px solid var(--border-card); border-radius:11px; padding:13px 13px 11px; }
      .markhead { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
      .tag { font-family:var(--mono); font-size:10.5px; color:var(--accent); background:var(--tag-bg);
        border:1px solid var(--tag-border); border-radius:5px; padding:2px 7px; font-weight:600; }
      .ref { font-family:var(--mono); font-size:11px; color:var(--muted); }
      .actions { margin-left:auto; font-size:11px; color:var(--muted); display:flex; gap:6px; }
      .actions span { cursor:pointer; }
      .actions span:hover { color:var(--text); }
      .msg { font-size:13px; line-height:1.45; color:var(--text); white-space:pre-wrap; word-break:break-word; }
      .editrow { display:flex; gap:7px; margin-top:9px; }
      .empty { color:var(--muted); font-size:12.5px; text-align:center; padding:24px 8px; }

      textarea { width:100%; background:#111214; color:var(--text); border:1px solid var(--border-subtle);
        border-radius:8px; padding:8px; font:13px/1.4 inherit; resize:vertical; }

      .footer { padding:14px 16px; border-top:1px solid var(--divider); display:flex; align-items:center; gap:10px; }
      .primary { flex:1; display:flex; align-items:center; justify-content:center; gap:8px; height:38px; border:none;
        border-radius:9px; background:var(--accent); color:var(--accent-ink); font-size:13px; font-weight:700; }
      .primary[disabled] { opacity:.45; cursor:default; }
      .ghost { height:38px; padding:0 16px; border:1px solid var(--border-subtle); border-radius:9px; background:transparent;
        color:var(--muted); font-size:13px; }
      .mini { display:flex; align-items:center; gap:8px; height:28px; padding:0 8px 0 12px; border:none; border-radius:7px;
        background:var(--neutral); color:var(--muted); font-size:12px; }
      .mini.accent { background:var(--accent); color:var(--accent-ink); font-weight:600; }

      /* kbd hints */
      kbd { font-family:var(--mono); font-size:10px; font-weight:600; line-height:1; padding:3px 5px; border-radius:4px;
        background:rgba(95,227,200,.14); border:1px solid rgba(95,227,200,.32); color:inherit; }
      .onaccent kbd { background:rgba(6,43,36,.14); border-color:rgba(6,43,36,.22); }
      .onneutral kbd { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.1); }

      /* mini-bar */
      .bar { position:fixed; height:48px; background:var(--panel); border:1px solid var(--border-card); border-radius:13px;
        display:none; align-items:center; gap:10px; padding:0 8px 0 10px; box-shadow:0 14px 34px -8px rgba(0,0,0,.5); color:var(--text); }
      .grip { display:flex; align-items:center; padding:0 1px; cursor:grab; color:#5a5e64; }
      .barlogo { width:22px; height:22px; }
      .barlogo b { font-size:10px; } .barlogo i { width:11px; height:2px; margin-top:1.5px; }
      .barcount { font-family:var(--mono); font-size:11px; color:var(--muted); }
      .vr { width:1px; height:22px; background:var(--border-card); margin:0 2px; }
      .barmark { display:flex; align-items:center; gap:6px; height:32px; padding:0 10px; border:1px solid var(--accent);
        border-radius:8px; background:transparent; color:var(--accent); font-size:12.5px; font-weight:600; }
      .barmark.active { background:var(--accent); color:var(--accent-ink); }
      .barsend { display:flex; align-items:center; gap:6px; height:32px; padding:0 10px; border:none; border-radius:8px;
        background:transparent; color:#cfd3d8; font-size:12.5px; font-weight:600; }
      .expand { margin-left:auto; width:30px; height:30px; border:1px solid var(--border-card); border-radius:8px; background:transparent;
        color:var(--muted); display:flex; align-items:center; justify-content:center; }
      .expand:hover { color:var(--text); border-color:var(--border-subtle); }

      /* composer */
      .popup { position:fixed; pointer-events:auto; width:280px; background:var(--composer); border:1px solid var(--border-subtle);
        border-radius:10px; padding:12px; display:none; box-shadow:0 12px 30px -8px rgba(0,0,0,.4); color:var(--text); }
      .popup .tagfill { font-family:var(--mono); font-size:10.5px; color:var(--accent-ink); background:var(--accent);
        border-radius:4px; padding:2px 7px; display:inline-block; font-weight:600; margin-bottom:9px; }
      .popup textarea { margin-bottom:11px; }
      .btnrow { display:flex; gap:7px; }
      .btn-save { display:flex; align-items:center; gap:7px; height:28px; padding:0 8px 0 12px; border:none; border-radius:7px;
        background:var(--accent); color:var(--accent-ink); font-size:12px; font-weight:600; }
      .btn-cancel { display:flex; align-items:center; gap:7px; height:28px; padding:0 8px 0 12px; border:none; border-radius:7px;
        background:var(--neutral); color:var(--muted); font-size:12px; }

      /* send dialog */
      .dialog { position:fixed; pointer-events:auto; top:50%; left:50%; transform:translate(-50%,-50%); width:min(700px,90vw);
        max-height:85vh; padding:16px; background:var(--panel); border:1px solid var(--border); border-radius:14px;
        display:none; flex-direction:column; box-shadow:0 24px 60px -20px rgba(0,0,0,.6); color:var(--text); }
      .dialog textarea { flex:1; min-height:160px; margin:12px 0; overflow:auto; resize:none; font-family:var(--mono); }
      .dialoghead { display:flex; justify-content:space-between; align-items:center; }

      /* confirm overlay */
      .confirm { position:fixed; inset:0; pointer-events:auto; background:rgba(0,0,0,.55); display:none;
        align-items:center; justify-content:center; }
      .confirmbox { width:300px; background:var(--panel); border:1px solid var(--border); border-radius:12px;
        padding:16px; box-shadow:0 24px 60px -20px rgba(0,0,0,.6); color:var(--text); }
    </style>

    <div class="highlight pe" style="pointer-events:none;"></div>
    <div class="tagLabel"></div>

    <div class="panel">
      <div class="header">
        <div class="logo"><b>A</b><i></i></div>
        <div>
          <div class="title">Agent Marker</div>
          <div class="count" id="count"></div>
        </div>
        <div class="htools">
          <button class="iconbtn pe" id="minimize" title="Minimize to floating bar" aria-label="Minimize">${icon("minimize-2", 15)}</button>
          <button class="markbtn onaccent pe" id="mark">Mark <kbd>M</kbd></button>
        </div>
      </div>
      <div class="list pe" id="list"></div>
      <div class="footer">
        <button class="primary onaccent pe" id="send">Send to agent <kbd>S</kbd></button>
        <button class="ghost pe" id="clear">Clear</button>
      </div>
    </div>

    <div class="bar">
      <div class="grip pe" id="grip" title="Drag">${icon("grip-vertical", 18)}</div>
      <div class="logo barlogo"><b>A</b><i></i></div>
      <span class="barcount" id="barcount">0</span>
      <span class="vr"></span>
      <button class="barmark onaccent pe" id="barmark">Mark <kbd>M</kbd></button>
      <button class="barsend onneutral pe" id="barsend">Send <kbd>S</kbd></button>
      <button class="expand pe" id="expand" title="Expand to panel" aria-label="Expand">${icon("maximize-2", 15)}</button>
    </div>

    <div class="popup">
      <span class="tagfill" id="popupTag"></span>
      <textarea id="msg" rows="3" placeholder="What should change here?"></textarea>
      <div class="btnrow">
        <button class="btn-save onaccent pe" id="ok">Save <kbd>⌘↵</kbd></button>
        <button class="btn-cancel onneutral pe" id="cancel">Cancel <kbd>Esc</kbd></button>
      </div>
    </div>

    <div class="dialog">
      <div class="dialoghead">
        <b>Prompt for your agent</b>
        <button class="iconbtn pe" id="dialogClose" title="Close" aria-label="Close">${icon("x", 18)}</button>
      </div>
      <textarea id="prompt" readonly></textarea>
      <button class="primary onaccent pe" id="copy" style="flex:none; align-self:flex-start; padding:0 16px;">${icon("copy", 15)} Copy prompt</button>
    </div>

    <div class="confirm">
      <div class="confirmbox">
        <div style="font-size:1rem; font-weight:600; margin-bottom:1rem;">Clear all marks?</div>
        <div style="font-size:0.875rem; color:var(--muted); margin-bottom:1rem;">This removes every mark on every page. This can't be undone.</div>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="ghost pe" id="confirmCancel" style="height:34px; padding:0 14px;">Cancel</button>
          <button class="pe" id="confirmClear" style="height:34px; padding:0 14px; border:none; border-radius:9px; background:var(--accent); color:var(--accent-ink); font-size:13px; font-weight:600;">Clear all</button>
        </div>
      </div>
    </div>
  `;
  (document.documentElement || document.body).appendChild(host);

  const $ = (id) => root.getElementById(id);
  const highlight = root.querySelector(".highlight");
  const tagLabel = root.querySelector(".tagLabel");
  const panel = root.querySelector(".panel");
  const bar = root.querySelector(".bar");
  const popup = root.querySelector(".popup");
  const dialog = root.querySelector(".dialog");
  const confirmEl = root.querySelector(".confirm");

  let popupEl = null;

  // --- helpers ------------------------------------------------------------
  const inOurUI = (e) => e.composedPath().includes(host);
  const isTyping = () => {
    const a = root.activeElement || document.activeElement;
    return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
  };

  function cssPath(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      let sel = el.nodeName.toLowerCase();
      if (el.id) { parts.unshift(`#${CSS.escape(el.id)}`); break; }
      if (el.classList.length) sel += "." + [...el.classList].map((c) => CSS.escape(c)).join(".");
      const parent = el.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.nodeName === el.nodeName);
        if (same.length > 1) sel += `:nth-of-type(${same.indexOf(el) + 1})`;
      }
      parts.unshift(sel);
      el = el.parentElement;
    }
    return parts.join(" > ");
  }

  const tagOf = (el) => el.nodeName.toLowerCase();
  const refOf = (el) => (el.id ? `#${el.id}` : el.classList.length ? `.${el.classList[0]}` : "");
  const descOf = (el) => tagOf(el) + (el.id ? `#${el.id}` : el.classList.length ? "." + [...el.classList].join(".") : "");

  const save = () => chrome.storage.local.set({ marks });
  const setState = (o) => chrome.storage.local.set(o);

  // --- marking flow -------------------------------------------------------
  function onMove(e) {
    if (!open || !marking || popupOpen || inOurUI(e)) { hideHighlight(); return; }
    const el = e.target;
    if (!el || el === document.body) { hideHighlight(); return; }
    const r = el.getBoundingClientRect();
    Object.assign(highlight.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    tagLabel.textContent = `${descOf(el)} · ${Math.round(r.width)}×${Math.round(r.height)}`;
    Object.assign(tagLabel.style, { display: "block", left: r.left + "px", top: Math.max(2, r.top - 24) + "px" });
  }
  const hideHighlight = () => { highlight.style.display = "none"; tagLabel.style.display = "none"; };

  function onClick(e) {
    if (popupOpen) {
      if (e.composedPath().includes(popup)) return; // interacting with the composer
      e.preventDefault();
      e.stopPropagation();
      if (!$("msg").value.trim()) closePopup(); // click-outside closes only when empty
      return;
    }
    if (!open || !marking || inOurUI(e)) return;
    e.preventDefault();
    e.stopPropagation();
    popupEl = e.target;
    openPopup(e.target);
  }

  function openPopup(el) {
    popupOpen = true;
    hideHighlight();
    $("popupTag").textContent = descOf(el);
    $("msg").value = "";
    const r = el.getBoundingClientRect();
    const top = Math.min(r.bottom + 8, window.innerHeight - 150);
    const left = Math.min(r.left, window.innerWidth - 296);
    Object.assign(popup.style, { display: "block", top: Math.max(8, top) + "px", left: Math.max(8, left) + "px" });
    $("msg").focus();
  }
  function closePopup() { popupOpen = false; popup.style.display = "none"; popupEl = null; }

  $("ok").onclick = () => {
    const message = $("msg").value.trim();
    if (!message || !popupEl) return closePopup();
    marks.push({
      id: String(marks.length ? Math.max(...marks.map((m) => +m.id)) + 1 : 1),
      url: location.href, title: document.title,
      selector: cssPath(popupEl), tag: tagOf(popupEl), ref: refOf(popupEl),
      element: descOf(popupEl), text: (popupEl.textContent || "").trim().slice(0, 80),
      message,
    });
    save();
    closePopup();
  };
  $("cancel").onclick = closePopup;
  $("msg").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $("ok").click(); }
    if (e.key === "Escape") { e.preventDefault(); closePopup(); }
  });

  // --- render -------------------------------------------------------------
  function render() {
    const show = open && !minimized;
    panel.style.display = show ? "flex" : "none";
    bar.style.display = open && minimized ? "flex" : "none";
    $("mark").classList.toggle("active", marking);
    $("barmark").classList.toggle("active", marking);
    $("count").textContent = `${marks.length} element${marks.length === 1 ? "" : "s"} marked`;
    $("barcount").textContent = String(marks.length);
    $("send").disabled = marks.length === 0;
    positionBar();
    if (!open) { hideHighlight(); return; }
    renderList();
  }

  function renderList() {
    const list = $("list");
    list.innerHTML = "";
    if (!marks.length) {
      const p = document.createElement("div");
      p.className = "empty";
      p.textContent = "No marks yet. Click Mark, then click an element on the page.";
      list.appendChild(p);
      return;
    }
    marks.forEach((m) => {
      const li = document.createElement("div");
      li.className = "mark";
      const head = document.createElement("div");
      head.className = "markhead";
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = `<${m.tag || "el"}>`;
      head.appendChild(tag);
      if (m.ref) { const ref = document.createElement("span"); ref.className = "ref"; ref.textContent = m.ref; head.appendChild(ref); }
      const actions = document.createElement("span");
      actions.className = "actions";

      if (editingId === m.id) {
        li.appendChild(head);
        const ta = document.createElement("textarea");
        ta.rows = 2; ta.value = m.message;
        const row = document.createElement("div");
        row.className = "editrow";
        const saveBtn = document.createElement("button");
        saveBtn.className = "btn-save onaccent pe"; saveBtn.textContent = "Save";
        saveBtn.onclick = () => { const v = ta.value.trim(); if (v) m.message = v; editingId = null; save(); };
        const cancel = document.createElement("button");
        cancel.className = "btn-cancel onneutral pe"; cancel.textContent = "Cancel";
        cancel.onclick = () => { editingId = null; render(); };
        row.append(saveBtn, cancel);
        li.append(ta, row);
        ta.focus();
      } else {
        const edit = document.createElement("span"); edit.textContent = "Edit";
        edit.onclick = () => { editingId = m.id; render(); };
        const del = document.createElement("span"); del.textContent = "Delete";
        del.onclick = () => { marks = marks.filter((x) => x.id !== m.id); save(); };
        actions.append(edit, document.createTextNode("·"), del);
        head.appendChild(actions);
        li.appendChild(head);
        const msg = document.createElement("div"); msg.className = "msg"; msg.textContent = m.message;
        li.appendChild(msg);
      }
      list.appendChild(li);
    });
  }

  const shortUrl = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };

  function buildPrompt(marks) {
    const byUrl = {};
    marks.forEach((m) => (byUrl[m.url] ||= []).push(m));
    let out = `I marked ${marks.length} element(s) that need changes. For each, use the CSS selector and page URL to find the matching code and make the change.\n`;
    for (const [url, items] of Object.entries(byUrl)) {
      out += `\n## ${items[0].title || url}\n${url}\n`;
      items.forEach((m, i) => {
        out += `\n${i + 1}. Selector: \`${m.selector}\`\n   Element: ${m.element}${m.text ? ` — "${m.text}"` : ""}\n   Change: ${m.message}\n`;
      });
    }
    return out;
  }

  function doSend() {
    if (!marks.length) return;
    $("prompt").value = buildPrompt(marks);
    dialog.style.display = "flex";
  }

  // --- controls -----------------------------------------------------------
  $("mark").onclick = () => setState({ marking: !marking });
  $("barmark").onclick = () => setState({ marking: !marking });
  $("send").onclick = doSend;
  $("barsend").onclick = doSend;
  $("minimize").onclick = () => setState({ minimized: true });
  $("expand").onclick = () => setState({ minimized: false });
  $("clear").onclick = () => { if (marks.length) confirmEl.style.display = "flex"; };
  $("confirmCancel").onclick = () => { confirmEl.style.display = "none"; };
  confirmEl.onclick = (e) => { if (e.target === confirmEl) confirmEl.style.display = "none"; };
  $("confirmClear").onclick = () => { marks = []; save(); confirmEl.style.display = "none"; };
  $("dialogClose").onclick = () => { dialog.style.display = "none"; };
  $("copy").onclick = async () => {
    await navigator.clipboard.writeText($("prompt").value);
    $("copy").textContent = "Copied!";
    setTimeout(() => ($("copy").innerHTML = `${icon("copy", 15)} Copy prompt`), 1200);
  };

  // --- mini-bar drag ------------------------------------------------------
  function positionBar() {
    const off = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.25; // 0.25rem
    if (!barPos) { bar.style.left = off + "px"; bar.style.top = (window.innerHeight - 48 - off) + "px"; return; }
    const w = bar.offsetWidth || 360, h = 48;
    bar.style.left = Math.max(off, Math.min(barPos.x, window.innerWidth - w - off)) + "px";
    bar.style.top = Math.max(off, Math.min(barPos.y, window.innerHeight - h - off)) + "px";
  }
  $("grip").addEventListener("mousedown", (e) => {
    e.preventDefault();
    const rect = bar.getBoundingClientRect();
    const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
    const onDrag = (ev) => { bar.style.left = (ev.clientX - dx) + "px"; bar.style.top = (ev.clientY - dy) + "px"; };
    const onUp = (ev) => {
      window.removeEventListener("mousemove", onDrag, true);
      window.removeEventListener("mouseup", onUp, true);
      setState({ barPos: { x: ev.clientX - dx, y: ev.clientY - dy } });
    };
    window.addEventListener("mousemove", onDrag, true);
    window.addEventListener("mouseup", onUp, true);
  });

  // --- global shortcuts ---------------------------------------------------
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (confirmEl.style.display === "flex") { confirmEl.style.display = "none"; return; }
      if (popupOpen) return closePopup();
      if (dialog.style.display === "flex") { dialog.style.display = "none"; return; }
    }
    if (!open || popupOpen || isTyping() || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "m") { e.preventDefault(); setState({ marking: !marking }); }
    else if (k === "s") { e.preventDefault(); doSend(); }
  }, true);

  // --- wiring -------------------------------------------------------------
  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("scroll", hideHighlight, true);
  window.addEventListener("resize", () => open && render());

  chrome.storage.local.get(["open", "marking", "minimized", "barPos", "marks"], (r) => {
    open = !!r.open; marking = !!r.marking; minimized = !!r.minimized;
    barPos = r.barPos || null; marks = r.marks || [];
    render();
  });
  chrome.storage.onChanged.addListener((c) => {
    if (c.open) { open = !!c.open.newValue; if (!open) closePopup(); }
    if (c.marking) { marking = !!c.marking.newValue; if (!marking) closePopup(); }
    if (c.minimized) minimized = !!c.minimized.newValue;
    if (c.barPos) barPos = c.barPos.newValue || null;
    if (c.marks) { marks = c.marks.newValue || []; editingId = null; }
    render();
  });
})();

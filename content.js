// Agent Marker content script.
// Per-tab state lives in chrome.storage.session under "tab:<id>" — background.js
// owns open/close and answers the one-time "tabId" handshake message. The UI is
// a floating pill that snaps to viewport corners; the marks panel, note
// composer, prompt dialog and confirm overlay all hang off it.
// Design: dark teal theme (see DESIGN.md).

(() => {
  if (window.__agentMarkerLoaded) return;
  window.__agentMarkerLoaded = true;

  // Inlined lucide icons (MIT). 24x24 viewBox, stroke = currentColor.
  const ICONS = {
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    "grip-vertical": '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    "external-link": '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  };
  const icon = (n, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

  // Brand logo (see logo.svg).
  const logoSvg = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 128 128" fill="none" aria-hidden="true">` +
    `<rect width="128" height="128" rx="30" fill="#191A1C"/>` +
    `<text x="64" y="82" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="82" letter-spacing="-2" fill="#F2F3F5">A</text>` +
    `<rect x="33" y="92" width="62" height="10" rx="5" fill="#5FE3C8" transform="rotate(-3 64 97)"/></svg>`;

  const MARGIN = 12;      // gap between pill/panel and the viewport edge
  const SNAP = 96;        // px radius around a corner that snaps the pill to it

  let tabKey = null;      // "tab:<id>", learned from background.js
  let state = null;       // { open, marking, listOpen, pos, marks } — mirrors storage
  let editingId = null;   // mark id being edited in the list
  let popupOpen = false;  // note composer visible
  let popupEl = null;     // element the composer is for
  let hoverEl = null;     // element under the cursor while marking
  let lockChain = [];     // ancestors walked to with ArrowUp
  let cardHover = false;  // a list card is previewing its element
  let lastFocus = null;   // focus to restore when dialog/confirm closes

  // Load Geist / Geist Mono from bundled files. They're web_accessible_resources
  // loaded from a chrome-extension:// URL, which is exempt from the page CSP
  // (a Google Fonts <link> gets blocked by strict font-src, e.g. on GitHub).
  // @font-face is registered on the main document so it reaches the shadow root.
  const fontStyle = document.createElement("style");
  fontStyle.textContent = `
    @font-face { font-family:'Geist'; font-weight:100 900; font-display:swap;
      src:url('${chrome.runtime.getURL("fonts/geist.woff2")}') format('woff2'); }
    @font-face { font-family:'Geist Mono'; font-weight:100 900; font-display:swap;
      src:url('${chrome.runtime.getURL("fonts/geist-mono.woff2")}') format('woff2'); }
  `;
  (document.head || document.documentElement).appendChild(fontStyle);

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
      :where(button,a,textarea):focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
      .pe { pointer-events:auto; }

      /* host is one isolated stacking context; local z 0-9 */
      .highlight { position:fixed; z-index:0; pointer-events:none; border:2px solid var(--accent); border-radius:4px;
        box-shadow:0 0 0 4px rgba(95,227,200,.18); display:none; }
      .tagLabel { position:fixed; z-index:1; pointer-events:none; font-family:var(--mono); font-size:11px;
        background:#1a1b1e; color:var(--accent); padding:3px 8px; border-radius:5px; display:none; white-space:nowrap; }

      /* numbered chips on marked elements */
      .dots { position:fixed; inset:0; z-index:2; pointer-events:none; }
      .dot { position:fixed; width:18px; height:18px; padding:0; border:none; border-radius:50%;
        background:var(--accent); color:var(--accent-ink); font:600 10px/18px var(--mono); text-align:center;
        transform:translate(-45%,-45%); box-shadow:0 2px 8px rgba(0,0,0,.45); }

      /* floating pill — the main view */
      .pill { position:fixed; z-index:5; height:44px; display:none; align-items:center; gap:6px; padding:0 6px 0 8px;
        background:var(--panel); border:1px solid var(--border-card); border-radius:12px; color:var(--text);
        box-shadow:0 14px 34px -8px rgba(0,0,0,.5); cursor:grab; touch-action:none; user-select:none; }
      .pill.dragging { cursor:grabbing; }
      .pill.snap { transition:left .22s cubic-bezier(.2,.8,.2,1), top .22s cubic-bezier(.2,.8,.2,1); }
      .grip { display:flex; color:#5a5e64; }
      .logo { display:flex; flex:none; }
      .logo svg { display:block; }
      .markbtn { display:flex; align-items:center; gap:6px; height:30px; padding:0 8px 0 10px; border:1px solid var(--accent);
        border-radius:8px; background:transparent; color:var(--accent); font-size:12px; font-weight:600; }
      .markbtn.active { background:var(--accent); color:var(--accent-ink); }
      .notesbtn { display:flex; align-items:center; gap:6px; height:30px; padding:0 9px; border:1px solid var(--border-card);
        border-radius:8px; background:transparent; color:var(--muted); font-family:var(--mono); font-size:12px; font-weight:600; }
      .notesbtn:hover { color:var(--text); border-color:var(--border-subtle); }
      .notesbtn.active { background:var(--neutral); color:var(--text); }
      .sendbtn { display:flex; align-items:center; justify-content:center; width:30px; height:30px; border:none;
        border-radius:8px; background:transparent; color:#cfd3d8; }
      .sendbtn:hover { color:var(--accent); }
      .sendbtn[disabled] { opacity:.4; cursor:default; }
      .sendbtn[disabled]:hover { color:#cfd3d8; }

      /* marks panel — popover anchored to the pill */
      .panel { position:fixed; z-index:4; width:min(340px, calc(100dvw - 24px)); max-height:min(520px, 70dvh);
        background:var(--panel); border:1px solid var(--border); border-radius:14px; display:none; flex-direction:column;
        overflow:hidden; box-shadow:0 24px 60px -20px rgba(0,0,0,.6); color:var(--text); animation:fadein .14s ease-out; }
      .header { display:flex; align-items:center; gap:11px; padding:14px 14px 10px; }
      .title { font-size:13px; font-weight:600; line-height:1; }
      .count { font-size:11px; color:var(--muted); margin-top:3px; }
      .credit { padding:0 14px 10px; font-family:var(--mono); font-size:10px; color:var(--faint); text-align:center; }
      .credit a { color:inherit; text-decoration:none; }
      .credit a:hover { color:var(--muted); }
      .credit svg { vertical-align:-1px; }
      .iconbtn { width:30px; height:30px; margin-left:auto; border:1px solid var(--border-card); border-radius:8px;
        background:transparent; display:flex; align-items:center; justify-content:center; padding:0; color:var(--muted); }
      .iconbtn:hover { color:var(--text); }

      .list { flex:1; overflow-y:auto; padding:4px 14px 12px; display:flex; flex-direction:column; gap:10px; }
      .list::-webkit-scrollbar { width:10px; }
      .list::-webkit-scrollbar-thumb { background:#3a3d42; border-radius:8px; border:3px solid transparent; background-clip:content-box; }
      .mark { background:var(--card); border:1px solid var(--border-card); border-radius:11px; padding:11px 13px; }
      .mark.flash { border-color:var(--accent); box-shadow:0 0 0 3px rgba(95,227,200,.25); }
      .markhead { display:flex; align-items:center; gap:8px; margin-bottom:9px; }
      .num { flex:none; width:18px; height:18px; padding:0; border:none; border-radius:50%; background:var(--accent);
        color:var(--accent-ink); font:600 10px/18px var(--mono); text-align:center; }
      span.num { background:var(--neutral); color:var(--muted); }
      .tag { font-family:var(--mono); font-size:10.5px; color:var(--accent); background:var(--tag-bg);
        border:1px solid var(--tag-border); border-radius:5px; padding:2px 7px; font-weight:600; }
      .ref { font-family:var(--mono); font-size:11px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .page { font-family:var(--mono); font-size:10.5px; color:var(--dim); background:var(--neutral); border-radius:5px;
        padding:2px 7px; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .actions { margin-left:auto; font-size:11px; color:var(--muted); display:flex; gap:6px; flex:none; }
      .actions span { cursor:pointer; }
      .actions span:hover { color:var(--text); }
      .msg { font-size:13px; line-height:1.45; color:var(--text); white-space:pre-wrap; word-break:break-word; }
      .stale { font-size:11px; color:var(--dim); margin-top:7px; }
      .editrow { display:flex; gap:7px; margin-top:9px; }
      .empty { color:var(--muted); font-size:12.5px; line-height:1.5; text-align:center; padding:24px 8px; }

      textarea { width:100%; background:#111214; color:var(--text); border:1px solid var(--border-subtle);
        border-radius:8px; padding:8px; font:13px/1.4 inherit; resize:vertical; }

      .footer { padding:12px 14px; border-top:1px solid var(--divider); display:flex; align-items:center; gap:10px; }
      .primary { flex:1; display:flex; align-items:center; justify-content:center; gap:8px; height:38px; border:none;
        border-radius:9px; background:var(--accent); color:var(--accent-ink); font-size:13px; font-weight:700; }
      .primary[disabled] { opacity:.45; cursor:default; }
      .ghost { height:38px; padding:0 16px; border:1px solid var(--border-subtle); border-radius:9px; background:transparent;
        color:var(--muted); font-size:13px; }

      /* kbd hints */
      kbd { font-family:var(--mono); font-size:10px; font-weight:600; line-height:1; padding:3px 5px; border-radius:4px;
        background:rgba(95,227,200,.14); border:1px solid rgba(95,227,200,.32); color:inherit; }
      .onaccent kbd { background:rgba(6,43,36,.14); border-color:rgba(6,43,36,.22); }
      .onneutral kbd { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.1); }

      /* pill button tooltip */
      .tip { position:fixed; z-index:7; pointer-events:none; display:none; align-items:center; gap:6px;
        background:var(--composer); border:1px solid var(--border-subtle); border-radius:6px; padding:4px 8px;
        color:var(--text); font-size:11px; white-space:nowrap; box-shadow:0 12px 30px -8px rgba(0,0,0,.4); }

      /* composer */
      .popup { position:fixed; z-index:6; width:min(280px, calc(100dvw - 16px)); background:var(--composer);
        border:1px solid var(--border-subtle); border-radius:10px; padding:12px; display:none;
        box-shadow:0 12px 30px -8px rgba(0,0,0,.4); color:var(--text); animation:fadein .14s ease-out; }
      .popup .tagfill { font-family:var(--mono); font-size:10.5px; color:var(--accent-ink); background:var(--accent);
        border-radius:4px; padding:2px 7px; display:inline-block; font-weight:600; margin-bottom:9px; }
      .popup textarea { margin-bottom:11px; }
      .btnrow { display:flex; gap:7px; }
      .btn-save { display:flex; align-items:center; gap:7px; height:28px; padding:0 8px 0 12px; border:none; border-radius:7px;
        background:var(--accent); color:var(--accent-ink); font-size:12px; font-weight:600; }
      .btn-cancel { display:flex; align-items:center; gap:7px; height:28px; padding:0 8px 0 12px; border:none; border-radius:7px;
        background:var(--neutral); color:var(--muted); font-size:12px; }

      /* send dialog */
      .dialog { position:fixed; z-index:8; top:50%; left:50%; transform:translate(-50%,-50%); width:min(700px, 90dvw);
        max-height:85dvh; padding:16px; background:var(--panel); border:1px solid var(--border); border-radius:14px;
        display:none; flex-direction:column; box-shadow:0 24px 60px -20px rgba(0,0,0,.6); color:var(--text);
        animation:fadeinC .14s ease-out; }
      .dialog textarea { flex:1; min-height:160px; margin:12px 0; overflow:auto; resize:none; font-family:var(--mono); }
      .dialoghead { display:flex; justify-content:space-between; align-items:center; }

      /* confirm overlay */
      .confirm { position:fixed; z-index:9; inset:0; background:rgba(0,0,0,.55); display:none;
        align-items:center; justify-content:center; }
      .confirmbox { width:300px; background:var(--panel); border:1px solid var(--border); border-radius:12px;
        padding:16px; box-shadow:0 24px 60px -20px rgba(0,0,0,.6); color:var(--text); }

      @keyframes fadein { from { opacity:0; transform:translateY(4px); } }
      @keyframes fadeinC { from { opacity:0; transform:translate(-50%, calc(-50% + 4px)); } }
      @media (prefers-reduced-motion: reduce) {
        .pill.snap { transition:none; }
        .panel, .popup, .dialog { animation:none; }
      }
    </style>

    <div class="highlight"></div>
    <div class="tagLabel"></div>
    <div class="dots" id="dots"></div>

    <div class="pill pe" role="group" aria-label="Agent Marker">
      <span class="grip" aria-hidden="true">${icon("grip-vertical", 16)}</span>
      <span class="logo">${logoSvg(20)}</span>
      <button class="markbtn onaccent" id="mark" title="Mark elements (M)">Mark <kbd aria-hidden="true">M</kbd></button>
      <button class="notesbtn" id="notes" aria-expanded="false">${icon("list", 14)}<span id="pillcount">0</span></button>
      <button class="sendbtn" id="pillsend" aria-label="Generate prompt">${icon("terminal", 15)}</button>
    </div>
    <div class="tip" aria-hidden="true"></div>

    <div class="panel pe" role="dialog" aria-label="Marks">
      <div class="header">
        <div class="logo">${logoSvg(24)}</div>
        <div>
          <div class="title">Agent Marker</div>
          <div class="count" id="count"></div>
        </div>
        <button class="iconbtn" id="panelclose" title="Close (Esc)" aria-label="Close marks">${icon("x", 15)}</button>
      </div>
      <div class="list" id="list"></div>
      <div class="footer">
        <button class="primary onaccent" id="send">${icon("terminal", 15)} Generate prompt <kbd aria-hidden="true">S</kbd></button>
        <button class="ghost" id="clear">Clear</button>
      </div>
      <div class="credit"><span id="version"></span> · <a href="https://github.com/alexerlandsson/agent-marker" target="_blank" rel="noopener noreferrer">GitHub ${icon("external-link", 9)}</a></div>
    </div>

    <div class="popup pe" role="dialog" aria-label="Add note">
      <span class="tagfill" id="popupTag"></span>
      <textarea id="msg" rows="3" placeholder="What should change here?"></textarea>
      <div class="btnrow">
        <button class="btn-save onaccent" id="ok">Save <kbd aria-hidden="true">⌘↵</kbd></button>
        <button class="btn-cancel onneutral" id="cancel">Cancel <kbd aria-hidden="true">Esc</kbd></button>
      </div>
    </div>

    <div class="dialog pe" role="dialog" aria-modal="true" aria-label="Prompt for your agent">
      <div class="dialoghead">
        <b>Prompt for your agent</b>
        <button class="iconbtn" id="dialogClose" style="margin-left:0;" title="Close (Esc)" aria-label="Close">${icon("x", 18)}</button>
      </div>
      <textarea id="prompt" readonly aria-label="Generated prompt"></textarea>
      <button class="primary onaccent" id="copy" style="flex:none; align-self:flex-start; padding:0 16px;">${icon("copy", 15)} Copy prompt</button>
    </div>

    <div class="confirm pe">
      <div class="confirmbox" role="dialog" aria-modal="true" aria-label="Clear all marks?">
        <div style="font-size:1rem; font-weight:600; margin-bottom:1rem;">Clear all marks?</div>
        <div style="font-size:0.875rem; color:var(--muted); margin-bottom:1rem;">This removes every mark in this tab. This can't be undone.</div>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="ghost" id="confirmCancel" style="height:34px; padding:0 14px;">Cancel</button>
          <button id="confirmClear" style="height:34px; padding:0 14px; border:none; border-radius:9px; background:var(--accent); color:var(--accent-ink); font-size:13px; font-weight:600;">Clear all</button>
        </div>
      </div>
    </div>
  `;
  (document.documentElement || document.body).appendChild(host);

  const $ = (id) => root.getElementById(id);
  const highlight = root.querySelector(".highlight");
  const tagLabel = root.querySelector(".tagLabel");
  const dots = $("dots");
  const pill = root.querySelector(".pill");
  const panel = root.querySelector(".panel");
  const popup = root.querySelector(".popup");
  const dialog = root.querySelector(".dialog");
  const confirmEl = root.querySelector(".confirm");

  // --- helpers ------------------------------------------------------------
  const inOurUI = (e) => e.composedPath().includes(host);
  const isTyping = () => {
    const a = root.activeElement || document.activeElement;
    return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  const motionOK = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const marks = () => (state && state.marks) || [];
  const pickTarget = () => lockChain[lockChain.length - 1] || hoverEl;

  // The extension was reloaded/removed under us — take the zombie UI down.
  const die = () => { host.remove(); fontStyle.remove(); };
  function setState(patch) {
    state = { ...state, ...patch };
    render();
    try { chrome.storage.session.set({ [tabKey]: state }); } catch { die(); }
  }

  // Hashed/generated class names (css-modules, styled-components, emotion…)
  // don't exist in source code, so they make selectors the agent can't find.
  const stableClass = (c) => /^[a-zA-Z][a-zA-Z0-9_-]{0,23}$/.test(c) && !/^(css|sc|jss|chakra|emotion)-|\d{3,}/.test(c);

  function cssPath(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    for (const attr of ["data-testid", "data-test-id", "data-test", "data-cy"]) {
      const v = el.getAttribute(attr);
      if (v) return `${el.nodeName.toLowerCase()}[${attr}="${v.replace(/["\\]/g, "\\$&")}"]`;
    }
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      let sel = el.nodeName.toLowerCase();
      if (el.id) { parts.unshift(`#${CSS.escape(el.id)}`); break; }
      const cls = [...el.classList].filter(stableClass).slice(0, 2);
      if (cls.length) sel += "." + cls.map((c) => CSS.escape(c)).join(".");
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
  const descOf = (el) => {
    const cls = [...el.classList].slice(0, 3).join(".");
    return tagOf(el) + (el.id ? `#${el.id}` : cls ? `.${cls}${el.classList.length > 3 ? "…" : ""}` : "");
  };
  const shortUrl = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };
  const findMarkEl = (m) => {
    if (m.url !== location.href) return null;
    try { return document.querySelector(m.selector); } catch { return null; }
  };

  // --- marking flow -------------------------------------------------------
  function paintHighlight(el) {
    const r = el.getBoundingClientRect();
    Object.assign(highlight.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    tagLabel.textContent = `${descOf(el)} · ${Math.round(r.width)}×${Math.round(r.height)}`;
    Object.assign(tagLabel.style, { display: "block", left: r.left + "px", top: Math.max(2, r.top - 24) + "px" });
  }
  const hideHighlight = () => { highlight.style.display = "none"; tagLabel.style.display = "none"; };

  function onMove(e) {
    if (!state?.open || !state.marking || popupOpen || inOurUI(e)) { if (!cardHover) hideHighlight(); return; }
    const el = e.target;
    if (!el || el === document.body || el === document.documentElement) { hideHighlight(); return; }
    if (el !== hoverEl) { hoverEl = el; lockChain = []; }
    paintHighlight(pickTarget());
  }

  function onClick(e) {
    if (!state?.open) return;
    if (popupOpen) {
      if (e.composedPath().includes(popup)) return; // interacting with the composer
      e.preventDefault();
      e.stopPropagation();
      if (!$("msg").value.trim()) closePopup(); // click-outside closes only when empty
      return;
    }
    if (state.listOpen && !state.marking && !inOurUI(e)) setState({ listOpen: false }); // popover behavior
    if (!state.marking || inOurUI(e)) return;
    e.preventDefault();
    e.stopPropagation();
    openPopup(lockChain.length ? pickTarget() : e.target);
  }

  function openPopup(el) {
    if (!el) return;
    popupOpen = true;
    popupEl = el;
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
    const ms = marks().slice();
    ms.push({
      id: String(ms.length ? Math.max(...ms.map((m) => +m.id)) + 1 : 1),
      url: location.href, title: document.title,
      selector: cssPath(popupEl), tag: tagOf(popupEl), ref: refOf(popupEl),
      element: descOf(popupEl), text: (popupEl.textContent || "").trim().slice(0, 80),
      message,
    });
    closePopup();
    setState({ marks: ms });
  };
  $("cancel").onclick = closePopup;
  $("msg").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $("ok").click(); }
    if (e.key === "Escape") { e.preventDefault(); closePopup(); }
  });

  // --- render -------------------------------------------------------------
  function render() {
    const openNow = !!state?.open;
    pill.style.display = openNow ? "flex" : "none";
    if (!openNow) {
      panel.style.display = "none";
      dialog.style.display = "none";
      confirmEl.style.display = "none";
      closePopup();
      hideHighlight();
      dots.textContent = "";
      return;
    }
    positionPill();
    const n = marks().length;
    $("pillcount").textContent = String(n);
    $("notes").setAttribute("aria-label", `Show marks (${n})`);
    $("notes").setAttribute("aria-expanded", String(!!state.listOpen));
    $("notes").classList.toggle("active", !!state.listOpen);
    $("mark").classList.toggle("active", !!state.marking);
    $("pillsend").disabled = n === 0;
    $("send").disabled = n === 0;
    panel.style.display = state.listOpen ? "flex" : "none";
    if (state.listOpen) {
      const pages = new Set(marks().map((m) => m.url)).size;
      $("count").textContent = `${n} mark${n === 1 ? "" : "s"}${pages > 1 ? ` · ${pages} pages` : ""}`;
      renderList();
      positionPanel();
    }
    if (!state.marking) { hoverEl = null; lockChain = []; if (!cardHover) hideHighlight(); }
    updateDots();
  }

  function renderList() {
    const list = $("list");
    list.innerHTML = "";
    if (!marks().length) {
      const p = document.createElement("div");
      p.className = "empty";
      p.textContent = "No marks yet. Press M, then click any element — ↑/↓ walks to parents, Enter confirms.";
      list.appendChild(p);
      return;
    }
    marks().forEach((m, i) => {
      const li = document.createElement("div");
      li.className = "mark";
      li.dataset.id = m.id;
      const here = m.url === location.href;
      const el = findMarkEl(m);

      const head = document.createElement("div");
      head.className = "markhead";
      const num = document.createElement(el ? "button" : "span");
      num.className = "num";
      num.textContent = String(i + 1);
      if (el) {
        num.title = "Scroll to element";
        num.setAttribute("aria-label", `Scroll to element ${i + 1}`);
        num.onclick = () => el.scrollIntoView({ block: "center", behavior: motionOK() ? "smooth" : "auto" });
        li.onmouseenter = () => { cardHover = true; paintHighlight(el); };
        li.onmouseleave = () => { cardHover = false; hideHighlight(); };
      }
      head.appendChild(num);
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = `<${m.tag || "el"}>`;
      head.appendChild(tag);
      if (m.ref) { const ref = document.createElement("span"); ref.className = "ref"; ref.textContent = m.ref; head.appendChild(ref); }
      if (!here) { const pg = document.createElement("span"); pg.className = "page"; pg.textContent = shortUrl(m.url); pg.title = m.url; head.appendChild(pg); }

      if (editingId === m.id) {
        li.appendChild(head);
        const ta = document.createElement("textarea");
        ta.rows = 2; ta.value = m.message;
        const row = document.createElement("div");
        row.className = "editrow";
        const saveBtn = document.createElement("button");
        saveBtn.className = "btn-save onaccent"; saveBtn.textContent = "Save";
        saveBtn.onclick = () => { const v = ta.value.trim(); if (v) m.message = v; editingId = null; setState({ marks: marks() }); };
        const cancel = document.createElement("button");
        cancel.className = "btn-cancel onneutral"; cancel.textContent = "Cancel";
        cancel.onclick = () => { editingId = null; render(); };
        ta.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveBtn.click(); }
        });
        row.append(saveBtn, cancel);
        li.append(ta, row);
        ta.focus();
      } else {
        const actions = document.createElement("span");
        actions.className = "actions";
        const edit = document.createElement("span"); edit.textContent = "Edit";
        edit.onclick = () => { editingId = m.id; render(); };
        const del = document.createElement("span"); del.textContent = "Delete";
        del.onclick = () => { cardHover = false; hideHighlight(); setState({ marks: marks().filter((x) => x.id !== m.id) }); };
        actions.append(edit, document.createTextNode("·"), del);
        head.appendChild(actions);
        li.appendChild(head);
        const msg = document.createElement("div"); msg.className = "msg"; msg.textContent = m.message;
        li.appendChild(msg);
        if (here && !el) { const s = document.createElement("div"); s.className = "stale"; s.textContent = "Element no longer found on this page"; li.appendChild(s); }
      }
      list.appendChild(li);
    });
  }

  // Numbered chips pinned to each marked element on the current page.
  function updateDots() {
    dots.textContent = "";
    if (!state?.open) return;
    marks().forEach((m, i) => {
      const el = findMarkEl(m);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return;
      const d = document.createElement("button");
      d.className = "dot pe";
      d.textContent = String(i + 1);
      d.title = m.message;
      d.setAttribute("aria-label", `Show mark ${i + 1}: ${m.message}`);
      d.style.left = r.left + "px";
      d.style.top = r.top + "px";
      d.onclick = (e) => { e.stopPropagation(); openCard(m.id); };
      dots.appendChild(d);
    });
  }

  function openCard(id) {
    setState({ listOpen: true });
    const card = $("list").querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!card) return;
    card.scrollIntoView({ block: "nearest", behavior: motionOK() ? "smooth" : "auto" });
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 900);
  }

  // --- prompt / send -------------------------------------------------------
  function buildPrompt(ms) {
    const byUrl = {};
    ms.forEach((m) => (byUrl[m.url] ||= []).push(m));
    let out = `I marked ${ms.length} element(s) on a running web app that need changes. For each item, use the CSS selector, element description and text snippet to find the matching code (the page URL tells you the route), then make the change. Generated class names may not exist in source — fall back to the element's text and structure. Only change what each item asks for.\n`;
    for (const [url, items] of Object.entries(byUrl)) {
      out += `\n## ${items[0].title || url}\n${url}\n`;
      items.forEach((m) => {
        out += `\n${ms.indexOf(m) + 1}. Selector: \`${m.selector}\`\n   Element: ${m.element}${m.text ? ` — "${m.text}"` : ""}\n   Change: ${m.message}\n`;
      });
    }
    return out;
  }

  function doSend() {
    if (!marks().length) return;
    $("prompt").value = buildPrompt(marks());
    lastFocus = root.activeElement || document.activeElement;
    dialog.style.display = "flex";
    $("copy").focus();
  }
  function closeDialog() {
    dialog.style.display = "none";
    if (lastFocus?.isConnected) lastFocus.focus();
    lastFocus = null;
  }

  // --- controls -----------------------------------------------------------
  const tip = root.querySelector(".tip");
  function bindTip(btn, label, kbdKey) {
    const show = () => {
      tip.innerHTML = `${label} <kbd>${kbdKey}</kbd>`;
      tip.style.display = "flex";
      const b = btn.getBoundingClientRect(), t = tip.getBoundingClientRect();
      tip.style.left = clamp(b.left + b.width / 2 - t.width / 2, 4, window.innerWidth - t.width - 4) + "px";
      tip.style.top = (b.top > t.height + 12 ? b.top - t.height - 8 : b.bottom + 8) + "px";
    };
    const hide = () => { tip.style.display = "none"; };
    btn.addEventListener("pointerenter", show);
    btn.addEventListener("focus", show);
    for (const ev of ["pointerleave", "blur", "click"]) btn.addEventListener(ev, hide);
  }
  bindTip($("notes"), "Marks", "L");
  bindTip($("pillsend"), "Generate prompt", "S");

  $("mark").onclick = () => setState({ marking: !state.marking });
  $("notes").onclick = () => setState({ listOpen: !state.listOpen });
  $("panelclose").onclick = () => setState({ listOpen: false });
  $("send").onclick = doSend;
  $("pillsend").onclick = doSend;
  $("clear").onclick = () => {
    if (!marks().length) return;
    lastFocus = root.activeElement || document.activeElement;
    confirmEl.style.display = "flex";
    $("confirmCancel").focus();
  };
  const closeConfirm = () => {
    confirmEl.style.display = "none";
    if (lastFocus?.isConnected) lastFocus.focus();
    lastFocus = null;
  };
  $("confirmCancel").onclick = closeConfirm;
  confirmEl.onclick = (e) => { if (e.target === confirmEl) closeConfirm(); };
  $("confirmClear").onclick = () => { closeConfirm(); setState({ marks: [] }); };
  $("dialogClose").onclick = closeDialog;
  $("copy").onclick = async () => {
    const ta = $("prompt");
    try { await navigator.clipboard.writeText(ta.value); }
    catch { ta.focus(); ta.select(); document.execCommand("copy"); $("copy").focus(); }
    $("copy").innerHTML = `${icon("check", 15)} Copied`;
    setTimeout(() => { $("copy").innerHTML = `${icon("copy", 15)} Copy prompt`; }, 1200);
  };

  // --- pill position, drag & corner snap -----------------------------------
  function positionPill() {
    const w = pill.offsetWidth, h = pill.offsetHeight;
    const p = state.pos || { corner: "br" };
    const x = p.corner
      ? (p.corner.includes("l") ? MARGIN : window.innerWidth - w - MARGIN)
      : clamp(p.x, MARGIN, window.innerWidth - w - MARGIN);
    const y = p.corner
      ? (p.corner.includes("t") ? MARGIN : window.innerHeight - h - MARGIN)
      : clamp(p.y, MARGIN, window.innerHeight - h - MARGIN);
    pill.style.left = x + "px";
    pill.style.top = y + "px";
  }

  function positionPanel() {
    const pr = pill.getBoundingClientRect();
    const below = pr.top < window.innerHeight / 2;
    const space = below ? window.innerHeight - pr.bottom - 8 - MARGIN : pr.top - 8 - MARGIN;
    panel.style.maxHeight = Math.min(520, Math.max(160, space)) + "px";
    panel.style.top = below ? pr.bottom + 8 + "px" : "";
    panel.style.bottom = below ? "" : window.innerHeight - pr.top + 8 + "px";
    const rightHalf = pr.left + pr.width / 2 > window.innerWidth / 2;
    panel.style.left = rightHalf ? "" : Math.max(MARGIN, pr.left) + "px";
    panel.style.right = rightHalf ? Math.max(MARGIN, window.innerWidth - pr.right) + "px" : "";
  }

  pill.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button, a")) return;
    e.preventDefault();
    const rect = pill.getBoundingClientRect();
    const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
    let moved = false;
    pill.setPointerCapture(e.pointerId);
    pill.classList.add("dragging");
    const onDrag = (ev) => {
      moved = true;
      pill.style.left = ev.clientX - dx + "px";
      pill.style.top = ev.clientY - dy + "px";
      if (state?.listOpen) positionPanel();
    };
    const onUp = (ev) => {
      pill.removeEventListener("pointermove", onDrag);
      pill.removeEventListener("pointerup", onUp);
      pill.removeEventListener("pointercancel", onUp);
      pill.classList.remove("dragging");
      if (!moved) return;
      const w = pill.offsetWidth, h = pill.offsetHeight;
      const x = clamp(ev.clientX - dx, MARGIN, window.innerWidth - w - MARGIN);
      const y = clamp(ev.clientY - dy, MARGIN, window.innerHeight - h - MARGIN);
      const corners = {
        tl: [MARGIN, MARGIN], tr: [window.innerWidth - w - MARGIN, MARGIN],
        bl: [MARGIN, window.innerHeight - h - MARGIN], br: [window.innerWidth - w - MARGIN, window.innerHeight - h - MARGIN],
      };
      let pos = { x, y };
      for (const [c, [cx, cy]] of Object.entries(corners)) {
        if (Math.hypot(x - cx, y - cy) < SNAP) { pos = { corner: c }; break; }
      }
      pill.classList.add("snap");
      setTimeout(() => pill.classList.remove("snap"), 300);
      setState({ pos });
    };
    pill.addEventListener("pointermove", onDrag);
    pill.addEventListener("pointerup", onUp);
    pill.addEventListener("pointercancel", onUp);
  });

  // --- global shortcuts ---------------------------------------------------
  window.addEventListener("keydown", (e) => {
    if (!state?.open) return;
    if (e.key === "Escape") {
      if (confirmEl.style.display === "flex") return closeConfirm();
      if (popupOpen) return closePopup();
      if (dialog.style.display === "flex") return closeDialog();
      if (editingId != null) { editingId = null; return render(); }
      if (state.marking) return setState({ marking: false });
      if (state.listOpen) return setState({ listOpen: false });
      return;
    }
    if (popupOpen || isTyping() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (state.marking && highlight.style.display === "block" && !cardHover) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const p = pickTarget()?.parentElement;
        if (p && p !== document.body && p !== document.documentElement) { lockChain.push(p); paintHighlight(p); }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        lockChain.pop();
        const t = pickTarget();
        if (t) paintHighlight(t);
        return;
      }
      if (e.key === "Enter") { e.preventDefault(); return openPopup(pickTarget()); }
    }
    const k = e.key.toLowerCase();
    if (k === "m") { e.preventDefault(); setState({ marking: !state.marking }); }
    else if (k === "s") { e.preventDefault(); doSend(); }
    else if (k === "l") { e.preventDefault(); setState({ listOpen: !state.listOpen }); }
  }, true);

  // --- wiring -------------------------------------------------------------
  try { $("version").textContent = "v" + chrome.runtime.getManifest().version; } catch { $("version").textContent = "dev"; }
  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("click", onClick, true);
  let raf = 0;
  window.addEventListener("scroll", () => {
    if (!cardHover) hideHighlight();
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateDots(); });
  }, true);
  window.addEventListener("resize", () => state?.open && render());

  try {
    chrome.runtime.sendMessage("tabId", (id) => {
      if (chrome.runtime.lastError || id == null) return;
      tabKey = "tab:" + id;
      chrome.storage.session.get(tabKey).then((r) => { state = r[tabKey] || null; render(); });
      chrome.storage.session.onChanged.addListener((c) => {
        if (!c[tabKey]) return;
        state = c[tabKey].newValue || null;
        if (editingId != null && !marks().some((m) => m.id === editingId)) editingId = null;
        render();
      });
    });
  } catch { die(); }
})();

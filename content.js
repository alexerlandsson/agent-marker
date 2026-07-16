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
    "chevron-up": '<path d="m18 15-6-6-6 6"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    "external-link": '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
    "sticky-note": '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l7-7V5a2 2 0 0 0-2-2Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>',
    "corner-down-left": '<path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    "triangle-alert": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    accessibility: '<circle cx="16" cy="4" r="1"/><path d="m18 19 1-7-6 1"/><path d="m5 8 3-3 5.5 3-2.36 3.5"/><path d="M4.24 14.5a5 5 0 0 0 6.88 6"/><path d="M13.76 17.5a5 5 0 0 0-6.88-6"/>',
  };
  const icon = (n, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

  // Brand logo (see logo.svg). Panel: chip on card tokens (stroke-width 6 ≈ 1px
  // at 20-24px) so it sits like a mark card. Pill: bare glyph, no backdrop.
  const logoSvg = (s, bare) => `<svg width="${s}" height="${s}" viewBox="0 0 128 128" fill="none" aria-hidden="true">` +
    (bare ? "" : `<rect x="3" y="3" width="122" height="122" rx="27" fill="var(--card)" stroke="var(--border-card)" stroke-width="6"/>`) +
    `<text x="64" y="82" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="82" letter-spacing="-2" fill="#F2F3F5">A</text>` +
    `<rect x="33" y="92" width="62" height="10" rx="5" fill="#5FE3C8" transform="rotate(-3 64 97)"/></svg>`;

  const MARGIN = 12;      // gap between pill/panel and the viewport edge
  const SNAP = 96;        // px radius around a corner that snaps the pill to it

  let tabKey = null;      // "tab:<id>", learned from background.js
  let state = null;       // { open, marking, listOpen, pos, marks } — mirrors storage
  let editingId = null;   // mark id being edited in the list
  let editDraft = null;   // in-progress edit text — survives re-renders (resize, storage echo)
  let popupOpen = false;  // note composer visible
  let popupPage = false;  // composer is a page-level note (no target element)
  let popupEl = null;     // element the composer is for
  let popupChain = [];    // children walked up from via ⌥↑, for ⌥↓
  let hoverEl = null;     // element under the cursor while marking
  let lockChain = [];     // ancestors walked to with ArrowUp
  let cardHover = false;  // a list card is previewing its element
  let lastFocus = null;   // focus to restore when dialog/confirm closes
  let lastCount = -1;     // previous mark count, for the count-pulse animation
  let metaOpen = new Set(); // mark ids with the details section expanded
  let auditOpen = false;  // a11y report popover visible (local, not persisted)
  let auditIssues = null; // last audit results; null before the first run
  let auditUrl = "";      // URL the last audit ran on
  let auditLevel = "AA";  // "AA" | "AAA" — persisted in chrome.storage.local
  let auditTimer = 0;

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
        --panel:#161719; --card:#1e2023; --composer:#1a1b1e; --neutral:#26282b;
        --border:#303236; --border-card:#2c2f33; --border-subtle:#34363a; --divider:#26282b;
        --text:#e7e9ec; --muted:#8b929b;
        --accent:#5fe3c8; --accent-ink:#062b24; --tag-bg:#0f2a25; --tag-border:#1c4c43;
        --warn:#f5c84c; --warn-bg:#2b230f; --warn-border:#52441d;
        --mono:'Geist Mono',ui-monospace,monospace;
        --ease-out:cubic-bezier(.165,.84,.44,1);
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
        background:var(--composer); color:var(--accent); padding:3px 8px; border-radius:5px; display:none; white-space:nowrap; }

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
      .grip { display:flex; color:#5a5e64; }
      .logo { display:flex; flex:none; }
      .logo svg { display:block; }
      /* Mark is a mode toggle: active = accent tint, never a fill — fills are
         reserved for the one action that commits the current step. */
      .markbtn { display:flex; align-items:center; gap:6px; height:30px; padding:0 8px 0 10px; border:1px solid var(--border-card);
        border-radius:8px; background:transparent; color:var(--muted); font-size:12px; font-weight:600; }
      .markbtn:hover { color:var(--text); border-color:var(--border-subtle); }
      .markbtn.active { background:var(--tag-bg); border-color:var(--accent); color:var(--accent); }
      .markbtn kbd { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.1); }
      .markbtn.active kbd { background:rgba(95,227,200,.14); border-color:rgba(95,227,200,.32); }
      .notesbtn { display:flex; align-items:center; gap:6px; height:30px; padding:0 9px; border:1px solid var(--border-card);
        border-radius:8px; background:transparent; color:var(--muted); font-family:var(--mono); font-size:12px; font-weight:600; }
      .notesbtn:hover { color:var(--text); border-color:var(--border-subtle); }
      .notesbtn.active { background:var(--neutral); color:var(--text); }
      .sendbtn { display:flex; align-items:center; justify-content:center; width:30px; height:30px; border:none;
        border-radius:8px; background:transparent; color:#cfd3d8; }
      .sendbtn:hover { color:var(--accent); }
      /* a11y status: yellow triangle + count when issues, teal check when clean */
      .a11ybtn { display:flex; align-items:center; gap:5px; height:30px; padding:0 9px; border:1px solid var(--border-card);
        border-radius:8px; background:transparent; color:var(--muted); font-family:var(--mono); font-size:12px; font-weight:600; }
      .a11ybtn:hover { border-color:var(--border-subtle); }
      .a11ybtn.warn { color:var(--warn); }
      .a11ybtn.ok { color:var(--accent); }
      .a11ybtn.active { background:var(--neutral); }

      /* marks panel — popover anchored to the pill */
      .panel { position:fixed; z-index:4; width:min(340px, calc(100dvw - 24px)); max-height:min(520px, 70dvh);
        background:var(--panel); border:1px solid var(--border); border-radius:14px; display:none; flex-direction:column;
        overflow:hidden; box-shadow:0 24px 60px -20px rgba(0,0,0,.6); color:var(--text); }
      .header { display:flex; align-items:center; gap:11px; padding:14px 14px 10px; }
      .title { font-size:13px; font-weight:600; line-height:1; }
      .count { font-size:11px; color:var(--muted); margin-top:3px; }
      .credit { padding:0 14px 10px; font-family:var(--mono); font-size:10px; color:var(--muted); text-align:center; }
      .credit a { color:inherit; text-decoration:none; }
      .credit a:hover { color:var(--text); }
      .credit svg { vertical-align:-1px; }
      .iconbtn { width:30px; height:30px; margin-left:auto; border:1px solid var(--border-card); border-radius:8px;
        background:transparent; display:flex; align-items:center; justify-content:center; padding:0; color:var(--muted); }
      .iconbtn:hover { color:var(--text); }

      .list { flex:1; overflow-y:auto; overscroll-behavior:contain; padding:4px 14px 12px; display:flex; flex-direction:column; gap:10px; }
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
      .page { font-family:var(--mono); font-size:10.5px; color:var(--muted); background:var(--neutral); border-radius:5px;
        padding:2px 7px; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .actions { margin-left:auto; font-size:11px; color:var(--muted); display:flex; align-items:center; gap:6px; flex:none; }
      .actions button { display:flex; align-items:center; background:none; border:none; padding:0; color:inherit; font:inherit; cursor:pointer; }
      .actions button:hover:not([disabled]) { color:var(--text); }
      .actions button[disabled] { opacity:.6; cursor:default; }
      .msg { font-size:13px; line-height:1.45; color:var(--text); white-space:pre-wrap; word-break:break-word; }
      .stale { font-size:11px; color:var(--muted); margin-top:7px; }
      .pagehead { font-family:var(--mono); font-size:10.5px; color:var(--muted); padding:4px 1px 0;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:none; }
      .a11ychip { flex:none; font-family:var(--mono); font-size:10.5px; color:var(--warn); background:var(--warn-bg);
        border:1px solid var(--warn-border); border-radius:5px; padding:2px 7px; font-weight:600; white-space:nowrap; }
      .meta { margin-top:8px; padding-top:7px; border-top:1px solid var(--divider); font-family:var(--mono);
        font-size:10.5px; color:var(--muted); display:flex; flex-direction:column; gap:3px; }
      .meta div { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      /* add/remove toggle on audit issue cards */
      .addbtn { flex:none; width:26px; height:26px; padding:0; margin-left:auto; border:1px solid var(--border-subtle);
        border-radius:7px; background:transparent; color:var(--muted); display:flex; align-items:center; justify-content:center; }
      .addbtn:hover { color:var(--text); border-color:var(--border-subtle); }
      .addbtn.added { background:var(--tag-bg); border-color:var(--tag-border); color:var(--accent); }
      .addbtn.added:hover { color:var(--text); }
      /* AA / AAA level toggle in the audit header */
      .seg { display:flex; margin-left:auto; border:1px solid var(--border-card); border-radius:8px; overflow:hidden; flex:none; }
      .seg button { height:28px; padding:0 10px; border:none; background:transparent; color:var(--muted);
        font-family:var(--mono); font-size:11px; font-weight:600; }
      .seg button:hover { color:var(--text); }
      .seg button.active { background:var(--tag-bg); color:var(--accent); }
      .editrow { display:flex; gap:7px; margin-top:9px; }
      .empty { color:var(--muted); font-size:12.5px; line-height:1.5; text-align:center; padding:24px 8px; }

      textarea { width:100%; background:#111214; color:var(--text); border:1px solid var(--border-subtle);
        border-radius:8px; padding:8px; font:13px/1.4 inherit; resize:vertical; }

      .footer { padding:12px 14px; border-top:1px solid var(--divider); display:flex; align-items:center; gap:10px; }
      .primary { flex:1; display:flex; align-items:center; justify-content:center; gap:8px; height:38px; border:none;
        border-radius:9px; background:var(--accent); color:var(--accent-ink); font-size:13px; font-weight:700; }
      .primary[disabled] { opacity:.45; cursor:default; }
      /* while a note composer / card editor is open, that Save owns the accent fill */
      .primary.waiting { background:var(--neutral); color:var(--muted); }
      .primary.waiting kbd { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.1); }
      .ghost { height:38px; padding:0 16px; border:1px solid var(--border-subtle); border-radius:9px; background:transparent;
        color:var(--muted); font-size:13px; }

      /* kbd hints */
      kbd { display:inline-flex; align-items:center; gap:2px; font-family:var(--mono); font-size:10px; font-weight:600;
        line-height:1; padding:3px 5px; border-radius:4px;
        background:rgba(95,227,200,.14); border:1px solid rgba(95,227,200,.32); color:inherit; }
      kbd svg { display:block; }
      .onaccent kbd { background:rgba(6,43,36,.14); border-color:rgba(6,43,36,.22); }
      .onneutral kbd { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.1); }

      /* pill button tooltip */
      .tip { position:fixed; z-index:7; pointer-events:none; display:none; align-items:center; gap:6px;
        background:var(--composer); border:1px solid var(--border-subtle); border-radius:6px; padding:4px 8px;
        color:var(--text); font-size:11px; white-space:nowrap; box-shadow:0 12px 30px -8px rgba(0,0,0,.4); }

      /* composer */
      .popup { position:fixed; z-index:6; width:min(280px, calc(100dvw - 16px)); background:var(--composer);
        border:1px solid var(--border-subtle); border-radius:10px; padding:12px; display:none;
        box-shadow:0 12px 30px -8px rgba(0,0,0,.4); color:var(--text); }
      .popuphead { display:flex; align-items:center; gap:6px; margin-bottom:9px; }
      .popup .tagfill { font-family:var(--mono); font-size:10.5px; color:var(--accent-ink); background:var(--accent);
        border-radius:4px; padding:2px 7px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .walk { margin-left:auto; display:flex; gap:4px; flex:none; }
      .walkbtn { width:24px; height:24px; padding:0; border:1px solid var(--border-subtle); border-radius:6px;
        background:transparent; color:var(--muted); display:flex; align-items:center; justify-content:center; }
      .walkbtn:hover:not([disabled]) { color:var(--text); }
      .walkbtn[disabled] { opacity:.35; cursor:default; }
      .popup textarea { margin-bottom:11px; }
      .btnrow { display:flex; gap:7px; }
      .btn-save { display:flex; align-items:center; gap:7px; height:28px; padding:0 8px 0 12px; border:none; border-radius:7px;
        background:var(--accent); color:var(--accent-ink); font-size:12px; font-weight:600; }
      .btn-cancel { display:flex; align-items:center; gap:7px; height:28px; padding:0 8px 0 12px; border:none; border-radius:7px;
        background:var(--neutral); color:var(--muted); font-size:12px; }

      /* send dialog */
      .dialog { position:fixed; z-index:8; top:50%; left:50%; transform:translate(-50%,-50%); width:min(700px, 90dvw);
        max-height:85dvh; padding:16px; background:var(--panel); border:1px solid var(--border); border-radius:14px;
        display:none; flex-direction:column; box-shadow:0 24px 60px -20px rgba(0,0,0,.6); color:var(--text); }
      .dialog textarea { flex:1; min-height:160px; margin:12px 0; overflow:auto; overscroll-behavior:contain; resize:none; font-family:var(--mono); }
      .dialoghead { display:flex; justify-content:space-between; align-items:center; }

      /* confirm overlay */
      .confirm { position:fixed; z-index:9; inset:0; background:rgba(0,0,0,.55); display:none;
        align-items:center; justify-content:center; }
      .confirmbox { width:300px; background:var(--panel); border:1px solid var(--border); border-radius:12px;
        padding:16px; box-shadow:0 24px 60px -20px rgba(0,0,0,.6); color:var(--text); }

      /* motion — durations/easing per DESIGN.md; everything lives behind
         no-preference so reduced-motion needs zero overrides */
      @media (prefers-reduced-motion: no-preference) {
        button { transition:color .15s ease, background-color .15s ease, border-color .15s ease, transform .1s var(--ease-out); }
        button:not([disabled]):active { transform:scale(.97); }
        .dot:not([disabled]):active { transform:translate(-45%,-45%) scale(.9); }
        .pill.snap { transition:left .2s var(--ease-out), top .2s var(--ease-out); }
        .panel.snap { transition:left .2s var(--ease-out), right .2s var(--ease-out), top .2s var(--ease-out), bottom .2s var(--ease-out); }
        .panel[data-dir="up"] { transform-origin:bottom center; animation:riseIn .16s var(--ease-out); }
        .panel[data-dir="down"] { transform-origin:top center; animation:dropIn .16s var(--ease-out); }
        .popup { transform-origin:top left; animation:dropIn .16s var(--ease-out); }
        .popup[data-dir="up"] { transform-origin:bottom left; animation:riseIn .16s var(--ease-out); }
        .tip { animation:fadeIn .12s ease-out; }
        .dialog { animation:zoomC .2s var(--ease-out); }
        .confirm { animation:fadeIn .16s ease-out; }
        .confirmbox { animation:riseIn .16s var(--ease-out); }
        .notesbtn.pulse { animation:pulse .25s var(--ease-out); }
        .mark.flash { animation:flashRing .8s var(--ease-out); }
      }
      @keyframes fadeIn { from { opacity:0; } }
      @keyframes riseIn { from { opacity:0; transform:translateY(6px) scale(.98); } }
      @keyframes dropIn { from { opacity:0; transform:translateY(-6px) scale(.98); } }
      @keyframes zoomC { from { opacity:0; transform:translate(-50%,-50%) scale(.96); } }
      @keyframes pulse { 50% { transform:scale(1.15); } }
      @keyframes flashRing { from { box-shadow:0 0 0 6px rgba(95,227,200,.35); } }
    </style>

    <div class="highlight"></div>
    <div class="tagLabel"></div>
    <div class="dots" id="dots"></div>

    <div class="pill pe" role="group" aria-label="Agent Marker">
      <span class="grip" aria-hidden="true">${icon("grip-vertical", 16)}</span>
      <span class="logo">${logoSvg(20, true)}</span>
      <button class="markbtn" id="mark" title="Mark elements (M)">Mark <kbd aria-hidden="true">M</kbd></button>
      <button class="sendbtn" id="pagenote" aria-label="Add page note">${icon("sticky-note", 15)}</button>
      <button class="a11ybtn" id="a11y" aria-expanded="false" aria-label="Accessibility audit">${icon("accessibility", 14)}</button>
      <button class="notesbtn" id="notes" aria-expanded="false">${icon("list", 14)}<span id="pillcount">0</span></button>
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
        <button class="primary onaccent" id="send">${icon("terminal", 15)} Generate prompt <kbd aria-hidden="true">G</kbd></button>
        <button class="ghost" id="clear">Clear</button>
      </div>
      <div class="credit"><span id="version"></span> · <a href="https://github.com/alexerlandsson/agent-marker" target="_blank" rel="noopener noreferrer">GitHub ${icon("external-link", 9)}</a></div>
    </div>

    <div class="panel pe" id="audit" role="dialog" aria-label="Accessibility audit">
      <div class="header">
        <div>
          <div class="title">A11y audit</div>
          <div class="count" id="auditcount"></div>
        </div>
        <div class="seg" role="group" aria-label="Conformance level">
          <button id="lvlAA" aria-pressed="false">AA</button>
          <button id="lvlAAA" aria-pressed="false">AAA</button>
        </div>
        <button class="iconbtn" id="auditclose" style="margin-left:0;" title="Close (Esc)" aria-label="Close audit">${icon("x", 15)}</button>
      </div>
      <div class="list" id="auditlist"></div>
      <div class="footer">
        <button class="primary" id="addall">${icon("plus", 15)} Add all to notes</button>
        <button class="ghost" id="rerun">Re-run</button>
      </div>
    </div>

    <div class="popup pe" role="dialog" aria-label="Add note">
      <div class="popuphead">
        <span class="tagfill" id="popupTag"></span>
        <span class="walk">
          <button class="walkbtn" id="walkup" title="Target parent (⌥↑)" aria-label="Target parent element">${icon("chevron-up", 14)}</button>
          <button class="walkbtn" id="walkdown" title="Back to child (⌥↓)" aria-label="Back to child element">${icon("chevron-down", 14)}</button>
        </span>
      </div>
      <textarea id="msg" rows="3" placeholder="What should change here?"></textarea>
      <div class="btnrow">
        <button class="btn-save onaccent" id="ok">Save <kbd aria-hidden="true">⌘${icon("corner-down-left", 9)}</kbd></button>
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
  const auditPanel = $("audit");
  const popup = root.querySelector(".popup");
  const dialog = root.querySelector(".dialog");
  const confirmEl = root.querySelector(".confirm");

  // --- helpers ------------------------------------------------------------
  const inOurUI = (e) => e.composedPath().includes(host);
  // Pass the keydown event when available: composedPath()[0] sees the real
  // target inside the page's open shadow roots, where document.activeElement
  // only reports the shadow host (e.g. a <custom-input> web component).
  const isTyping = (e) => {
    let a = (e && typeof e.composedPath === "function" && e.composedPath()[0]) || null;
    if (!(a instanceof Element)) {
      a = root.activeElement || document.activeElement;
      while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    }
    return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  const motionOK = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const marks = () => (state && state.marks) || [];
  // List, dots and prompt all number from this order: grouped by page,
  // pages in the order they were first marked.
  const orderedMarks = () => {
    const groups = new Map();
    for (const m of marks()) {
      if (!groups.has(m.url)) groups.set(m.url, []);
      groups.get(m.url).push(m);
    }
    return [...groups.values()].flat();
  };
  const nextId = (ms) => String(ms.length ? Math.max(...ms.map((m) => +m.id)) + 1 : 1);
  const pickTarget = () => lockChain[lockChain.length - 1] || hoverEl;

  // The extension was reloaded/removed under us — take the zombie UI down.
  const die = () => { host.remove(); fontStyle.remove(); };
  function setState(patch) {
    state = { ...state, ...patch };
    render();
    // Async rejection (extension reloaded, quota) as well as sync throw:
    try { chrome.storage.session.set({ [tabKey]: state }).catch(() => { if (!chrome.runtime?.id) die(); }); }
    catch { die(); }
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
  // The element's opening tag verbatim — attributes are what the agent greps for.
  const openTag = (el) => {
    const h = el.outerHTML, i = h.indexOf(">");
    const t = i > 0 ? h.slice(0, i + 1) : "";
    return t.length > 200 ? t.slice(0, 199) + "…" : t;
  };
  // Nearest labelled landmark/section, e.g. `<section> "Pricing"`.
  const sectionOf = (el) => {
    const sec = el.parentElement?.closest("section,article,main,nav,header,footer,aside,form");
    if (!sec) return "";
    const label = sec.getAttribute("aria-label") ||
      sec.querySelector("h1,h2,h3,h4,h5,h6")?.textContent.trim().slice(0, 60) || "";
    return `<${tagOf(sec)}>${label ? ` "${label}"` : ""}`;
  };
  const viewportNow = () => `${window.innerWidth}×${window.innerHeight}`;
  const refOf = (el) => (el.id ? `#${el.id}` : el.classList.length ? `.${el.classList[0]}` : "");
  const descOf = (el) => {
    const cls = [...el.classList].slice(0, 3).join(".");
    return tagOf(el) + (el.id ? `#${el.id}` : cls ? `.${cls}${el.classList.length > 3 ? "…" : ""}` : "");
  };
  const shortUrl = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };
  const findMarkEl = (m) => {
    if (!m.selector || m.url !== location.href) return null;
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
    if (popupOpen) return; // highlight is pinned to the composer's target
    if (!state?.open || !state.marking || inOurUI(e)) { if (!cardHover) hideHighlight(); return; }
    const el = e.target;
    if (!el || el === document.body || el === document.documentElement) { hideHighlight(); return; }
    if (el !== hoverEl) { hoverEl = el; lockChain = []; }
    paintHighlight(pickTarget());
  }

  function onClick(e) {
    if (!state?.open) return;
    if (!chrome.runtime?.id) return die(); // extension was reloaded under us
    if (popupOpen) {
      if (e.composedPath().includes(popup)) return; // interacting with the composer
      if (inOurUI(e)) { if (!$("msg").value.trim()) closePopup(); return; } // pill/panel stay usable
      e.preventDefault();
      e.stopPropagation();
      if (!$("msg").value.trim()) closePopup(); // click-outside closes only when empty
      return;
    }
    if (state.listOpen && !state.marking && !inOurUI(e)) setState({ listOpen: false }); // popover behavior
    if (auditOpen && !state.marking && !inOurUI(e)) toggleAudit(false);
    if (!state.marking || inOurUI(e)) return;
    e.preventDefault();
    e.stopPropagation();
    openPopup(lockChain.length ? pickTarget() : e.target);
  }

  const syncPrimary = () => $("send").classList.toggle("waiting", popupOpen || editingId != null);

  const hasParent = (el) => { const p = el?.parentElement; return p && p !== document.body && p !== document.documentElement; };
  function retarget(up) {
    if (!popupEl) return;
    if (up) {
      if (!hasParent(popupEl)) return;
      popupChain.push(popupEl);
      popupEl = popupEl.parentElement;
    } else {
      if (!popupChain.length) return;
      popupEl = popupChain.pop();
    }
    $("popupTag").textContent = descOf(popupEl);
    paintHighlight(popupEl);
    $("walkup").disabled = !hasParent(popupEl);
    $("walkdown").disabled = !popupChain.length;
  }
  $("walkup").onclick = () => { retarget(true); $("msg").focus(); };
  $("walkdown").onclick = () => { retarget(false); $("msg").focus(); };

  function openPopup(el) {
    if (!el) return;
    popupOpen = true;
    popupEl = el;
    popupChain = [];
    syncPrimary();
    paintHighlight(el);
    $("walkup").disabled = !hasParent(el);
    $("walkdown").disabled = true;
    $("popupTag").textContent = descOf(el);
    $("msg").value = "";
    popup.dataset.dir = "down";
    const r = el.getBoundingClientRect();
    const top = Math.min(r.bottom + 8, window.innerHeight - 150);
    const left = Math.min(r.left, window.innerWidth - 296);
    Object.assign(popup.style, { display: "block", top: Math.max(8, top) + "px", left: Math.max(8, left) + "px" });
    $("msg").focus();
  }
  // Page-level note — same composer, no target element, anchored to the pill.
  // Opens away from the nearest vertical edge (above the pill when it sits in
  // the lower half) so it never gets clamped against the viewport.
  function openPagePopup() {
    popupOpen = true;
    popupPage = true;
    popupEl = null;
    popupChain = [];
    syncPrimary();
    hideHighlight();
    root.querySelector(".walk").style.display = "none";
    $("popupTag").textContent = "this page";
    $("msg").value = "";
    popup.style.display = "block"; // display first so offsetHeight is real
    const r = pill.getBoundingClientRect();
    const below = r.top < window.innerHeight / 2;
    popup.dataset.dir = below ? "down" : "up"; // entrance animates away from the pill
    const top = below ? r.bottom + 8 : r.top - popup.offsetHeight - 8;
    const left = clamp(r.left, 8, window.innerWidth - popup.offsetWidth - 8);
    Object.assign(popup.style, { top: clamp(top, 8, window.innerHeight - popup.offsetHeight - 8) + "px", left: left + "px" });
    $("msg").focus();
  }
  function closePopup() {
    popupOpen = false;
    popupPage = false;
    popup.style.display = "none";
    popupEl = null;
    popupChain = [];
    root.querySelector(".walk").style.display = "";
    syncPrimary();
    if (!cardHover) hideHighlight();
  }

  $("ok").onclick = () => {
    const message = $("msg").value.trim();
    if (!message || (!popupEl && !popupPage)) return closePopup();
    const ms = marks().slice();
    const base = { id: nextId(ms), url: location.href, title: document.title, viewport: viewportNow(), message };
    ms.push(popupPage
      ? { ...base, selector: "", tag: "page", ref: "", element: "page", text: "" }
      : { ...base, selector: cssPath(popupEl), tag: tagOf(popupEl), ref: refOf(popupEl),
          element: descOf(popupEl), text: (popupEl.textContent || "").trim().slice(0, 80),
          html: openTag(popupEl), context: sectionOf(popupEl) });
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
      auditPanel.style.display = "none";
      auditOpen = false;
      dialog.style.display = "none";
      confirmEl.style.display = "none";
      closePopup();
      hideHighlight();
      dots.textContent = "";
      return;
    }
    positionPill();
    const n = marks().length;
    if (lastCount >= 0 && n > lastCount) {
      const nb = $("notes");
      nb.classList.remove("pulse");
      void nb.offsetWidth; // restart the pulse animation
      nb.classList.add("pulse");
    }
    lastCount = n;
    $("pillcount").textContent = String(n);
    $("notes").setAttribute("aria-label", `Show marks (${n})`);
    $("notes").setAttribute("aria-expanded", String(!!state.listOpen));
    $("notes").classList.toggle("active", !!state.listOpen);
    $("mark").classList.toggle("active", !!state.marking);
    $("mark").setAttribute("aria-pressed", String(!!state.marking));
    $("send").disabled = n === 0;
    syncPrimary();
    if (state.listOpen) auditOpen = false; // one popover at a time
    panel.style.display = state.listOpen ? "flex" : "none";
    if (state.listOpen) {
      const pages = new Set(marks().map((m) => m.url)).size;
      $("count").textContent = `${n} mark${n === 1 ? "" : "s"}${pages > 1 ? ` · ${pages} pages` : ""}`;
      renderList();
      positionPanel();
    }
    syncA11yBtn();
    auditPanel.style.display = auditOpen ? "flex" : "none";
    if (auditOpen) {
      renderAudit();
      positionPanel(auditPanel);
    }
    if (location.href !== auditUrl) scheduleAudit();
    if (!state.marking) { hoverEl = null; lockChain = []; if (!cardHover) hideHighlight(); }
    updateDots();
  }

  function renderList() {
    const list = $("list");
    list.innerHTML = "";
    // The hovered card was just detached — removed nodes never get mouseleave.
    if (cardHover) { cardHover = false; hideHighlight(); }
    if (!marks().length) {
      const p = document.createElement("div");
      p.className = "empty";
      p.textContent = "No marks yet. Press M, then click any element on the page.";
      list.appendChild(p);
      return;
    }
    const ms = orderedMarks();
    const multiPage = new Set(ms.map((m) => m.url)).size > 1;
    let lastUrl = null;
    ms.forEach((m, i) => {
      if (multiPage && m.url !== lastUrl) {
        lastUrl = m.url;
        const ph = document.createElement("div");
        ph.className = "pagehead";
        ph.textContent = shortUrl(m.url);
        ph.title = m.url;
        list.appendChild(ph);
      }
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
      tag.className = m.selector ? "tag" : "page";
      tag.textContent = m.selector ? `<${m.tag || "el"}>` : "Page note";
      head.appendChild(tag);
      if (m.a11y) {
        const ac = document.createElement("span");
        ac.className = "a11ychip";
        ac.textContent = "a11y";
        ac.title = `From the a11y audit — WCAG ${m.a11y}`;
        head.appendChild(ac);
      }
      if (m.ref) { const ref = document.createElement("span"); ref.className = "ref"; ref.textContent = m.ref; head.appendChild(ref); }

      if (editingId === m.id) {
        li.appendChild(head);
        const ta = document.createElement("textarea");
        ta.rows = 2;
        ta.value = editDraft ?? m.message; // draft survives re-renders
        ta.oninput = () => { editDraft = ta.value; };
        const row = document.createElement("div");
        row.className = "editrow";
        const saveBtn = document.createElement("button");
        saveBtn.className = "btn-save onaccent"; saveBtn.textContent = "Save";
        saveBtn.onclick = () => { const v = ta.value.trim(); if (v) m.message = v; editingId = null; editDraft = null; setState({ marks: marks() }); };
        const cancel = document.createElement("button");
        cancel.className = "btn-cancel onneutral"; cancel.textContent = "Cancel";
        cancel.onclick = () => { editingId = null; editDraft = null; render(); };
        ta.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveBtn.click(); }
        });
        row.append(saveBtn, cancel);
        li.append(ta, row);
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      } else {
        const actions = document.createElement("span");
        actions.className = "actions";
        const edit = document.createElement("button"); edit.textContent = "Edit";
        edit.setAttribute("aria-label", `Edit mark ${i + 1}`);
        edit.onclick = () => { editingId = m.id; editDraft = null; render(); };
        const del = document.createElement("button"); del.textContent = "Delete";
        del.setAttribute("aria-label", `Delete mark ${i + 1}`);
        del.onclick = () => { cardHover = false; hideHighlight(); setState({ marks: marks().filter((x) => x.id !== m.id) }); };
        const info = document.createElement("button"); info.innerHTML = icon("info", 12);
        info.setAttribute("aria-label", `Details for mark ${i + 1}`);
        info.setAttribute("aria-expanded", String(metaOpen.has(m.id)));
        info.onclick = () => { metaOpen.has(m.id) ? metaOpen.delete(m.id) : metaOpen.add(m.id); render(); };
        actions.append(edit, document.createTextNode("·"), del, info);
        head.appendChild(actions);
        li.appendChild(head);
        const msg = document.createElement("div"); msg.className = "msg"; msg.textContent = m.message;
        li.appendChild(msg);
        if (here && m.selector && !el) { const s = document.createElement("div"); s.className = "stale"; s.textContent = "Element no longer found on this page"; li.appendChild(s); }
        if (metaOpen.has(m.id)) {
          const meta = document.createElement("div");
          meta.className = "meta";
          for (const [label, v] of [["URL", m.url], ["Viewport", m.viewport], ["WCAG", m.a11y]]) {
            if (!v) continue;
            const row = document.createElement("div");
            row.textContent = `${label}: ${v}`;
            row.title = v;
            meta.appendChild(row);
          }
          li.appendChild(meta);
        }
      }
      list.appendChild(li);
    });
  }

  // Numbered chips pinned to each marked element on the current page.
  function updateDots() {
    dots.textContent = "";
    if (!state?.open) return;
    orderedMarks().forEach((m, i) => {
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
    const vp0 = ms.find((m) => m.viewport)?.viewport;
    let out = `I marked ${ms.length} item(s) on a running web app that need changes. For each item, use the CSS selector, HTML opening tag, element description and text snippet to find the matching code (the page URL tells you the route), then make the change. Generated class names may not exist in source — fall back to the element's text and structure. Only change what each item asks for.`;
    if (vp0) out += ` Viewport was ${vp0} unless an item says otherwise.`;
    if (ms.some((m) => !m.selector)) out += ` "Page note" items apply to the whole page, not one element.`;
    if (ms.some((m) => m.a11y)) out += ` Items with a WCAG line are accessibility issues found by an automated WCAG 2.1 audit — fix them so the criterion passes.`;
    out += "\n";
    for (const [url, items] of Object.entries(byUrl)) {
      out += `\n## ${items[0].title || url}\n${url}\n`;
      items.forEach((m) => {
        const n = ms.indexOf(m) + 1;
        if (!m.selector) { out += `\n${n}. Page note${m.a11y ? ` (WCAG ${m.a11y})` : ""}: ${m.message}\n`; return; }
        out += `\n${n}. Selector: \`${m.selector}\`\n   Element: ${m.element}${m.text ? ` — "${m.text}"` : ""}\n`;
        if (m.html) out += `   HTML: \`${m.html}\`\n`;
        if (m.context) out += `   Context: inside ${m.context}\n`;
        if (m.viewport && m.viewport !== vp0) out += `   Viewport: ${m.viewport}\n`;
        if (m.a11y) out += `   WCAG: ${m.a11y}\n`;
        out += `   Change: ${m.message}\n`;
      });
    }
    return out;
  }

  function doSend() {
    if (!marks().length) return;
    $("prompt").value = buildPrompt(orderedMarks());
    lastFocus = root.activeElement || document.activeElement;
    dialog.style.display = "flex";
    $("copy").focus();
    copyPrompt(); // prompt lands in the clipboard immediately; dialog is for review
  }
  function closeDialog() {
    dialog.style.display = "none";
    if (lastFocus?.isConnected) lastFocus.focus();
    lastFocus = null;
  }

  // --- a11y audit -----------------------------------------------------------
  // ponytail: hand-rolled machine-checkable subset of WCAG 2.1 (no automated
  // tool covers all of AA — most criteria need human judgment); vendor
  // axe-core if deeper coverage is ever needed.
  const isVisible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const accName = (el) =>
    (el.getAttribute("aria-label") || "").trim() ||
    (el.getAttribute("aria-labelledby") || "").split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || "").join(" ").trim() ||
    (el.textContent || "").trim() ||
    (el.getAttribute("title") || "").trim() ||
    (el.querySelector("img[alt]")?.alt || "").trim();
  const parseRGB = (str) => {
    const m = str.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.%]+))?\)/);
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : parseFloat(m[4]) / (m[4].endsWith("%") ? 100 : 1)] : null;
  };
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrastOf = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const blend = (c, bg) => c[3] >= 1 ? c :
    [c[0] * c[3] + bg[0] * (1 - c[3]), c[1] * c[3] + bg[1] * (1 - c[3]), c[2] * c[3] + bg[2] * (1 - c[3]), 1];
  // Effective solid background behind an element, compositing translucent
  // layers up the tree. null = a background image is involved — can't judge.
  function bgOf(el) {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage !== "none") return null;
      const c = parseRGB(s.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let bg = layers.length && layers[layers.length - 1][3] >= 1 ? layers.pop() : [255, 255, 255, 1];
    while (layers.length) bg = blend(layers.pop(), bg);
    return bg;
  }

  function runAudit() {
    auditUrl = location.href;
    const issues = [];
    const add = (sc, level, desc, el = null) => issues.push({ sc, level, desc, el, count: 1 });

    if (!document.documentElement.lang?.trim()) add("3.1.1", "A", "<html> has no lang attribute");
    const vp = document.querySelector('meta[name="viewport" i]')?.content || "";
    if (/user-scalable\s*=\s*(no|0)/i.test(vp) || /maximum-scale\s*=\s*(1(\.0+)?|0)\b/i.test(vp))
      add("1.4.4", "AA", "Viewport meta blocks pinch-zoom (user-scalable / maximum-scale)");
    for (const img of document.querySelectorAll("img:not([alt])"))
      if (isVisible(img)) add("1.1.1", "A", "Image has no alt attribute", img);
    for (const el of document.querySelectorAll('button, a[href], [role="button"]'))
      if (isVisible(el) && !accName(el)) add("4.1.2", "A", `<${tagOf(el)}> has no accessible name`, el);
    for (const el of document.querySelectorAll("input:not([type=hidden],[type=button],[type=submit],[type=reset],[type=image]), select, textarea")) {
      if (!isVisible(el)) continue;
      if (!(el.labels?.length || el.closest("label") || el.getAttribute("aria-label") ||
            el.getAttribute("aria-labelledby") || el.getAttribute("title")))
        add("3.3.2", "A", `<${tagOf(el)}> form field has no label`, el);
    }
    for (const f of document.querySelectorAll("iframe:not([title])"))
      if (isVisible(f)) add("4.1.2", "A", "<iframe> has no title", f);
    const ids = new Map();
    for (const el of document.querySelectorAll("[id]")) ids.set(el.id, (ids.get(el.id) || 0) + 1);
    for (const [id, n] of ids) if (n > 1) add("4.1.1", "A", `Duplicate id "${id}" (${n} elements)`);
    const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(isVisible);
    if (hs.length && !hs.some((h) => h.tagName === "H1")) add("1.3.1", "A", "Page has headings but no <h1>");
    let prev = 0;
    for (const h of hs) {
      const l = +h.tagName[1];
      if (prev && l > prev + 1) add("1.3.1", "A", `Heading level skips from h${prev} to h${l}`, h);
      prev = l;
    }

    // 1.4.3 (AA) / 1.4.6 (AAA) text contrast — solid backgrounds only,
    // deduped per fg/bg color pair. ponytail: capped scan, skips text over
    // images/gradients rather than guessing.
    const seen = new Map();
    let scanned = 0;
    for (const el of document.body?.querySelectorAll("*") || []) {
      if (scanned >= 3000) break;
      if (el.closest("script,style,noscript")) continue;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) continue;
      if (!isVisible(el)) continue;
      scanned++;
      const s = getComputedStyle(el);
      const bg = bgOf(el);
      const fgRaw = parseRGB(s.color);
      if (!bg || !fgRaw) continue;
      const ratio = contrastOf(blend(fgRaw, bg), bg);
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700);
      const aa = large ? 3 : 4.5, aaa = large ? 4.5 : 7;
      if (ratio >= aaa) continue;
      const key = `${s.color}|${bg.map(Math.round).join()}|${large}`;
      const dup = seen.get(key);
      if (dup) { dup.count++; continue; }
      const issue = ratio < aa
        ? { sc: "1.4.3", level: "AA", desc: `Text contrast ${ratio.toFixed(2)}:1 — needs ≥ ${aa}:1`, el, count: 1 }
        : { sc: "1.4.6", level: "AAA", desc: `Text contrast ${ratio.toFixed(2)}:1 — needs ≥ ${aaa}:1 for AAA`, el, count: 1 };
      seen.set(key, issue);
      issues.push(issue);
    }
    auditIssues = issues;
  }

  const shownIssues = () => (auditIssues || []).filter((i) => auditLevel === "AAA" || i.level !== "AAA");

  function syncA11yBtn() {
    const b = $("a11y");
    const n = shownIssues().length;
    b.classList.toggle("warn", !!auditIssues && n > 0);
    b.classList.toggle("ok", !!auditIssues && n === 0);
    b.classList.toggle("active", auditOpen);
    b.setAttribute("aria-expanded", String(auditOpen));
    b.innerHTML = !auditIssues ? icon("accessibility", 14)
      : n ? `${icon("triangle-alert", 14)}<span>${n}</span>` : icon("check", 14);
    b.setAttribute("aria-label", !auditIssues ? "Accessibility audit"
      : `Accessibility audit: ${n} issue${n === 1 ? "" : "s"} at level ${auditLevel}`);
  }

  function scheduleAudit() {
    clearTimeout(auditTimer);
    auditTimer = setTimeout(() => { if (state?.open) { runAudit(); render(); } }, 250);
  }

  function toggleAudit(open = !auditOpen) {
    auditOpen = open;
    if (open) {
      runAudit();
      if (state.listOpen) return setState({ listOpen: false });
    }
    render();
  }

  function setLevel(l) {
    auditLevel = l;
    try { chrome.storage.local.set({ a11yLevel: l }).catch(() => {}); } catch {}
    render();
  }

  const issueMsg = (i) => i.desc + (i.count > 1 ? ` (${i.count} elements)` : "");
  // "Already in notes" is derived live from the marks (keyed on criterion +
  // message) so re-runs can't double-add and deleting a mark re-arms Add.
  const issueMarkId = (i) => marks().find((m) => m.a11y === `${i.sc} ${i.level}` && m.message === issueMsg(i))?.id;

  // Turn an audit issue into a regular mark (page note when no element).
  function issueMark(i, ms) {
    const el = i.el?.isConnected ? i.el : null;
    const base = {
      id: nextId(ms), url: location.href, title: document.title, viewport: viewportNow(),
      message: issueMsg(i), a11y: `${i.sc} ${i.level}`,
    };
    ms.push(el
      ? { ...base, selector: cssPath(el), tag: tagOf(el), ref: refOf(el), element: descOf(el),
          text: (el.textContent || "").trim().slice(0, 80), html: openTag(el), context: sectionOf(el) }
      : { ...base, selector: "", tag: "page", ref: "", element: "page", text: "" });
  }

  function renderAudit() {
    const list = $("auditlist");
    list.innerHTML = "";
    if (cardHover) { cardHover = false; hideHighlight(); }
    const shown = shownIssues();
    $("auditcount").textContent = `${shown.length} issue${shown.length === 1 ? "" : "s"} · WCAG 2.1 ${auditLevel}`;
    for (const [btn, l] of [[$("lvlAA"), "AA"], [$("lvlAAA"), "AAA"]]) {
      btn.classList.toggle("active", auditLevel === l);
      btn.setAttribute("aria-pressed", String(auditLevel === l));
    }
    $("addall").disabled = !shown.some((i) => !issueMarkId(i));
    if (!shown.length) {
      const p = document.createElement("div");
      p.className = "empty";
      p.textContent = "No issues found by the automated checks. They cover only part of WCAG 2.1 — manual review still matters.";
      list.appendChild(p);
      return;
    }
    shown.forEach((i) => {
      const li = document.createElement("div");
      li.className = "mark";
      const head = document.createElement("div");
      head.className = "markhead";
      const chip = document.createElement("span");
      chip.className = "a11ychip";
      chip.textContent = `WCAG ${i.sc} · ${i.level}`;
      head.appendChild(chip);
      const ref = document.createElement("span");
      ref.className = "ref";
      ref.textContent = i.el ? descOf(i.el) : "page";
      head.appendChild(ref);
      const markId = issueMarkId(i);
      const addBtn = document.createElement("button");
      addBtn.className = markId ? "addbtn added" : "addbtn";
      addBtn.innerHTML = markId ? icon("check", 14) : icon("plus", 14);
      addBtn.title = markId ? "Remove from notes" : "Add to notes";
      addBtn.setAttribute("aria-pressed", String(!!markId));
      addBtn.setAttribute("aria-label", `${markId ? "Remove issue from" : "Add issue to"} notes: ${i.desc}`);
      addBtn.onclick = () => {
        if (markId) return setState({ marks: marks().filter((m) => m.id !== markId) });
        const ms = marks().slice();
        issueMark(i, ms);
        setState({ marks: ms });
      };
      head.appendChild(addBtn);
      li.appendChild(head);
      const msg = document.createElement("div");
      msg.className = "msg";
      msg.textContent = issueMsg(i);
      li.appendChild(msg);
      if (i.el?.isConnected) {
        li.onmouseenter = () => { cardHover = true; paintHighlight(i.el); };
        li.onmouseleave = () => { cardHover = false; hideHighlight(); };
        li.onclick = (e) => {
          if (e.target.closest("button")) return;
          i.el.scrollIntoView({ block: "center", behavior: motionOK() ? "smooth" : "auto" });
        };
      }
      list.appendChild(li);
    });
  }

  $("a11y").onclick = () => toggleAudit();
  $("auditclose").onclick = () => { toggleAudit(false); $("a11y").focus(); };
  $("lvlAA").onclick = () => setLevel("AA");
  $("lvlAAA").onclick = () => setLevel("AAA");
  $("rerun").onclick = () => { runAudit(); render(); };
  $("addall").onclick = () => {
    const ms = marks().slice();
    shownIssues().filter((i) => !issueMarkId(i)).forEach((i) => issueMark(i, ms));
    if (ms.length !== marks().length) setState({ marks: ms });
  };

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
  bindTip($("pagenote"), "Page note", "N");
  bindTip($("a11y"), "A11y audit", "A");
  bindTip($("notes"), "Marks", "L");

  $("mark").onclick = () => setState({ marking: !state.marking });
  $("notes").onclick = () => setState({ listOpen: !state.listOpen });
  $("pagenote").onclick = openPagePopup;
  $("panelclose").onclick = () => { setState({ listOpen: false }); $("notes").focus(); };
  $("send").onclick = doSend;
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
  async function copyPrompt() {
    const ta = $("prompt");
    try { await navigator.clipboard.writeText(ta.value); }
    catch { ta.focus(); ta.select(); document.execCommand("copy"); $("copy").focus(); }
    $("copy").innerHTML = `${icon("check", 15)} Copied`;
    setTimeout(() => { $("copy").innerHTML = `${icon("copy", 15)} Copy prompt`; }, 1200);
  }
  $("copy").onclick = copyPrompt;

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

  function positionPanel(el = panel) {
    // Anchor to the pill's target position (style.left/top), not its rendered
    // rect — during a corner snap the rect is mid-transition and the panel
    // would stick to the drop point instead of the corner.
    const left = parseFloat(pill.style.left) || 0, top = parseFloat(pill.style.top) || 0;
    const pr = { left, top, width: pill.offsetWidth, right: left + pill.offsetWidth, bottom: top + pill.offsetHeight };
    const below = pr.top < window.innerHeight / 2;
    const space = below ? window.innerHeight - pr.bottom - 8 - MARGIN : pr.top - 8 - MARGIN;
    el.dataset.dir = below ? "down" : "up"; // entrance animates away from the pill
    el.style.maxHeight = Math.min(520, Math.max(160, space)) + "px";
    el.style.top = below ? pr.bottom + 8 + "px" : "";
    el.style.bottom = below ? "" : window.innerHeight - pr.top + 8 + "px";
    const rightHalf = pr.left + pr.width / 2 > window.innerWidth / 2;
    el.style.left = rightHalf ? "" : Math.max(MARGIN, pr.left) + "px";
    el.style.right = rightHalf ? Math.max(MARGIN, window.innerWidth - pr.right) + "px" : "";
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
      if (auditOpen) positionPanel(auditPanel);
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
      panel.classList.add("snap");
      auditPanel.classList.add("snap");
      setTimeout(() => { pill.classList.remove("snap"); panel.classList.remove("snap"); auditPanel.classList.remove("snap"); }, 300);
      setState({ pos });
    };
    pill.addEventListener("pointermove", onDrag);
    pill.addEventListener("pointerup", onUp);
    pill.addEventListener("pointercancel", onUp);
  });

  // Minimal focus trap for the two aria-modal surfaces (dialog, confirm).
  function trapTab(container, e) {
    const els = container.querySelectorAll("button, textarea, a[href]");
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    const active = root.activeElement;
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    else if (!container.contains(active)) { e.preventDefault(); first.focus(); }
  }

  // --- global shortcuts ---------------------------------------------------
  window.addEventListener("keydown", (e) => {
    if (!state?.open) return;
    if (!chrome.runtime?.id) return die(); // extension was reloaded under us
    if (e.key === "Escape") {
      if (confirmEl.style.display === "flex") return closeConfirm();
      if (popupOpen) { closePopup(); return $("mark").focus(); }
      if (dialog.style.display === "flex") return closeDialog();
      if (editingId != null) { editingId = null; editDraft = null; render(); return $("notes").focus(); }
      if (state.marking) return setState({ marking: false });
      if (auditOpen) { toggleAudit(false); return $("a11y").focus(); }
      if (state.listOpen) { setState({ listOpen: false }); return $("notes").focus(); }
      return;
    }
    // While a modal is up: trap Tab inside it, suppress the global shortcuts.
    const modal = confirmEl.style.display === "flex" ? confirmEl : dialog.style.display === "flex" ? dialog : null;
    if (modal) { if (e.key === "Tab") trapTab(modal, e); return; }
    // ⌥↑/⌥↓ retarget the composer's element — before the typing guard so they
    // work while the note textarea has focus.
    if (popupOpen && e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      return retarget(e.key === "ArrowUp");
    }
    if (popupOpen || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
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
    else if (k === "g") { e.preventDefault(); doSend(); }
    else if (k === "l") { e.preventDefault(); setState({ listOpen: !state.listOpen }); }
    else if (k === "n") { e.preventDefault(); openPagePopup(); }
    else if (k === "a") { e.preventDefault(); toggleAudit(); }
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
  // SPA support: client-side navigations change the URL without a reload, and
  // framework re-renders move/replace marked elements — repaint on both.
  self.navigation?.addEventListener("navigatesuccess", () => state?.open && render());
  new MutationObserver(() => {
    if (!state?.open || !marks().length) return;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateDots(); });
  }).observe(document.documentElement, { childList: true, subtree: true });

  try {
    // a11y conformance level is a browser-wide preference, not per-tab state
    chrome.storage.local?.get("a11yLevel")?.then((r) => {
      if (r.a11yLevel === "AAA") { auditLevel = "AAA"; if (state?.open) render(); }
    });
    // background pings before opening, to check this script is alive here
    chrome.runtime.onMessage.addListener((msg, _s, respond) => { if (msg === "ping") respond(true); });
    chrome.runtime.sendMessage("tabId", (id) => {
      if (chrome.runtime.lastError || id == null) return;
      tabKey = "tab:" + id;
      chrome.storage.session.get(tabKey).then((r) => { state = r[tabKey] || null; render(); });
      chrome.storage.session.onChanged.addListener((c) => {
        if (!c[tabKey]) return;
        state = c[tabKey].newValue || null;
        if (editingId != null && !marks().some((m) => m.id === editingId)) { editingId = null; editDraft = null; }
        render();
      });
    });
  } catch { die(); }
})();

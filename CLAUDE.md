# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Chrome MV3 extension (vanilla JS, no build step, no dependencies). You mark
DOM elements on any page, note what should change per mark, and generate a
single paste-ready prompt for an AI coding agent (`buildPrompt` in `content.js`).

## Running it

No build, no tests, no lint. Load unpacked: `chrome://extensions` → Developer
mode → **Load unpacked** → this folder. After editing files, hit the reload
icon on the extension card (and reload the target page for `content.js` changes).

## Architecture

State is **per tab** and lives in `chrome.storage.session` under `"tab:<id>"`
as one object: `{ open, marking, listOpen, pos, marks }`. Session storage
clears when the browser closes, so marks never outlive a session; closing a
tab wipes its key. There is exactly **one runtime message** in the extension —
the content script asks background for its tab id (`"tabId"`) at startup;
everything else flows through `storage.session.onChanged`.

- **`background.js`** (service worker) — calls `setAccessLevel` so content
  scripts can read session storage, answers the `"tabId"` handshake, toggles
  `open` on toolbar click (**hiding keeps the tab's marks** — only tab close /
  browser exit wipes them), cleans up on `tabs.onRemoved`, and mirrors each
  tab's mark count into the toolbar badge.
- **`content.js`** — the entire UI. Injected on `<all_urls>` at `document_idle`,
  top frame only. Runs inside a closed IIFE and renders into a **shadow root**
  to isolate styles from the host page. All design tokens are CSS custom
  properties on `:host`. The main view is a **floating pill** that drags
  anywhere and **snaps to viewport corners** (`pos` is `{corner}` or `{x,y}`);
  the marks panel is a popover anchored to it. Key flow: `onMove`/`onClick`
  (marking, with ArrowUp/Down parent-walk) → `openPopup` (note composer) →
  `cssPath` builds the selector → `setState({marks})` → `render`/`renderList`/
  `updateDots` → `buildPrompt`/`doSend`. Numbered dots pin to marked elements
  on the current page and match the list/prompt numbering.
- **`manifest.json`** — permissions: `storage` only; `host_permissions:
  <all_urls>`; `minimum_chrome_version: 110` (session-storage access level +
  badge text color).

Mutate state only via `setState` (patches the local copy, renders
optimistically, then persists); `storage.session.onChanged` drives re-renders
from background writes. Don't hold UI state in locals expecting it to persist
across pages.

## Conventions specific to this repo

- **Fonts are bundled**, not CDN-loaded: Geist / Geist Mono woff2 in `fonts/`,
  registered via `@font-face` on the **main document** (not the shadow root, so
  the face reaches into the shadow DOM) using `chrome.runtime.getURL`. This
  exists to bypass strict page CSPs — keep it. Both are declared in
  `web_accessible_resources`.
- **`DESIGN.md` is the design-token source of truth.** Colors, radii, shadows,
  and sizes there map 1:1 to the CSS custom properties in `content.js`. Change
  tokens in both, and keep the keyboard-shortcut tables in `DESIGN.md` and
  `README.md` in sync with the `keydown` handlers in `content.js`.
- Global shortcuts (`M`, `S`, `L`) are suppressed while typing — gate on
  `isTyping()`. `Escape` closes strictly top-down: confirm → composer → prompt
  dialog → card editor → marking mode → panel.
- `cssPath` prefers `id` / `data-testid`-style hooks and **filters
  hashed/generated class names** (`stableClass`) so selectors stay findable in
  source code.
- The user-facing action is **"Generate prompt"** (terminal icon) — nothing is
  sent anywhere; the dialog just offers the prompt for copying.
- To manually test without loading the extension, there's a harness pattern:
  a plain HTML page that stubs `chrome.runtime`/`chrome.storage.session` and
  loads `content.js` — see git history or ask for it to be regenerated.

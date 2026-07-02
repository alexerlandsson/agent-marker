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

Three scripts share state through `chrome.storage.local` — there is no message
passing between them; each observes storage and re-renders.

- **`background.js`** (service worker) — toolbar icon toggles the `open` flag.
  Owns the reset lifecycle: `onStartup`/`onInstalled` and every close wipe
  `{ open, marking, minimized, marks }`. Marks are deliberately **session-scoped**
  so they never leak between sites/sessions — don't add persistence without a reason.
- **`content.js`** — the entire UI. Injected on `<all_urls>` at `document_idle`.
  Runs inside a closed IIFE and renders into a **shadow root** (`attachShadow`)
  to isolate styles from the host page. All design tokens are CSS custom
  properties on `:host`. Key flow: `onMove`/`onClick` (marking) → `openPopup`
  (note composer) → `cssPath` builds the selector → mark saved to storage →
  `render`/`renderList` → `buildPrompt`/`doSend`.
- **`manifest.json`** — permissions: `storage`, `activeTab`, `scripting`;
  `host_permissions: <all_urls>`.

State (`open`, `marking`, `minimized`, `marks`, `barPos`) lives only in storage.
Mutate it via `setState`/`save` (thin wrappers over `chrome.storage.local.set`);
the `storage.onChanged` listener drives all re-rendering. Don't hold UI state in
locals expecting it to persist across pages.

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
- Global shortcuts (`M`, `S`) are suppressed while typing — gate on `isTyping()`.

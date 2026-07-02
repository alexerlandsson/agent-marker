# Agent Marker

Chrome extension to mark elements on a page, write what should change, and send
the batch to an AI coding agent (Claude Code) as a ready-to-paste prompt.

## Install (dev)

1. Go to `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Pin the extension. Click its toolbar icon to toggle marker mode.

## Use

1. Click the toolbar icon → the docked panel appears (top-right).
2. Click **Mark** (or press `M`) to start marking; click/press again to stop.
3. Hover the page: elements highlight with a tag label. Click one → type what
   should change → **Save** (`⌘↵`) or **Cancel** (`Esc`).
4. Edit or delete any mark from the panel list. Marks persist across pages/URLs.
5. **Send to agent** (or press `S`) → copy the generated prompt → paste into Claude Code.

Use the **minimize** button (▁) to collapse the panel into a draggable floating
mini-bar; **⤢** expands it back. See `DESIGN.md` for the design system.

The prompt includes, per mark: page title + URL, a CSS selector, the element
(tag/id/classes + text snippet), and your instruction — enough for Claude Code
to locate the code and make the change.

## Later: MCP instead of copy-paste

Copy-paste needs zero infra and already kills the "type the reference" chore.
Add an MCP server only if you want Claude Code to pull marks without pasting.
Sketch: run a tiny local HTTP + MCP server; have the extension POST marks to
`localhost` instead of (or alongside) storage; expose a `get_marks` MCP tool.
Not built yet — the copy-paste flow covers the goal first.

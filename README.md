<p align="center">
  <img src="logo.svg" width="96" height="96" alt="Agent Marker logo">
</p>

<h1 align="center">Agent Marker</h1>

<p align="center">
  Mark elements on any web page, note what should change, and hand the whole batch
  to your AI coding agent as a ready-to-paste prompt.
</p>

---

Stop typing "the button in the header on the pricing page" over and over. Agent
Marker lets you **click the elements you want changed**, jot a one-line
instruction for each, and generate a single prompt that tells Claude Code
exactly what to change and where — complete with page URL and a CSS selector for
every mark. Mark across multiple pages in one go; send once.

## Install

1. Open `chrome://extensions` and enable **Developer mode** (top-right).
2. Click **Load unpacked** and select this folder.
3. Pin the extension, then click its toolbar icon to open the panel.

## Usage

1. **Open** — click the toolbar icon. A docked panel appears at the top-right.
2. **Mark** — click **Mark** (or press <kbd>M</kbd>) to arm marking. Hover the
   page to highlight elements; click one to open a note.
3. **Describe** — type what should change (e.g. _"make this heading bigger"_) and
   **Save**. It's added to the panel list. Repeat across as many pages as you like.
4. **Send** — click **Send to agent** (or press <kbd>S</kbd>), **Copy prompt**,
   and paste it into Claude Code.

Edit or delete any mark from the list. **Minimize** collapses the panel into a
draggable floating mini-bar; **⤢** expands it back.

> Marks are session-scoped — closing the plugin clears them, so nothing leaks
> between sites or sessions.

### Keyboard shortcuts

| Key            | Action                    |
| -------------- | ------------------------- |
| <kbd>M</kbd>   | Toggle marking            |
| <kbd>S</kbd>   | Send to agent             |
| <kbd>⌘</kbd> <kbd>↵</kbd> | Save the current note |
| <kbd>Esc</kbd> | Cancel / close            |

## What the agent receives

Each mark contributes its page title and URL, a CSS selector, the element
(tag / id / classes + a text snippet), and your instruction — grouped by page.
That's enough for Claude Code to locate the code and make the change without any
extra context from you.

## Design

The panel's visual language (dark teal theme, tokens, components) is documented
in [`DESIGN.md`](./DESIGN.md).

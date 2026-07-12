<p align="center">
  <img src="logo.svg" width="96" height="96" alt="Agent Marker logo">
</p>

<h1 align="center">Agent Marker</h1>

<p align="center">
  <strong>Mark elements on any web page, note what should change, and hand the whole batch
  to your AI coding agent as a ready-to-paste prompt.</strong>
</p>

---

Stop typing "the button in the header on the pricing page" over and over. Agent
Marker lets you **click the elements you want changed**, jot a one-line
instruction for each, and generate a single prompt that tells Claude Code
exactly what to change and where — complete with page URL and a CSS selector for
every mark. Mark across multiple pages in one go; send once.

## Install

1. Open `chrome://extensions` and enable **Developer mode** (top-right).
2. Click `Load unpacked` and select this folder.
3. Pin the extension, then click its toolbar icon to open the panel.

## Usage

1. **Open** — click the toolbar icon. A small floating pill appears in the
   bottom-right corner with marking already armed. Drag the pill anywhere;
   drop it near a corner and it snaps there (and stays there across resizes).
2. **Mark** — hover the page to highlight elements (<kbd>↑</kbd>/<kbd>↓</kbd>
   walk to the parent/child), then click (or press <kbd>↵</kbd>) to open a note.
3. **Describe** — type what should change (e.g. _"make this heading bigger"_)
   and **Save**. A numbered dot pins to the element, and the pill count ticks
   up. Repeat across as many pages as you like — marks follow the tab.
4. **Review** — click the count on the pill (or press <kbd>L</kbd>) to open the
   marks panel. Hover a card to highlight its element, click its number to
   scroll to it, edit or delete inline.
5. **Generate** — press <kbd>S</kbd> (or the terminal button), **Copy prompt**,
   and paste it into Claude Code.

Marks are **per tab** and last until the tab (or browser) closes — the toolbar
icon just hides the tool without losing anything, and its badge shows each
tab's mark count.

### Keyboard shortcuts

| Key            | Action                                        |
| -------------- | --------------------------------------------- |
| <kbd>M</kbd>   | Toggle marking                                 |
| <kbd>L</kbd>   | Toggle the marks panel                         |
| <kbd>S</kbd>   | Generate prompt                                |
| <kbd>↑</kbd> <kbd>↓</kbd> | While marking: walk to parent / back to child |
| <kbd>↵</kbd>   | While marking: mark the highlighted element    |
| <kbd>⌘</kbd> <kbd>↵</kbd> | Save the current note              |
| <kbd>Esc</kbd> | Close the topmost thing (note → dialog → marking → panel) |

## What the agent receives

Each mark contributes its page title and URL, a CSS selector, the element
(tag / id / classes + a text snippet), and your instruction — grouped by page.
That's enough for Claude Code to locate the code and make the change without any
extra context from you.

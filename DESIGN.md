# Agent Marker — Design System

Dark, compact, teal-accent theme for an in-page tool overlay. Source of truth:
the Claude Design file "Agent Marker.dc.html". All values below are consumed as
CSS custom properties in `content.js` (defined on the shadow root `:host`).

## Tokens

```yaml
color:
  # surfaces
  bg:            "#0c0d0f"   # page/canvas behind everything
  panel:         "#161719"   # docked panel + mini-bar surface
  card:          "#1e2023"   # mark card
  composer:      "#1a1b1e"   # inline note composer + hover tag label
  neutralBtn:    "#26282b"   # secondary/neutral button, expand button
  # borders
  border:        "#303236"   # panel outline
  borderCard:    "#2c2f33"   # card / control outline
  borderSubtle:  "#34363a"   # composer / clear button outline
  divider:       "#26282b"   # footer top rule
  # text
  text:          "#e7e9ec"   # primary
  textMuted:     "#8b929b"   # secondary (AA on dark surfaces)
  textDim:       "#6c7178"   # labels, counts
  textFaint:     "#5b6068"   # Edit · Delete
  # accent (teal)
  accent:        "#5fe3c8"   # brand teal — active state, primary action
  accentInk:     "#062b24"   # text/icon on top of accent
  tagBg:         "#0f2a25"   # element tag chip background
  tagBorder:     "#1c4c43"   # element tag chip border

font:
  ui:   "'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif"
  mono: "'Geist Mono', ui-monospace, monospace"   # labels, tags, kbd, counts, prompt textarea

radius:
  panel: 14px
  card:  11px
  ctrl:  8px    # buttons
  action: 9px   # footer primary/secondary
  chip:  5px    # tag chip
  kbd:   4px

shadow:
  panel:    "0 24px 60px -20px rgba(0,0,0,0.6)"
  pill:     "0 14px 34px -8px rgba(0,0,0,0.5)"
  composer: "0 12px 30px -8px rgba(0,0,0,0.4)"
  hoverRing: "0 0 0 4px rgba(95,227,200,0.18)"
  dot:      "0 2px 8px rgba(0,0,0,0.45)"

size:
  pillHeight:  44px
  panelWidth:  340px   # marks popover, max-height min(520px, 70dvh)
  dot:         18px    # numbered chip on marked elements
  edgeMargin:  12px    # pill/panel gap to the viewport edge
  snapRadius:  96px    # drop within this distance of a corner → snap to it
```

## Component notes

- **Pill** — the main view: a draggable floating bar (grip · logo · Mark ·
  marks-count · generate-prompt). Drag anywhere that isn't a button; releasing within
  `snapRadius` of a viewport corner sticks it to that corner (survives window
  resizes). Snap animates `left/top` (0.22s), disabled under
  `prefers-reduced-motion`.
- **Marks panel** — popover anchored to the pill (opens toward the free half of
  the viewport), toggled by the count button or `L`. Closes on `Esc` or
  clicking the page while not marking.
- **Mark dots** — 18px accent circles pinned to each marked element on the
  current page, numbered to match the panel list and the generated prompt.
  Clicking one opens its card.
- **Mark button** — outlined accent when idle, filled accent when marking is active.
- **kbd hint** — mono, 10px, `padding:3px 5px`, `radius:4px`. Three tints:
  - on dark: `bg rgba(95,227,200,.14)` / `border rgba(95,227,200,.32)`
  - on accent fill: `bg rgba(6,43,36,.14)` / `border rgba(6,43,36,.22)`
  - on neutral: `bg rgba(255,255,255,.06)` / `border rgba(255,255,255,.1)`
- **Element tag chip** — mono, accent text on `tagBg`/`tagBorder`, angle-bracketed tag (`<h1>`).
- **Hover overlay** — 2px accent outline + `hoverRing`, with a mono tag label
  `tag#id · W×H`. Also shown when hovering a mark card whose element is on the
  current page.

## Keyboard shortcuts

| Key   | Action                                        |
|-------|-----------------------------------------------|
| `M`   | Toggle Mark mode                              |
| `L`   | Toggle the marks panel                        |
| `S`   | Generate prompt                               |
| `↑ ↓` | While marking: walk to parent / back to child |
| `↵`   | While marking: mark the highlighted element   |
| `⌘↵`  | Save note (in composer / card editor)         |
| `Esc` | Close topmost thing: confirm → composer → dialog → card editor → Mark mode → panel |

Global shortcuts (M, S, L) are ignored while typing in a field.

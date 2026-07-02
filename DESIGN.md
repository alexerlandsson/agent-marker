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
  textMuted:     "#9ba1a8"   # secondary
  textDim:       "#6c7178"   # labels, counts
  textFaint:     "#5b6068"   # Edit · Delete
  # accent (teal)
  accent:        "#5fe3c8"   # brand teal — active state, primary action
  accentInk:     "#062b24"   # text/icon on top of accent
  tagBg:         "#0f2a25"   # element tag chip background
  tagBorder:     "#1c4c43"   # element tag chip border

font:
  ui:   "system-ui, -apple-system, 'Segoe UI', sans-serif"
  mono: "'JetBrains Mono', ui-monospace, monospace"   # labels, tags, kbd, counts

radius:
  panel: 14px
  card:  11px
  ctrl:  8px    # buttons
  action: 9px   # footer primary/secondary
  chip:  5px    # tag chip
  kbd:   4px

shadow:
  panel:    "0 24px 60px -20px rgba(0,0,0,0.6)"
  bar:      "0 14px 34px -8px rgba(0,0,0,0.5)"
  composer: "0 12px 30px -8px rgba(0,0,0,0.4)"
  hoverRing: "0 0 0 4px rgba(95,227,200,0.18)"

size:
  panelWidth: 360px
  barHeight:  48px
```

## Component notes

- **Mark button** — outlined accent when idle, filled accent when marking is active.
- **kbd hint** — mono, 10px, `padding:3px 5px`, `radius:4px`. Three tints:
  - on dark: `bg rgba(95,227,200,.14)` / `border rgba(95,227,200,.32)`
  - on accent fill: `bg rgba(6,43,36,.14)` / `border rgba(6,43,36,.22)`
  - on neutral: `bg rgba(255,255,255,.06)` / `border rgba(255,255,255,.1)`
- **Element tag chip** — mono, accent text on `tagBg`/`tagBorder`, angle-bracketed tag (`<h1>`).
- **Hover overlay** — 2px accent outline + `hoverRing`, with a mono tag label `tag#id · W×H`.

## Keyboard shortcuts

| Key   | Action                         |
|-------|--------------------------------|
| `M`   | Toggle Mark mode               |
| `S`   | Send to agent                  |
| `⌘↵`  | Save note (in composer)        |
| `Esc` | Cancel composer / close dialog |

Global shortcuts (M, S) are ignored while typing in a field.

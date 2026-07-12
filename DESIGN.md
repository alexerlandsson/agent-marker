# Agent Marker — Design System

Dark, compact, teal-accent theme for an in-page tool overlay.

## Tokens

```yaml
color:
  # surfaces
  panel:         "#161719"   # pill + marks-panel surface
  card:          "#1e2023"   # mark card, logo chip
  composer:      "#1a1b1e"   # note composer, tooltip, hover tag label
  neutralBtn:    "#26282b"   # secondary/neutral button, page chip
  # borders
  border:        "#303236"   # panel outline
  borderCard:    "#2c2f33"   # card / control / pill outline
  borderSubtle:  "#34363a"   # composer / clear button outline
  divider:       "#26282b"   # footer top rule
  # text
  text:          "#e7e9ec"   # primary
  textMuted:     "#8b929b"   # secondary — the ONLY muted tone; AA (≥4.5:1) on every surface above
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
  panelWidth:  340px   # marks popover; height = min(520px, space between pill and viewport edge)
  dot:         18px    # numbered chip on marked elements
  edgeMargin:  12px    # pill/panel gap to the viewport edge
  snapRadius:  96px    # drop within this distance of a corner → snap to it
```

Colors and the mono font map 1:1 to CSS custom properties on `:host` in
`content.js`; radii, shadows, and sizes are written as literals there — update
both places when changing them.

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
- **Mark button** — muted outline when idle; accent text/border on `tagBg`
  when active. The active state is a **tint, not a fill** — see Accent
  hierarchy below.
- **kbd hint** — mono, 10px, `padding:3px 5px`, `radius:4px`. Three tints:
  - on dark: `bg rgba(95,227,200,.14)` / `border rgba(95,227,200,.32)`
  - on accent fill: `bg rgba(6,43,36,.14)` / `border rgba(6,43,36,.22)`
  - on neutral: `bg rgba(255,255,255,.06)` / `border rgba(255,255,255,.1)`
- **Element tag chip** — mono, accent text on `tagBg`/`tagBorder`, angle-bracketed tag (`<h1>`).
- **Logo chip** — in the panel header, the logo's rounded square uses `card`
  with a `borderCard` hairline (SVG stroke-width 6 ≈ 1px at rendered size), so
  it sits on panel surfaces the same way a mark card does. In the pill the
  logo renders **bare** (glyph + teal underline, no backdrop).
- **Hover overlay** — 2px accent outline + `hoverRing`, with a mono tag label
  `tag#id · W×H`. Also shown when hovering a mark card whose element is on the
  current page.

## Accent hierarchy

The accent **fill** (`accent` bg + `accentInk` text) is reserved for the one
action that commits the current step; everything else uses outlines or tints.

1. Note composer / card editor open → its **Save** owns the fill; the panel's
   **Generate prompt** drops to neutral (`.waiting`) while it waits.
2. Otherwise → **Generate prompt** (panel footer) is the only fill.
3. Confirm overlay → **Clear all** owns the fill (everything else is scrimmed).

Mode state is never a fill: the active Mark button is an accent tint
(`tagBg` + accent border/text). Dots and tag chips use accent as identity,
not as a call to action.

## Motion

All motion sits behind `@media (prefers-reduced-motion: no-preference)` —
reduced-motion users get instant state changes, no overrides needed.

```yaml
easing:
  ease-out: cubic-bezier(0.165, 0.84, 0.44, 1)   # --ease-out (quart) — entrances, snap, press
  hover:    ease                                  # color/bg/border transitions

duration:
  press:    100ms   # button scale(0.97) on :active
  tooltip:  120ms   # fade only
  hover:    150ms   # color transitions
  entrance: 160ms   # panel/popover/composer/confirm — fade + 6px slide + scale(0.98)
  dialog:   200ms   # centered prompt dialog — fade + scale(0.96)
  snap:     200ms   # pill corner snap (left/top transition)
  pulse:    250ms   # count pulse on the pill when a mark is added
  flash:    800ms   # card ring flash when opened from a dot
```

- Entrances animate **away from their anchor** (panel rises when above the
  pill, drops when below; `transform-origin` faces the pill).
- Exits are instant by design — the panel/composer toggle is a
  many-times-per-session action (frequency rule: don't animate what you see
  constantly), and instant dismissal reads as responsiveness.
- The hover highlight and drag tracking never animate — they must follow the
  pointer 1:1.

## Keyboard shortcuts

| Key   | Action                                        |
|-------|-----------------------------------------------|
| `M`   | Toggle Mark mode                              |
| `L`   | Toggle the marks panel                        |
| `S`   | Generate prompt                               |
| `↑ ↓` | While marking: walk to parent / back to child |
| `↵`   | While marking: mark the highlighted element   |
| `⌥↑ ⌥↓` | In composer: retarget note to parent / back to child (also chevron buttons) |
| `⌘↵`  | Save note (in composer / card editor)         |
| `Esc` | Close topmost thing: confirm → composer → dialog → card editor → Mark mode → panel |

Global shortcuts (M, S, L) are ignored while typing in a field.

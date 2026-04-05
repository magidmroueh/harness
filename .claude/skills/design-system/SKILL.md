---
name: design-system
description: Design system rules for building hyper-minimal, editorial UI. Auto-activates when writing React components, JSX, CSS, styling, creating UI, or working with design tokens, typography, colors, layout, animations, or theme.
user-invocable: false
---

# Design System Rules

You are building UI in a design-system-driven codebase. Follow these rules exactly.

## Philosophy

- Content flows flat on the background. No cards, no boxes, no shadows on content sections.
- Generous whitespace between everything.
- Let the typography do the work.
- Subtle interactions. Nothing flashy.

## Critical Rules

- NEVER use cards, boxes, or shadows on content sections. Content sits flat on `--bg`.
- NEVER use colored section backgrounds. Everything on `--bg`.
- NEVER add underlines or blue color to links. Links look like text with opacity on hover.
- ALWAYS use CSS custom properties (design tokens) for colors — never hardcode hex values.
- ALWAYS use generous whitespace. White space is a feature.

## Typography

| Role | Font | Weight | Size | Letter spacing |
|------|------|--------|------|----------------|
| Body / UI | Inter | 400 | 16px | normal |
| Headings (h1, h2) | Inter | 600 | inherit | -0.02em |
| Editorial body | Newsreader (serif) | 400 | 1.125rem / 28px | -0.02em |
| Section titles | Inter | 500 | 0.7rem | 0.12em, uppercase |
| Small UI / labels | Inter | 500 | 0.78rem - 0.875rem | normal |

**Google Fonts import:**

```
Inter:wght@400;500;600
Newsreader:ital,wght@0,400;0,500;1,400
```

**Line height:** 1.65 for body text.

## Color Palette

Use CSS custom properties. NEVER hardcode color values.

### Light mode (default)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#ffffff` | Page background |
| `--text-primary` | `#1c1917` | Headings, names, strong text (stone-900) |
| `--text-secondary` | `#57534e` | Body text, descriptions (stone-600) |
| `--text-muted` | `#a8a29e` | Labels, dates, placeholders (stone-400) |
| `--border` | `#e7e5e4` | Dividers, tag borders (stone-200) |
| `--border-subtle` | `rgba(231,229,228,0.5)` | Nav border, very light separators |
| `--accent` | `#eab308` | Accent color (yellow-500) |
| `--dot-current` | `#16a34a` | Active/current status (green-600) |
| `--dot-past` | `#a8a29e` | Past/inactive status (stone-400) |

### Dark mode

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0c0a09` | Page background (stone-950) |
| `--text-primary` | `#fafaf9` | Headings, strong text (stone-50) |
| `--text-secondary` | `#a8a29e` | Body text (stone-400) |
| `--text-muted` | `#78716c` | Labels, dates (stone-500) |
| `--border` | `#292524` | Dividers (stone-800) |
| `--accent` | `#facc15` | Accent (yellow-400) |
| `--dot-current` | `#4ade80` | Active status (green-400) |
| `--dot-past` | `#78716c` | Past status (stone-500) |

## Layout

- **Max width:** 720px centered (`page-wrap`)
- **Page padding:** `py-16 sm:py-24`
- **Section spacing:** `mb-16` between major sections
- **Mobile:** Single column, everything stacks naturally

## Components

### Section Title

Small uppercase label with bottom border. Used to introduce sections.

```
font: 0.7rem, weight 500, uppercase, letter-spacing 0.12em
color: --text-muted
border-bottom: 1px solid --border
```

### Skill Tag

Transparent pill with subtle border. No background fill.

```
font: 0.78rem, weight 400
border: 1px solid --border
border-radius: 6px
background: transparent
color: --text-secondary
```

### Pill Button

Interactive button with hover lift and icon bounce.

```
border: 1px solid --border
border-radius: 9999px (fully rounded)
background: transparent
color: --text-secondary
```

**Hover:** lifts 3px, text darkens, subtle shadow (`0 4px 12px rgba(0,0,0,0.08)`)
**Active:** slight press-down with `scale(0.97)`
**Icon:** bounces on hover (500ms spring animation)

### Timeline Dot

8px circle indicating role status.

- **Current:** green with glow ring (`box-shadow: 0 0 0 3px` at 20% opacity)
- **Past:** muted stone color

## Animations

| Name | Usage | Duration | Easing |
|------|-------|----------|--------|
| `fade-in` | Page entrance | 600ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `word-in` | Landing page word reveal | 400ms per word, 80ms stagger | ease |
| `popup-slide-up` | Floating popup entrance | 500ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `icon-bounce` | Icon hover on links/pills | 500ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| `pill:hover` | Button lift | 200ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` |

## Interactions

- **Links:** No underline. Same color as body text. Opacity 0.65 on hover.
- **Phone number:** Masked as "+49 *** ***", reveals on hover with opacity crossfade (300ms).
- **External links:** Icon bounces on hover.
- **Pill buttons:** Lift + shadow on hover, press on active.

## Navigation

Sticky top bar:

- **Left:** Site name (font-semibold, tracking-tight)
- **Center:** Nav links (active = `--text-primary`, inactive = `--text-muted`)
- **Right:** Action pills + theme toggle
- **Mobile:** Hamburger menu with dropdown
- **Landing page:** No nav header

## Design Rules

1. **No cards or boxes.** Content sits flat on the background.
2. **No colored section backgrounds.** Everything on `--bg`.
3. **No shadows on content.** Only on floating elements (popups, pills on hover).
4. **Borders are thin and subtle.** 1px, `--border` color. Used sparingly for section dividers.
5. **Links look like text.** No blue, no underlines. Just opacity on hover.
6. **White space is a feature.** Generous gaps between sections. Don't compress.
7. **Print-friendly.** All interactive elements hidden. Full contact info shown. ATS-compatible structure.

## Theme Toggle

Two modes: light and dark. Light is default.

- Persisted in `localStorage` under key `theme`
- Applied via `data-theme` attribute on `<html>`

## Print / PDF

- **Hide:** navigation, theme toggle, animations, pill buttons
- **Show:** full phone number, full URLs (LinkedIn, GitHub, Substack)
- **Page:** A4, 12mm/14mm margins
- **Font size:** 11px base for print
- **ATS route** (`/ats`) renders bullet points with same visual design

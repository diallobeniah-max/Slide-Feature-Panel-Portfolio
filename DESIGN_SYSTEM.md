# Flow Shared Layout System

This file defines the shared layout and visual standards for the Flow app and website. The Tools page is the reference surface: its main horizontal content area is the default page width for every panel.

## Layout

- Main page max-width: `1408px` / `88rem`
- Page width rule: `width: min(100% - 48px, 1408px); margin-inline: auto`
- Desktop page padding: `24px` left/right, `24px` top/bottom
- Tablet page padding: `20px` left/right, `20px` top/bottom
- Mobile page padding: `16px` left/right, `16px` top/bottom
- Large content gap: `24px`
- Standard panel gap: `20px`
- Compact control gap: `8px`

All pages should align to the same `1408px` content container on large displays. On tablets, pages keep the same centered container behavior with reduced side padding. On mobile, layouts collapse to one column with no horizontal overflow.

## Typography

- Font family: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Page title: `28px`, `900` weight, tight line height
- Section title: `20px`, `900` weight
- Card title: `16px`, `900` weight
- Body text: `14px`, `600` weight where UI labels need strength
- Supporting text: `13px`, `600` weight
- Eyebrow labels: `10px`, `900` weight, uppercase, `0.08em` letter spacing
- Button text: `14px`, `800` weight

## Radius

- Page hero/toolbox card radius: `28px`
- Standard card/panel radius: `24px`
- Nested control group radius: `18px`
- Button radius: `18px`
- Small chip/badge radius: `10px`
- Icon button radius: `16px`

## Buttons

The Tools page `Import Files` button is the default action button model.

- Main button height: `56px`
- Compact button height: `44px`
- Icon button size: `40px`
- Main button padding: `0 24px`
- Compact button padding: `0 16px`
- Button gap: `10px`
- Button border radius: `18px`
- Button shape: rounded rectangle, never pill unless the control is a chip/filter
- Primary button background: Pumpkin Spice gradient from `--pumpkin-500` to `--pumpkin-700`
- Secondary button background: `--flow-soft`
- Disabled opacity: `0.40`
- Hover motion: translate up `-1px`, brighten or deepen shadow
- Active motion: scale to `0.97`

## Color Tokens

Pumpkin Spice palette:

- `--pumpkin-50`: `#fff1e5`
- `--pumpkin-100`: `#ffe2cc`
- `--pumpkin-200`: `#ffc599`
- `--pumpkin-300`: `#ffa866`
- `--pumpkin-400`: `#ff8b33`
- `--pumpkin-500`: `#ff6e00`
- `--pumpkin-600`: `#cc5800`
- `--pumpkin-700`: `#994200`
- `--pumpkin-800`: `#662c00`
- `--pumpkin-900`: `#331600`
- `--pumpkin-950`: `#240f00`

Light mode:

- App background: `#fff7ef`
- Elevated background: `#fffaf5`
- Card: `rgba(255, 250, 245, 0.94)`
- Strong card: `#ffffff`
- Input: `rgba(255, 255, 255, 0.78)`
- Soft surface: `rgba(255, 226, 204, 0.48)`
- Strong soft surface: `rgba(255, 197, 153, 0.58)`
- Border: `rgba(204, 88, 0, 0.16)`
- Strong border: `rgba(204, 88, 0, 0.34)`
- Text: `#211308`
- Muted text: `rgba(51, 22, 0, 0.68)`
- Faint text: `rgba(51, 22, 0, 0.42)`

Dark mode:

- App background: `#1f1209`
- Elevated background: `#2a1609`
- Card: `rgba(51, 22, 0, 0.82)`
- Strong card: `rgba(102, 44, 0, 0.52)`
- Input: `rgba(36, 15, 0, 0.72)`
- Soft surface: `rgba(255, 139, 51, 0.11)`
- Strong soft surface: `rgba(255, 139, 51, 0.18)`
- Border: `rgba(255, 168, 102, 0.18)`
- Strong border: `rgba(255, 168, 102, 0.38)`
- Text: `#fff1e5`
- Muted text: `rgba(255, 226, 204, 0.72)`
- Faint text: `rgba(255, 226, 204, 0.46)`

## Component Standards

- Cards use `24px` radius, `--flow-card` background, `--flow-border` border, and a soft `--flow-shadow`.
- Hero/toolbox panels use `28px` radius and can use stronger shadow for hierarchy.
- Inputs use `18px` radius, `--flow-input`, `--flow-border`, and pumpkin focus ring.
- Settings panels should use slightly tinted selected/open states so active sections are easy to scan.
- Settings quick navigation should use a pumpkin surface or gradient so it does not disappear into light backgrounds.
- Empty states should use dashed borders, clear action text, and enough height to feel intentional.
- Interactive controls must have hover, active, disabled, and keyboard focus states.

## Responsive Rules

- Desktop `>= 1280px`: use the `1408px` page container, two-column layouts where useful, and full action rows.
- Tablet `768px - 1279px`: keep the same max-width rule, reduce page padding to `20px`, allow cards to stack if columns feel cramped.
- Mobile `< 768px`: use `16px` page padding, single-column panels, horizontally scroll long nav rows, and keep buttons at least `48px` tall.
- No page should rely on a custom horizontal width unless there is a clear fullscreen media or canvas reason.

## Motion

- Hover transitions: `150ms - 250ms`
- Button press feedback: `100ms - 180ms`
- Panel/dropdown transitions: `200ms - 350ms`
- Page/section entrance: `300ms - 600ms`
- Preferred properties: `opacity`, `transform`, `box-shadow`, `background-color`, `border-color`
- Always respect `prefers-reduced-motion`.

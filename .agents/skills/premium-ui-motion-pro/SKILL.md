---
name: premium-ui-motion-pro
description: Use for frontend UI, websites, dashboards, landing pages, components, layouts, buttons, cards, modals, forms, navigation, text sections, empty states, loading states, hover states, page transitions, visual polish, or any interface work that should feel smooth, modern, animated, responsive, premium, professional, accessible, and fast.
---

# Premium UI Motion Pro

Use this skill whenever improving or building frontend interface work. Make the UI feel smooth, modern, alive, responsive, premium, and professional through tasteful animation, transitions, micro-interactions, and state feedback. Use motion to clarify state and guide attention, not to decorate randomly.

## Inspect The Stack First

Before adding animation code, inspect the project stack and existing patterns:

- React, Next.js, Vite, or plain HTML/CSS/JS
- Tailwind CSS, CSS modules, plain CSS, or a component library
- Framer Motion or another existing animation helper
- Existing motion utilities, keyframes, transitions, or shared components

Use the project's existing animation approach first. Do not add a new animation dependency unless the project already uses it or there is a clear, justified need.

## Motion Must Improve UX

Use animation where it makes the interface clearer, faster-feeling, or more responsive:

- Page and section entrances
- Hero sections and important text
- Buttons, cards, boxes, and panels
- Forms, input fields, validation, and feedback
- Modals, popups, dropdowns, menus, sidebars, and tabs
- Tables, dashboard widgets, stat cards, and charts
- Empty, loading, error, and success states
- Hover states, click/tap feedback, and active navigation
- Toasts, notifications, icons, and progress indicators
- Route or page transitions when they help and do not hurt performance

Avoid motion that is childish, slow, distracting, random, overly bouncy, overdramatic, noisy, heavy, laggy, or unnecessary.

## Motion Style

Motion should feel premium, smooth, clean, modern, light, fast, natural, professional, confident, and elegant. Treat Apple-like smoothness, Stripe-like polish, Linear-like clarity, and high-end SaaS/product motion as quality references only. Do not copy any brand directly.

Default useful effects:

- Fade in, fade up, slide up
- Subtle scale or lift on hover
- Smooth color, border, and shadow transitions
- Button press/tap feedback
- Input focus glow or border transition
- Modal fade plus scale entrance
- Dropdown fade plus slide entrance
- Skeleton loading states
- Smooth page or section reveal where useful
- Subtle icon movement
- Toast entrance and exit
- Staggered animation for grouped items
- Smooth state changes
- Small loading spinners or progress indicators for async actions

## Important Screens

For landing pages, dashboards, auth pages, onboarding pages, pricing pages, and important product screens, apply a more complete motion system:

- Stagger the hero heading, subtitle, CTA, and supporting visual.
- Add gentle section reveal as the user scrolls.
- Add hover lift and shadow polish to feature cards.
- Add active press states to buttons.
- Add smooth transitions between loading, empty, error, and success states.
- Add subtle icon motion where it communicates meaning.
- Add polished modal and dropdown opening and closing.
- Add skeleton loaders instead of blank waiting areas.
- Add route/page transitions only when they do not hurt performance or accessibility.
- Keep motion consistent rather than scattered.

## Timing And Easing

Use short, responsive timing:

- Hover transitions: 150ms-250ms
- Button click feedback: 100ms-180ms
- Modal/dropdown entrance: 200ms-350ms
- Page/section entrance: 300ms-600ms
- Stagger delay: 40ms-100ms per item

Prefer `ease-out`, `ease-in-out`, or a restrained cubic-bezier when premium motion needs more character. Motion should feel quick and responsive.

## Buttons

All buttons should feel interactive:

- Hover effect
- Active/click effect
- Disabled state
- Smooth transition
- Slight scale, brightness, background, border, or shadow change
- Loading state for async work
- Success/error feedback where useful

On hover, lift, brighten, or deepen shadow slightly. On click/tap, press down subtly. On loading, show a spinner, loading text, or disabled loading state.

## Text

For hero sections, headings, and important content:

- Use subtle fade-up entrance.
- Stagger heading, subtitle, and CTA.
- Do not animate every paragraph unnecessarily.
- Keep text readable and stable.
- Avoid typing effects unless explicitly requested.

## Cards And Panels

For cards, panels, containers, and boxes:

- Add hover lift where useful.
- Add soft shadow transition.
- Add border/background transition.
- Add smooth entrance animation.
- Use subtle scale only when it does not disturb layout.
- Keep spacing and layout stable.

## Forms And Inputs

Forms should have smooth focus states, clear animated errors, encouraging success states, submit loading feedback, and no sudden layout jumps. Preserve labels, validation, keyboard navigation, and accessibility.

## Modals, Dropdowns, And Menus

Overlays and menus should animate in and out with fade plus scale or fade plus slide. Backdrops should fade. Closing should be quick. Preserve focus handling, escape-to-close behavior, keyboard navigation, roles, and accessibility.

## Loading States

Never leave users staring at frozen UI. Use skeleton loaders, spinners, progress indicators, button-level loading states, and helpful empty states.

## Accessibility

Always respect `prefers-reduced-motion`.

If reduced motion is enabled:

- Disable large movement.
- Keep only simple fades where useful.
- Avoid parallax, bouncing, repeated movement, and aggressive scroll animation.

Animations must not break keyboard navigation, screen readers, form labels, focus states, semantic HTML, accessibility roles, or reduced motion settings.

## Performance

Keep animation lightweight. Prefer animating:

- `opacity`
- `transform`
- `scale`
- `translate`

Avoid animating expensive properties:

- `width`
- `height`
- `top`
- `left`
- `margin`
- `padding`

Do not add heavy animation libraries unless the project already uses one or the benefit is clear.

## Framework Guidance

For React, Next.js, or Vite:

- Use CSS transitions for simple interactions.
- Use Tailwind transition utilities when Tailwind is already used.
- Use Framer Motion only if the project already uses it or richer motion is genuinely needed.
- Keep animation components clean and reusable.
- Create shared motion helpers or tokens if many components need the same behavior.

For plain HTML/CSS/JS:

- Use CSS transitions and keyframes.
- Use JavaScript only when state-based animation needs it.

## Design Consistency

Avoid random one-off animations. Create consistent motion tokens or utilities where possible. Reuse timing, easing, and animation patterns. The motion language should feel designed, not patched.

## Visual Quality Checklist

Before finishing frontend/UI work, check:

- Do buttons feel clickable?
- Do cards feel polished?
- Do modals open smoothly?
- Do dropdowns feel natural?
- Do forms give clear feedback?
- Does the page feel modern?
- Are animations consistent?
- Is the motion subtle and not annoying?
- Does it work on mobile?
- Does it respect reduced motion?
- Does it remain fast?
- Did you avoid unnecessary dependencies?
- Did you preserve accessibility?

## Final Rule

Do not leave interface work static or lifeless. Add tasteful, useful, smooth animation by default while keeping the product clean, professional, fast, and accessible.

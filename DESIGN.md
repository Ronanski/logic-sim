# LogicSim — Design Rules

These rules apply to **every** future change to LogicSim. Do not deviate.

## Components
- shadcn/ui components only. Build new UI by composing or customizing shadcn variants — never ad-hoc styled elements.

## Theme
- Dark industrial dashboard style. The app is dark-only; no light mode, no theme toggle.
- Exactly **one** accent color: blue `oklch(0.62 0.19 258)` (`--primary` / `--ring`).
- All other colors are neutral grays (chroma ≤ 0.01). No other hues.
- Flat surfaces and 1px borders. **No gradients** anywhere.

## Typography
- Inter only, weights 400 / 500 / 600 / 700. Loaded via `<link>` in `src/routes/__root.tsx`.
- Headings `font-semibold`, body `text-sm` is the default size.

## Spacing
- 8px grid: Tailwind steps that are multiples of 2 only (`p-2`, `p-4`, `p-6`, `gap-2`, `gap-4`, `gap-6`, `h-14`…). No odd spacing values.
- Page padding: `p-6`. Section gaps: `gap-6`. Control gaps: `gap-2`.

## Corners
- `rounded-md` everywhere (global `--radius: 0.375rem`). No `rounded-full` except dots/avatars.

## Motion
- **No decorative animations.** Functional transitions only (hover/focus/disabled states), ≤ 150ms.

## Tokens
- All colors come from semantic tokens in `src/styles.css`. Never hardcode colors (`bg-[#...]`, `text-white`, `bg-black`) in components.

## Layout shell
- Top bar (`h-14`): sidebar trigger + app name "LogicSim".
- Left sidebar (shadcn Sidebar, collapsible to icons): Import, Review, Simulate, Settings.
- Main area: one route per section.


## Exception: paper canvas (approved)
- The Simulate logic canvas (and only the canvas) is light, like the printed drawing: thin dark wires and outlines on a white "paper" background. Everything else (app shell, drawers, toolbar) stays dark.
- It is implemented as a `.paper` token scope in `src/styles.css` that redefines the same neutral-gray tokens (chroma <= 0.01). The single blue accent is unchanged. Components still use semantic tokens only; no hardcoded colors.

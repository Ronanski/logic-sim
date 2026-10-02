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
## Imported DCS geometry rules
- For imported DXF sheets, preserve the original drawing coordinate relationships. Imported node placement must be derived from DXF geometry, not a generic left-to-right auto-layout.
- Common signals must render as a shared wire trunk/net with explicit junction dots at branch/merge points. Do not duplicate the same physical wire path on top of itself.
- Logic-gate ports are anchored to detected DXF contact points. Any ReactFlow handle or short bridge is an adapter to the native path, not a replacement for it.
- Wires must remain visible regardless of cursor hover. Hover/selection may highlight a net but must not hide, fade out, or remove the underlying path.
- Live signal state is shown with a red wire highlight plus the existing animated dash/flow treatment; static wires remain neutral.
- The DITL-00 DXF in `public/symbol-library/` is the canonical reference source for native DCS symbol geometry.
- Regression sheets: DITL-02, DITL-03A, DITL-13.
### V7 — physical-net geometry / backend DXF parsing

- DXF imports are parsed server-side through the TanStack Start server function. The DXF browser batch path must not rebuild geometry client-side.
- The parser outputs physical DXF wire nets (`netPaths`) and logical-edge-to-net mapping (`edgeNets`) so a shared trunk/branch is rendered once, with real junction points (`netJunctions`).
- ReactFlow is a view of parser geometry, not a layout engine for imported sheets. Node positions and port Y coordinates are derived from the same DXF coordinate transform used for native wire geometry.
- Recognized timer symbols use their actual parsed DXF geometry; timers are never synthesized at the input row.
- A* / routeEdges is fallback only for non-native synthetic edges.
- Regression set: DITL-02, DITL-03A, DITL-13.

### V7.1 — native port fidelity and backend-generated placement

- Imported DXF node placement, port anchors, and physical wire paths must originate from the same backend DXF coordinate system.
- Native port coordinates are not clamped to the symbol box. A multi-input OR can expose input handles far above/below its small visible symbol because the real receiving trunk is the physical connection point.
- The renderer must place each ReactFlow handle at the backend-provided native port coordinate. It must not redistribute inputs evenly.
- Timer blocks may infer a connection to a labelled sheet I/O row only when the native DXF contains the symbol/row geometry within the configured tolerance. This is a generic geometry rule, not a per-diagram coordinate exception.
- Unlabelled free wire endpoints must not become visible input/output cards.
- A shared physical net is drawn once with junction dots; logical edges remain for simulation and tracing.
- Live state is calculated per physical net so one active branch makes the shared native wire red and animated.

### V7.2 — exact symbol frame and port anchoring
- Native imported logic symbols must be placed from the backend-transformed DXF bounding-box origin. The detected node center may be used only as fallback when no native bounds exist.
- Port X is anchored to the detected symbol boundary. Physical wire contact Y remains authoritative for multi-input/branch layouts.
- If a real DXF conductor stops within the parser tolerance before a symbol boundary, generate a short orthogonal backend bridge so the rendered wire visibly reaches the symbol. This bridge is geometry-derived, not diagram-specific.
- Do not solve native-sheet placement by fixed coordinates, per-sheet offsets, or hardcoded gate positions.
- Native symbol dimensions are allowed to remain small when the DXF symbol is small; do not stretch NOT/AND/OR blocks to a generic minimum that changes the drawing.
- Native symbol bounds should use the detected symbol extents without artificial padding; visual spacing must come from the actual drawing, not a hidden safety margin.
- Keep parsing/topology tolerance separate from visual geometry: a small internal wire-filtering pad is allowed, but native rendering bounds must remain the exact detected symbol extents.


## Geometry architecture — V7.3
- Native DXF `edgePaths` produced by the parser are the canonical physical route data.
- The UI renders/bundles those paths; ReactFlow/A* is fallback only for edges without a native path.
- Do not add a second SVG `netPaths` coordinate system or re-transform native wires in the renderer.
- Shared source nets are visually bundled with junction points from the native edge paths; logical edges remain independent for simulation.
- Keep node positions derived from the same DXF coordinate transform as the native edge endpoints.
- Regression drawings: DITL-02, DITL-03A, DITL-13.

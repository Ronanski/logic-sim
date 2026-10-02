<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# LogicSim workflow rules
- Design system rules in DESIGN.md apply to every change; never hardcode colors or add gradients/decorative animations.
- Update PROJECT_NOTES.md (Done / Next) after every change.
- Keep DESIGN.md and AGENTS.md aligned whenever a geometry, rendering, parser, or simulation architecture rule changes.
- For DXF imports, treat native drawing coordinates, wire segments, junctions and detected symbol terminals as authoritative. Avoid replacing them with a generic auto-layout or fresh routing unless native geometry is unavailable.
- Use DITL-00 as the canonical symbol-geometry reference and validate changes against DITL-02, DITL-03A and DITL-13.
- Never allow hover/selection state to make an existing wire disappear.
- Live wires use the red active-state highlight while retaining animated dash/flow behavior.

- Drawing parsing goes through a single server function `parseDrawing(file)` that reads PARSER_API_URL inside the handler and falls back to a mock graph; keeps the secret server-side and the UI working without a parser.

- Graph JSON imports are converted client-side by `convertGraphJson` in src/lib/import/graph-json.ts into the internal LogicGraph (port ids remapped to engine conventions); needsReview items are advisory so they never block Simulate.
- Keep Simulate canvas-first: controls belong in the slim toolbar and inspectors belong in overlay drawers so the graph retains the full workspace.
### V7 — physical-net geometry / backend DXF parsing

- DXF imports are parsed server-side through the TanStack Start server function. The DXF browser batch path must not rebuild geometry client-side.
- The parser outputs physical DXF wire nets (`netPaths`) and logical-edge-to-net mapping (`edgeNets`) so a shared trunk/branch is rendered once, with real junction points (`netJunctions`).
- ReactFlow is a view of parser geometry, not a layout engine for imported sheets. Node positions and port Y coordinates are derived from the same DXF coordinate transform used for native wire geometry.
- Recognized timer symbols use their actual parsed DXF geometry; timers are never synthesized at the input row.
- A* / routeEdges is fallback only for non-native synthetic edges.
- Regression set: DITL-02, DITL-03A, DITL-13.

### V7.1 geometry acceptance rules
- Treat `DITL-03A` as the primary end-to-end geometry test. Do not tune it using sheet-specific coordinates. Fix the generic DXF geometry algorithm instead.
- Never redistribute multi-input gate ports evenly when the parser has native contact coordinates. Preserve the actual DXF Y positions, including values outside the visible symbol box for shared receiving trunks.
- Never create terminal cards from an unlabelled free wire stub.
- For directly touching timer symbols, derive the missing row connection from the nearest labelled I/O row and configured geometry tolerance; never synthesize a fixed timer location.
- Keep DXF parsing and coordinate reconstruction on the server; the browser is a renderer/simulator.
- Every code change in parser/geometry/rendering must update `PROJECT_NOTES.md`, `DESIGN.md`, and `AGENTS.md`.

### V7.2 geometry rules
- `geometry.bounds` from the DXF parser is the authoritative rectangle for imported symbol placement.
- Do not position imported gates from a hardcoded center offset when native bounds are available.
- Gate port X must use the parser's detected symbol boundary; port Y must preserve the real wire/contact Y.
- Small conductor-to-symbol gaps may be bridged by backend-generated orthogonal segments derived from the detected contact and symbol boundary.
- Keep the primary target generic: DITL-03A is a regression/acceptance case, not a source of sheet-specific coordinates.
- Every parser/geometry/rendering change must update `PROJECT_NOTES.md`, `DESIGN.md`, and `AGENTS.md`.
- Do not add generic bbox padding to native symbols when it creates visible overlap with adjacent I/O cards. Preserve the detected DXF extents.
- Do not let visual native-bounds changes alter wire-topology classification; keep any small wire-filtering tolerance internal to the parser and render from exact native bounds.


## Geometry architecture — V7.3
- Native DXF `edgePaths` produced by the parser are the canonical physical route data.
- The UI renders/bundles those paths; ReactFlow/A* is fallback only for edges without a native path.
- Do not add a second SVG `netPaths` coordinate system or re-transform native wires in the renderer.
- Shared source nets are visually bundled with junction points from the native edge paths; logical edges remain independent for simulation.
- Keep node positions derived from the same DXF coordinate transform as the native edge endpoints.
- Regression drawings: DITL-02, DITL-03A, DITL-13.


### DXF geometry invariant
Do not add schema constraints that reject valid native port coordinates merely because they fall outside 0..1. The parser preserves source drawing geometry; shared receiving trunks can place a logical port outside the compact symbol body. Keep validation and type definitions aligned with this invariant.

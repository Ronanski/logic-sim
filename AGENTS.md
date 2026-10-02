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


## V8 Stable Geometry Baseline
- Geometry changes are allowed only when they preserve the existing native DXF edge-path pipeline.
- Do not introduce a parallel net/routing representation for imported wires.
- Validate `DITL-03A` after every geometry change before touching other sheets.

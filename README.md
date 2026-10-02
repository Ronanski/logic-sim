# LogicSim Dashboard

Create a web app called "LogicSim": a tool for importing engineering drawings, reconstructing native DCS control logic, and simulating the resulting graph.

DESIGN RULES (save in DESIGN.md and follow in every future change):

- shadcn/ui components only

- Dark industrial dashboard style, one blue accent color, neutral grays

- Inter font, 8px spacing, rounded-md corners

- Clean and minimal, no gradients, no decorative animations

PROJECT NOTES: create PROJECT_NOTES.md tracking what is done and what is next. Update it after every change.

LAYOUT: top bar with app name, left sidebar (Import, Review, Simulate), main area. Only Simulate has content for now.

DXF parsing and geometry reconstruction are backend-authoritative. Authentication is not implemented.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cc0bb960-d599-4f92-b43c-dd2538059fbb).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
## Current DXF import status
- DXF uploads are parsed on the TanStack Start server and returned as an authoritative graph + physical geometry payload.
- The parser preserves native DXF wire nets (`netPaths`), logical-edge mapping (`edgeNets`), junction dots (`netJunctions`), native symbol bounds, and native port coordinates.
- Multi-input gate handles use the actual DXF receiving-trunk coordinates; they are not evenly redistributed.
- Timers are recognized from both named delay symbols and `TRxxx` + preset geometry patterns when present.
- `DITL-00.dxf` is bundled as the canonical symbol reference source.
- Primary geometry acceptance: DITL-03A. Regression: DITL-02 and DITL-13.
- A* / routeEdges is fallback only for edges without native physical geometry.
- The Simulate canvas uses the paper-style presentation while the application shell remains dark.

### V7.1 — native port fidelity
- Native port X/Y values are allowed outside the visible symbol box when the DCS drawing uses a shared receiving trunk.
- Labelled I/O rows directly touching timer symbols are inferred from geometry/tolerance without diagram-specific coordinates.
- Unlabelled free wire stubs are not rendered as terminal cards.
- Live physical nets animate red when any logical edge on the net is active.

### V7.2 native geometry fidelity
- Imported DXF symbols carry backend-derived native bounds and ports.
- The renderer anchors symbols from native DXF bounds and renders physical nets from backend geometry; it does not reposition native gates with hardcoded sheet coordinates.
- Small detected gaps between a wire endpoint and symbol boundary are closed by a backend-generated orthogonal bridge.
- Regression sheets: DITL-02, DITL-03A, DITL-13.
- Native symbol bounds are unpadded detected DXF extents so adjacent terminal cards do not overlap the symbol frame.
- Parser topology may keep a small internal filtering tolerance, but the returned native symbol bounds used for placement are exact detected extents.


## Geometry architecture — V7.3
- Native DXF `edgePaths` produced by the parser are the canonical physical route data.
- The UI renders/bundles those paths; ReactFlow/A* is fallback only for edges without a native path.
- Do not add a second SVG `netPaths` coordinate system or re-transform native wires in the renderer.
- Shared source nets are visually bundled with junction points from the native edge paths; logical edges remain independent for simulation.
- Keep node positions derived from the same DXF coordinate transform as the native edge endpoints.
- Regression drawings: DITL-02, DITL-03A, DITL-13.

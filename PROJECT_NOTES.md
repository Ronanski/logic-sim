# LogicSim — Project Notes

Purpose: import engineering drawings and simulate control logic.
Current phase: **foundation only** — no backend, no authentication.

Update this file after every change.

## Done
- [x] 2026-10-01 — Design system defined (`DESIGN.md`, dark industrial tokens in `src/styles.css`)
- [x] 2026-10-01 — App shell: top bar + left sidebar (Import, Review, Simulate) + main area
- [x] 2026-10-01 — Simulate page: toolbar (Run / Step / Reset, disabled), empty canvas, signal monitor placeholder
- [x] 2026-10-01 — Import and Review placeholder pages
- [x] 2026-10-01 — Logic graph format (`src/lib/logic-graph/types.ts`): nodes (id, tag, type, params, ports, confidence, needsReview) + edges (from/to node+port)
- [x] 2026-10-01 — 3 mock samples: Interlock (2 DI → AND → motor), Start/stop SR latch + 5 s TON, Tank level PID
- [x] 2026-10-01 — Simulate: React Flow canvas, sample dropdown, node params side panel (edits in memory)
- [x] 2026-10-01 — Simulation engine & Web Worker (`src/lib/logic-graph/engine.ts`, `src/lib/logic-graph/simulation-worker.ts`):
  - Topological sort with feedback loop detection (Tarjan's algorithm, warning generation, 1-scan delay)
  - 100 ms scan cycle (read inputs -> evaluate blocks -> write outputs)
  - Core blocks: AND, OR, NOT, SR latch, TON on-delay timer, Comparator, PID controller
  - Full unit test suite (`src/lib/logic-graph/__tests__/engine.test.ts`) covering all blocks, loop detection, and scan cycles
- [x] 2026-10-01 — Simulate UI connected to simulation engine:
  - Run, Pause, Step, and Reset controls with live cycle counter and status badges
  - Input Force & Override panel (switches for digital inputs, sliders for analog setpoints)
  - Active wire highlighting in accent color (`var(--primary)`) with smooth animated pulse
  - Live signal monitor & trend chart (`recharts`) tracking up to 50 cycles with selectable signal traces
  - Dynamic closed-loop tank level model for Tank Level PID sample (valve modulates inflow against natural outflow)
- [x] 2026-10-01 — Symbol library (`src/lib/symbol-library/`): JSON defaults mapping block names, layer names and keywords (AND, PID, TON, FIC…) to block types; rule-based resolver (priority, then block > layer > keyword); edits saved in browser storage
- [x] 2026-10-01 — Settings page: view/filter, add, edit, delete mappings, raw JSON edit, reset defaults, test lookup
- [x] 2026-10-01 — Server: interrupted page loads (browser closed the connection) are no longer reported as crashes
- [x] 2026-10-01 — Review queue (`src/lib/review/review-store.ts`, `/review`): mock import with flagged nodes/edges (unknown symbol, floating line, ambiguous text), list + canvas highlight, approve / reassign type / delete, remaining count; Simulate blocked while items are open, with override
- [x] 2026-10-01 — Import screen: drag-and-drop / file picker for .dxf, .dwg, .pdf (20 MB limit, clear errors), status steps (uploading, converting, parsing, done, failed); `parseDrawing(file)` posts to `PARSER_API_URL` or returns a mock graph when unset; result loads into Review
- [x] 2026-10-01 — Import: "Load graph JSON" (upload .json or paste) for `{nodes, edges}` graphs (`src/lib/import/graph-json.ts`):
  - AND/OR/NOT kept; SR_LATCH -> SR latch (S, R -> Q); TIMER -> TP pulse timer with editable `durationSec`; signal role input -> forceable input toggle, role output -> lamp
  - Labels show tag + description only; CJK / non-English characters are stripped
  - Left-to-right layout (inputs, gates by depth, outputs); needsReview nodes show a warning icon and are listed in Review with type and parameter editing; they never block Simulate
  - Sample DITL-03A is the default graph; Simulate shows an Outputs lamp panel for imported graphs
  - Tests (`src/lib/import/__tests__/graph-json.test.ts`): each of the 18 OR inputs sets the latch, turns MFT outputs on and NO BOILER TRIP COMMAND off
- [x] 2026-10-01 — Simulate redesigned as a full-viewport canvas workspace with collapsible input, output/parameter, and signal-monitor drawers plus fit-view and fullscreen controls
- [x] 2026-10-02 — Browser DXF import (no Python, no server): `src/lib/import/dxf-parser.ts` (TypeScript port of the parser) + `dxf-batch.ts`; Import accepts many .dxf at once, shows per-file counts, parser report and a `check` / `ok` badge, and "Open" loads a sheet into Review (a single file opens Review automatically). .dwg / .pdf still go through `parseDrawing`
- [x] 2026-10-02 — Timers: graph JSON `TON` / `TOF` / `TP` map to their own engine blocks (TIMER stays TP); new `TOF` off-delay block in the engine; TON also reads `durationSec`; parser maps `PULSE DELAY` to TP (seen on DITL-13)
- [x] 2026-10-02 — Unknown node types in graph JSON are flagged `needsReview` (low confidence) instead of silently becoming AND
- [x] 2026-10-02 — Tests: `src/lib/import/__tests__/dxf-import.test.ts` (fixtures: DITL-03A, 03B, 13 DXF): 03B = 5 inputs, AND -> TON 60 s, 16 outputs, no report lines
- [x] 2026-10-02 — Imported DXF layout follows the sheet: parser now outputs each node's drawing position; vertical order/rows come from the drawing (overlaps pushed down), inputs/outputs are compact 56 px boxes, column spacing 340 px, wire channels spread (`pathOptions.offset`) so parallel wires are traceable
- [x] 2026-10-02 — Wire routing: orthogonal A* router (`src/lib/logic-graph/route-edges.ts`) avoids node boxes, minimises bends, keeps different nets apart and lets wires from one output share a bus; `RouteManager` routes after nodes are measured and again 250 ms after a node is dragged; `RoutedEdge` draws the path (falls back to a step wire while a route is stale); tests in `route-edges.test.ts`
- [x] 2026-10-02 — Readability pass on Simulate: logic blocks are compact (type + only the ports that matter, timer value shown as "60 s"; tag only when it differs from the type; confidence footer removed); input/output boxes show tag, address and description in one 44 px box; inputs have a switch and outputs a lamp right on the canvas; text is 11–12 px; empty vertical bands in the sheet are shortened; column spacing follows real box widths; canvas min zoom 0.1 so the whole sheet fits; Fit view keeps the logic clear of open drawers; drawers start closed (Inputs/Outputs buttons still open them)
- [x] 2026-10-02 — Simulate readability + max view: app sidebar auto-collapses on Simulate (restored on leave); new Focus mode button (Esc exits) hides the app sidebar and top bar and closes drawers; canvas auto-fits when its size changes (sidebar, header, window, fullscreen); labels, ports and handles scale up as the sheet is zoomed out (never below normal size); wires keep a constant on-screen thickness (`vector-effect: non-scaling-stroke`); floating status badge removed (review count now in the toolbar)
- [x] 2026-10-02 — Full text on terminals + logic gate symbols: input/output boxes are 320 px wide, wrap the tag and the whole description (no more `truncate`) and grow in height to fit (`terminalHeight` in `graph-json.ts`; text scales with zoom-out up to 1.25x); sheet row spacing `DRAW_SCALE` 6 -> 9 so taller boxes stay aligned with the drawing; AND / OR / NOT are drawn as gate symbols (SVG, theme tokens only) with inputs spread evenly on the left (about 66 px per input so wires run straight in; an 18-input OR is tall like the sheet's bar) and the output on the middle right; checked with the app's own DXF parser, layout and router on DITL-03A / 03B / 13: no wire crosses a node and no two nets run on top of each other; set `SHOW_GATE_SYMBOLS = false` in `graph-json.ts` to go back to plain boxes; SR and timers stay boxes
- [x] 2026-10-02 — Table-row layout for DXF sheets: parser now also reads each terminal's sheet row (`rowNo`, `from`, `loc`, `to`; row numbers from the CON layer, LOCATION/TO split by column x). Inputs/outputs are one fixed 28 px table row (FROM | LOC | NO. | SERVICE | switch, and lamp | SERVICE | ADDR | NO. | LOC | TO) instead of tall wrapped boxes; terminals snap to the sheet row grid (`ROW_H` = 28 px per 9 drawing units, no gap between rows) so left row N and right row N+50 share the same Y and wires run straight; gate symbols are `(inputs + 1) * 28` px tall with input handles on row centres (18-input OR 1188 -> 532 px); empty bands still shortened; same-name outputs are NOT merged (each is a different destination: CRT/SER/IRP). Sheets without row numbers keep the old box layout. DITL-03B height ~650 px, 03A ~780 px
- [x] 2026-10-02 — Box gates + square wires + junction dots: AND / OR / NOT are plain boxes again (`SHOW_GATE_SYMBOLS = false`, the type name is the label); wires have square corners (no curves, `pathFromPoints` and the fallback step wire); a filled dot (`junctionPoints` in `route-edges.ts`, drawn by `RoutedEdge`) marks every place where wires of the same net split or merge (pass-through taps), and a crossing without a dot is not connected. Input/output boxes keep the tag + address + description style but are all the same size (340 x 56 px, `TERMINAL_W` / `TERMINAL_H`) and the text wraps inside (no truncation). Parser still reads `rowNo` / `from` / `loc` / `to` for later use (TO page links)

## Next
- [ ] Wire readability: grey wires by default, blue net on hover/select (others dim), hop at non-connected crossings, net labels for long wires
- [ ] TO column as clickable link to the target sheet (ties into "Link sheets by tag")
- [ ] DWG: convert to DXF outside the app (e.g. ODA File Converter) or add a DWG reader; PARSER_API_URL path is now only needed for .dwg / .pdf
- [ ] Link sheets by tag (output of one page feeds another) for cross-sheet simulation
- [ ] Test 8–10 varied DXF sheets to find new symbols (XOR, comparators, etc.)
- [ ] Use symbol library in the Import parser to assign block types
- [ ] Persistence — decide on backend (e.g. Lovable Cloud) when real data arrives


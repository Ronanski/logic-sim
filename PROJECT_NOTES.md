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

## Next
- [ ] DWG: convert to DXF outside the app (e.g. ODA File Converter) or add a DWG reader; PARSER_API_URL path is now only needed for .dwg / .pdf
- [ ] Link sheets by tag (output of one page feeds another) for cross-sheet simulation
- [ ] Test 8–10 varied DXF sheets to find new symbols (XOR, comparators, etc.)
- [ ] Use symbol library in the Import parser to assign block types
- [ ] Persistence — decide on backend (e.g. Lovable Cloud) when real data arrives


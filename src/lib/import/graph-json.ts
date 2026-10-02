import { z } from "zod";

import type { LogicEdge, LogicGraph, LogicNode, LogicNodeType, LogicParamValue, LogicPort, LogicPoint, ImportedGeometry } from "@/lib/logic-graph/types";
import type { ReviewItem } from "@/lib/review/review-store";
import sampleJson from "./samples/ditl-03a.graph.json";

/** CJK ideographs, kana, hangul, CJK punctuation and full-width forms. */
const CJK_RE = /[\u2E80-\u2FFF\u3000-\u303F\u3040-\u30FF\u3100-\u31FF\u3200-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]|[\uD840-\uD87F][\uDC00-\uDFFF]/g;

/** Remove CJK (and other non-printable-ASCII) characters so only English text is shown. */
export function stripNonEnglish(text: string): string {
  return text
    .replace(CJK_RE, " ")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const paramValue = z.union([z.number(), z.string(), z.boolean()]);
const schema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        tag: z.string().max(200).default(""),
        type: z.string().min(1).max(50),
        params: z.record(z.string(), z.unknown()).default({}),
        ports: z.array(z.object({ id: z.string().min(1).max(50), dir: z.enum(["in", "out"]) })).default([]),
        confidence: z.number().min(0).max(1).default(1),
        needsReview: z.boolean().default(false),
        pos: z.object({ x: z.number(), y: z.number() }).optional(),
      }),
    )
    .max(2000),
  edges: z
    .array(
      z.object({
        from: z.object({ node: z.string(), port: z.string() }),
        to: z.object({ node: z.string(), port: z.string() }),
      }),
    )
    .max(10000),
  geometry: z
    .object({
      source: z.literal("DXF"),
      edgePaths: z.record(
        z.string(),
        z.array(z.object({ x: z.number(), y: z.number() })),
      ),
    })
    .optional(),
});

const bool = (id: string, name: string): LogicPort => ({ id, name, dataType: "bool" });

interface Mapped {
  type: LogicNodeType;
  inputs: LogicPort[];
  outputs: LogicPort[];
  /** JSON port id -> internal port id */
  portMap: Record<string, string>;
  params: Record<string, LogicParamValue>;
  forceReview?: boolean;
}

function mapNode(type: string, params: Record<string, LogicParamValue>, ports: { id: string; dir: "in" | "out" }[]): Mapped {
  const ins = ports.filter((p) => p.dir === "in");
  const outs = ports.filter((p) => p.dir === "out");
  const portMap: Record<string, string> = {};
  const t = type.toUpperCase();

  if (t === "SIGNAL") {
    if (String(params.role).toLowerCase() === "output") {
      ins.forEach((p) => (portMap[p.id] = "in"));
      return { type: "DO", inputs: [bool("in", "IN")], outputs: [], portMap, params };
    }
    outs.forEach((p) => (portMap[p.id] = "out"));
    return { type: "DI", inputs: [], outputs: [bool("out", "OUT")], portMap, params };
  }
  if (t === "SR_LATCH" || t === "SR") {
    portMap.S = "s";
    portMap.R = "r";
    portMap.Q = "q";
    return { type: "SR", inputs: [bool("s", "S"), bool("r", "R")], outputs: [bool("q", "Q")], portMap, params };
  }
  if (t === "TON" || t === "TOF" || t === "TP" || t === "TIMER") {
    ins.slice(0, 1).forEach((p) => (portMap[p.id] = "in"));
    outs.forEach((p) => (portMap[p.id] = "q"));
    const durationSec = typeof params.durationSec === "number" ? params.durationSec : Number(params.durationSec) || 1;
    const mapped: LogicNodeType = t === "TIMER" ? "TP" : (t as LogicNodeType);
    return {
      type: mapped,
      inputs: [bool("in", "IN")],
      outputs: [bool("q", "Q")],
      portMap,
      params: { ...params, durationSec },
    };
  }
  // AND / OR / NOT and anything unknown keep their own input ports; single output is "out".
  const known: LogicNodeType[] = ["AND", "OR", "NOT"];
  const isKnown = known.includes(t as LogicNodeType);
  const mappedType: LogicNodeType = isKnown ? (t as LogicNodeType) : "AND";
  ins.forEach((p) => (portMap[p.id] = p.id));
  outs.forEach((p) => (portMap[p.id] = "out"));
  return {
    type: mappedType,
    inputs: ins.map((p) => bool(p.id, stripNonEnglish(p.id))),
    outputs: [bool("out", "OUT")],
    portMap,
    params: isKnown ? params : { ...params, unknownType: type },
    forceReview: !isKnown,
  };
}

/** Sizes in canvas units. They must match logic-node.tsx. */
export const TERMINAL_W = 420;
/** Minimum terminal height; taller when the tag/description needs more lines. */
export const TERMINAL_H = 48;
export const GATE_W = 88;
const GATE_HEADER = 28;
const PORT_ROW = 20;
const GATE_PAD = 8;
/** Terminal text wraps instead of being cut off; these size the box so the full text fits. */
const TERM_LINE_H = 18;
const TERM_PAD_Y = 12;
/** Characters per wrapped line. Deliberately conservative so the whole text always fits. */
const TERM_CHARS = 24;
/** Draw AND / OR / NOT as logic gate symbols (set to false to go back to plain boxes). */
export const SHOW_GATE_SYMBOLS = false;
/** Vertical space per input port on a gate symbol (about one signal row, so wires run straight in). */
const SYMBOL_PITCH = 66;
export const isSymbolGate = (n: { type: string }) => SHOW_GATE_SYMBOLS && ["AND", "OR", "NOT"].includes(n.type);
/** Space between columns, used by the wire router for its channels. */
const COL_GAP = 90;
const GAP_Y = 8;
/** Screen units per drawing unit (sheet rows are ~9 units apart). */
const DRAW_SCALE = 6;
/** Empty vertical bands taller than this are shortened so the whole sheet stays compact. */
const MAX_BAND_GAP = 24;
const isTerminal = (n: LogicNode) => n.type === "DI" || n.type === "DO";

/** Text shown inside a terminal box: tag (+ address) and, when different, the description. */
export function terminalText(n: LogicNode) {
  const desc = typeof n.params.description === "string" ? n.params.description : "";
  const addr = typeof n.params.address === "string" ? n.params.address : "";
  return { desc, addr, showDesc: !!desc && desc !== n.tag };
}

/** Every input/output box has the same size; the text wraps inside (tag + address line, then the description). */
export function terminalHeight(_n?: LogicNode): number {
  return TERMINAL_H;
}

export const nodeHeight = (n: LogicNode) => {
  if (isTerminal(n)) return terminalHeight(n);
  if (isSymbolGate(n)) return Math.max(2, n.inputs.length + 1) * 28;
  // Compact gate box: type name in the middle, one 20 px slot per port.
  return Math.max(44, Math.max(n.inputs.length, n.outputs.length, 1) * 20 + 12);
};

function compressGaps(nodes: LogicNode[]) {
  const iv = nodes.map((n) => [n.position!.y, n.position!.y + nodeHeight(n)] as [number, number]).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of iv) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const cuts: { from: number; shift: number }[] = [];
  let total = 0;
  for (let i = 1; i < merged.length; i++) {
    const gap = merged[i][0] - merged[i - 1][1];
    if (gap > MAX_BAND_GAP) {
      total += gap - MAX_BAND_GAP;
      cuts.push({ from: merged[i][0], shift: total });
    }
  }
  const top = merged.length ? merged[0][0] : 0;
  for (const n of nodes) {
    const y = n.position!.y;
    let shift = 0;
    for (const c of cuts) if (y >= c.from) shift = c.shift;
    n.position = { x: n.position!.x, y: y - shift - top };
  }
}

/**
 * Sheet layout: gates sit where they are on the drawing (x and y scaled), inputs in a left column and
 * outputs in a right column on their sheet rows, so the picture reads like the original sheet.
 * Gates that would overlap are pushed down. Returns false when the drawing has no positions.
 */
function layoutSheet(nodes: LogicNode[], drawX: Map<string, number>, drawY: Map<string, number>): boolean {
  const gates = nodes.filter((n) => !isTerminal(n));
  if (!nodes.length || !gates.length || nodes.some((n) => !drawX.has(n.id) || !drawY.has(n.id))) return false;
  const topY = Math.max(...nodes.map((n) => drawY.get(n.id)!));
  const gx = gates.map((n) => drawX.get(n.id)!);
  const gx0 = Math.min(...gx);
  const span = Math.max(1, Math.max(...gx) - gx0);
  const XS = Math.max(2.5, Math.min(5, 900 / span));
  const gateStart = TERMINAL_W + 70;
  for (const g of gates) {
    g.position = { x: gateStart + (drawX.get(g.id)! - gx0) * XS, y: (topY - drawY.get(g.id)!) * DRAW_SCALE - nodeHeight(g) / 2 };
  }
  // keep gates from overlapping: push the lower one down
  const MARGIN = 14;
  const placed: LogicNode[] = [];
  for (const g of [...gates].sort((a, b) => a.position!.y - b.position!.y || a.position!.x - b.position!.x)) {
    for (let guard = 0; guard < 200; guard++) {
      const hit = placed.find((o) => {
        const ox = o.position!.x < g.position!.x + GATE_W + MARGIN && g.position!.x < o.position!.x + GATE_W + MARGIN;
        const oy = o.position!.y < g.position!.y + nodeHeight(g) + MARGIN && g.position!.y < o.position!.y + nodeHeight(o) + MARGIN;
        return ox && oy;
      });
      if (!hit) break;
      g.position = { x: g.position!.x, y: hit.position!.y + nodeHeight(hit) + MARGIN };
    }
    placed.push(g);
  }
  const rightX = Math.max(...gates.map((g) => g.position!.x + GATE_W)) + 70;
  for (const side of ["DI", "DO"] as const) {
    const col = nodes.filter((n) => n.type === side).sort((a, b) => drawY.get(b.id)! - drawY.get(a.id)!);
    let y = -Infinity;
    for (const n of col) {
      const top = Math.max((topY - drawY.get(n.id)!) * DRAW_SCALE - nodeHeight(n) / 2, y);
      n.position = { x: side === "DI" ? 0 : rightX, y: top };
      y = top + nodeHeight(n) + GAP_Y;
    }
  }
  compressGaps(nodes);
  return true;
}

/**
 * Left-to-right layout. Columns come from signal depth (inputs, gates, outputs).
 * Vertical order follows the drawing: each node sits at its sheet row, and nodes
 * that would overlap are pushed down, so the picture reads like the original sheet.
 */
function layout(nodes: LogicNode[], edges: LogicEdge[], drawY: Map<string, number>, drawX: Map<string, number> = new Map()) {
  if (layoutSheet(nodes, drawX, drawY)) return;
  const depth = new Map<string, number>();
  const preds = new Map<string, string[]>();
  for (const n of nodes) preds.set(n.id, []);
  for (const e of edges) preds.get(e.to.nodeId)?.push(e.from.nodeId);
  const visiting = new Set<string>();
  const d = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const p = preds.get(id) ?? [];
    const v = p.length ? Math.max(...p.map(d)) + 1 : 0;
    visiting.delete(id);
    depth.set(id, v);
    return v;
  };
  for (const n of nodes) {
    if (n.type === "DI") depth.set(n.id, 0);
  }
  for (const n of nodes) if (n.type !== "DO") d(n.id);
  const gateDepths = nodes.filter((n) => !isTerminal(n)).map((n) => depth.get(n.id) ?? 1);
  const outCol = Math.max(1, ...gateDepths) + 1;
  for (const n of nodes) {
    if (n.type === "DI") depth.set(n.id, 0);
    else if (n.type === "DO") depth.set(n.id, outCol);
    else depth.set(n.id, Math.max(1, depth.get(n.id) ?? 1));
  }
  const cols = new Map<number, LogicNode[]>();
  for (const n of nodes) {
    const c = depth.get(n.id)!;
    if (!cols.has(c)) cols.set(c, []);
    cols.get(c)!.push(n);
  }
  const ys = [...drawY.values()];
  const topY = ys.length ? Math.max(...ys) : 0;
  const hasDrawing = drawY.size === nodes.length && nodes.length > 0;
  // Column x positions from the real widths so terminals and gates sit close together.
  const colX = new Map<number, number>();
  let x = 0;
  for (const c of [...cols.keys()].sort((a, b) => a - b)) {
    colX.set(c, x);
    x += (cols.get(c)!.some(isTerminal) ? TERMINAL_W : GATE_W) + COL_GAP;
  }
  for (const [c, list] of cols) {
    // Order: sheet row (top first) when known, otherwise keep input order.
    const want = (n: LogicNode, i: number) =>
      hasDrawing ? (topY - drawY.get(n.id)!) * DRAW_SCALE - nodeHeight(n) / 2 : i * 100;
    const sorted = list.map((n, i) => ({ n, w: want(n, i) })).sort((a, b) => a.w - b.w);
    let y = -Infinity;
    for (const { n, w } of sorted) {
      const top = Math.max(w, y);
      n.position = { x: colX.get(c)!, y: top };
      y = top + nodeHeight(n) + GAP_Y;
    }
  }
  compressGaps(nodes);
}

export interface GraphJsonResult {
  graph: LogicGraph;
  items: ReviewItem[];
}

/** Parse and convert a graph JSON string/object into a simulation graph plus advisory review items. */
export function convertGraphJson(input: unknown, name = "Graph JSON"): GraphJsonResult {
  let raw = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      throw new Error("This is not valid JSON. Check for missing commas or brackets.");
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Graph JSON is not in the expected format (${issue.path.join(".") || "root"}: ${issue.message}).`);
  }
  const { nodes: rawNodes, edges: rawEdges } = parsed.data;

  const portMaps = new Map<string, Record<string, string>>();
  const drawY = new Map<string, number>();
  const drawX = new Map<string, number>();
  const nodes: LogicNode[] = rawNodes.map((rn) => {
    const params: Record<string, LogicParamValue> = {};
    for (const [k, v] of Object.entries(rn.params)) {
      const ok = paramValue.safeParse(v);
      if (ok.success) params[k] = typeof ok.data === "string" ? stripNonEnglish(ok.data) : ok.data;
    }
    const m = mapNode(rn.type, params, rn.ports);
    portMaps.set(rn.id, m.portMap);
    if (rn.pos) {
      drawY.set(rn.id, rn.pos.y);
      drawX.set(rn.id, rn.pos.x);
    }
    return {
      id: rn.id,
      tag: stripNonEnglish(rn.tag) || stripNonEnglish(rn.id),
      type: m.type,
      params: m.params,
      inputs: m.inputs,
      outputs: m.outputs,
      confidence: m.forceReview ? Math.min(rn.confidence, 0.3) : rn.confidence,
      needsReview: rn.needsReview || !!m.forceReview,
    };
  });

  const ids = new Set(nodes.map((n) => n.id));
  const edges: LogicEdge[] = [];
  rawEdges.forEach((re, i) => {
    if (!ids.has(re.from.node) || !ids.has(re.to.node)) return;
    edges.push({
      id: `e${i + 1}`,
      from: { nodeId: re.from.node, portId: portMaps.get(re.from.node)?.[re.from.port] ?? re.from.port },
      to: { nodeId: re.to.node, portId: portMaps.get(re.to.node)?.[re.to.port] ?? re.to.port },
    });
  });

  let geometry: ImportedGeometry | undefined;
  const rawGeometry = parsed.data.geometry;
  if (rawGeometry && Object.keys(rawGeometry.edgePaths).length && drawX.size === nodes.length && drawY.size === nodes.length) {
    // Keep the DXF's relative geometry. Do not run layoutSheet(), gap compression, or column reflow on imported drawings.
    const xs = nodes.map((n) => drawX.get(n.id)!);
    const ys = nodes.map((n) => drawY.get(n.id)!);
    const edgePoints = Object.values(rawGeometry.edgePaths).flat();
    const allX = [...xs, ...edgePoints.map((p) => p.x)];
    const allY = [...ys, ...edgePoints.map((p) => p.y)];
    const minX = Math.min(...allX);
    const maxY = Math.max(...allY);
    // DCS drawing units are intentionally kept close to screen units. The whole sheet can then be fitView'ed.
    const SCALE = 1.35;
    for (const n of nodes) {
      const dx = drawX.get(n.id)!;
      const dy = drawY.get(n.id)!;
      const x = (dx - minX) * SCALE;
      const y = (maxY - dy) * SCALE;
      // Parser positions are drawing anchors/centers. ReactFlow positions are top-left coordinates.
      if (n.type === "DI") n.position = { x: x - TERMINAL_W, y: y - nodeHeight(n) / 2 };
      else if (n.type === "DO") n.position = { x, y: y - nodeHeight(n) / 2 };
      else n.position = { x: x - GATE_W / 2, y: y - nodeHeight(n) / 2 };
    }
    const edgePaths: Record<string, LogicPoint[]> = {};
    for (const [id, pts] of Object.entries(rawGeometry.edgePaths)) {
      edgePaths[id] = pts.map((p) => ({ x: (p.x - minX) * SCALE, y: (maxY - p.y) * SCALE }));
    }
    geometry = { source: "DXF", edgePaths };
  } else {
    layout(nodes, edges, drawY, drawX);
  }

  const items: ReviewItem[] = nodes
    .filter((n) => n.needsReview)
    .map((n) => ({
      id: `rv-${n.id}`,
      kind: "node",
      targetId: n.id,
      reason: "needs-review",
      detail: `Flagged by the parser (${Math.round(n.confidence * 100)}% confidence). Check type and parameters.`,
      status: "open",
      advisory: true,
    }));

  const safeName = stripNonEnglish(name) || "Graph JSON";
  return { graph: { id: "json-import", name: safeName, nodes, edges, ...(geometry ? { geometry } : {}) }, items };
}

export const SAMPLE_GRAPH_JSON = JSON.stringify(sampleJson, null, 2);

export function getSampleGraphImport(): GraphJsonResult {
  return convertGraphJson(sampleJson, "DITL-03A (graph JSON)");
}

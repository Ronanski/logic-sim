import { z } from "zod";

import type { LogicEdge, LogicGraph, LogicNode, LogicNodeType, LogicParamValue, LogicPort } from "@/lib/logic-graph/types";
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
export const TERMINAL_W = 340;
/** Minimum terminal height; taller when the tag/description needs more lines. */
export const TERMINAL_H = 56;
export const GATE_W = 112;
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
const GAP_Y = 16;
/** Screen units per drawing unit (sheet rows are ~9 units apart). */
const DRAW_SCALE = 6;
/** Empty vertical bands taller than this are shortened so the whole sheet stays compact. */
const MAX_BAND_GAP = 40;
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
  if (isSymbolGate(n)) return Math.max(48, (n.inputs.length || 1) * 22 + 10);
  return GATE_HEADER + Math.max(n.inputs.length, n.outputs.length, 1) * PORT_ROW + GATE_PAD;
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
 * Left-to-right layout. Columns come from signal depth (inputs, gates, outputs).
 * Vertical order follows the drawing: each node sits at its sheet row, and nodes
 * that would overlap are pushed down, so the picture reads like the original sheet.
 */
function layout(nodes: LogicNode[], edges: LogicEdge[], drawY: Map<string, number>) {
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
  const nodes: LogicNode[] = rawNodes.map((rn) => {
    const params: Record<string, LogicParamValue> = {};
    for (const [k, v] of Object.entries(rn.params)) {
      const ok = paramValue.safeParse(v);
      if (ok.success) params[k] = typeof ok.data === "string" ? stripNonEnglish(ok.data) : ok.data;
    }
    const m = mapNode(rn.type, params, rn.ports);
    portMaps.set(rn.id, m.portMap);
    if (rn.pos) drawY.set(rn.id, rn.pos.y);
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

  layout(nodes, edges, drawY);

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
  return { graph: { id: "json-import", name: safeName, nodes, edges }, items };
}

export const SAMPLE_GRAPH_JSON = JSON.stringify(sampleJson, null, 2);

export function getSampleGraphImport(): GraphJsonResult {
  return convertGraphJson(sampleJson, "DITL-03A (graph JSON)");
}

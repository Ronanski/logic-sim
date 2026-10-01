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
  if (t === "TIMER" || t === "TP") {
    ins.slice(0, 1).forEach((p) => (portMap[p.id] = "in"));
    outs.forEach((p) => (portMap[p.id] = "q"));
    const durationSec = typeof params.durationSec === "number" ? params.durationSec : Number(params.durationSec) || 1;
    return { type: "TP", inputs: [bool("in", "IN")], outputs: [bool("q", "Q")], portMap, params: { ...params, durationSec } };
  }
  // AND / OR / NOT and anything unknown keep their own input ports; single output is "out".
  const known: LogicNodeType[] = ["AND", "OR", "NOT"];
  const mappedType: LogicNodeType = known.includes(t as LogicNodeType) ? (t as LogicNodeType) : "AND";
  ins.forEach((p) => (portMap[p.id] = p.id));
  outs.forEach((p) => (portMap[p.id] = "out"));
  return {
    type: mappedType,
    inputs: ins.map((p) => bool(p.id, stripNonEnglish(p.id))),
    outputs: [bool("out", "OUT")],
    portMap,
    params,
  };
}

const COL_W = 280;
const GAP_Y = 24;
const nodeHeight = (n: LogicNode) => 32 + Math.max(n.inputs.length, n.outputs.length, 1) * 24 + 8 + 24 + 16;

/** Left-to-right layout: inputs first column, gates by depth, outputs last column. */
function layout(nodes: LogicNode[], edges: LogicEdge[]) {
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
  const gateDepths = nodes.filter((n) => n.type !== "DI" && n.type !== "DO").map((n) => depth.get(n.id) ?? 1);
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
  for (const [c, list] of cols) {
    let y = 0;
    for (const n of list) {
      n.position = { x: c * COL_W, y };
      y += nodeHeight(n) + GAP_Y;
    }
  }
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
  const nodes: LogicNode[] = rawNodes.map((rn) => {
    const params: Record<string, LogicParamValue> = {};
    for (const [k, v] of Object.entries(rn.params)) {
      const ok = paramValue.safeParse(v);
      if (ok.success) params[k] = typeof ok.data === "string" ? stripNonEnglish(ok.data) : ok.data;
    }
    const m = mapNode(rn.type, params, rn.ports);
    portMaps.set(rn.id, m.portMap);
    return {
      id: rn.id,
      tag: stripNonEnglish(rn.tag) || stripNonEnglish(rn.id),
      type: m.type,
      params: m.params,
      inputs: m.inputs,
      outputs: m.outputs,
      confidence: rn.confidence,
      needsReview: rn.needsReview,
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

  layout(nodes, edges);

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

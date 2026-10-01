import { useSyncExternalStore } from "react";
import type { LogicEdge, LogicGraph, LogicNodeType, LogicParamValue, LogicPort } from "@/lib/logic-graph/types";
import { getSampleGraphImport, stripNonEnglish } from "@/lib/import/graph-json";

export type ReviewReason = "unknown-symbol" | "floating-line" | "ambiguous-text" | "needs-review";

export interface ReviewItem {
  id: string;
  kind: "node" | "edge";
  targetId: string;
  reason: ReviewReason;
  detail: string;
  status: "open" | "approved" | "deleted";
  /** Advisory items (graph JSON needsReview) are listed but never block Simulate. */
  advisory?: boolean;
}

export const reasonLabel: Record<ReviewReason, string> = {
  "unknown-symbol": "Unknown symbol",
  "floating-line": "Floating line",
  "ambiguous-text": "Ambiguous text",
  "needs-review": "Needs review",
};

const b = (id: string, name = id): LogicPort => ({ id, name, dataType: "bool" });
const a = (id: string, name = id): LogicPort => ({ id, name, dataType: "analog" });
const e = (id: string, from: string, fp: string, to: string, tp: string): LogicEdge => ({
  id,
  from: { nodeId: from, portId: fp },
  to: { nodeId: to, portId: tp },
});

/** Mock parser output for drawing "P&ID-204 Rev B". */
const mockGraph: LogicGraph = {
  id: "import-204",
  name: "P&ID-204 Rev B (mock import)",
  nodes: [
    { id: "di1", tag: "LSH-301", type: "DI", params: { address: "I2.0", invert: false }, inputs: [], outputs: [b("out", "OUT")], confidence: 0.95, needsReview: false, position: { x: 0, y: 0 } },
    { id: "di2", tag: "HS-3O2", type: "DI", params: { address: "I2.1", invert: false }, inputs: [], outputs: [b("out", "OUT")], confidence: 0.58, needsReview: true, position: { x: 0, y: 160 } },
    { id: "blk1", tag: "?-303", type: "AND", params: {}, inputs: [b("in1", "IN1"), b("in2", "IN2")], outputs: [b("out", "OUT")], confidence: 0.32, needsReview: true, position: { x: 280, y: 72 } },
    { id: "ton1", tag: "TON-304", type: "TON", params: { presetMs: 3000 }, inputs: [b("in", "IN")], outputs: [b("q", "Q")], confidence: 0.9, needsReview: false, position: { x: 560, y: 80 } },
    { id: "do1", tag: "XV-305", type: "DO", params: { address: "Q2.0" }, inputs: [b("in", "IN")], outputs: [], confidence: 0.93, needsReview: false, position: { x: 840, y: 88 } },
    { id: "ai1", tag: "LT-306", type: "AI", params: { min: 0, max: 100 }, inputs: [], outputs: [a("out", "OUT")], confidence: 0.94, needsReview: false, position: { x: 0, y: 320 } },
    { id: "cmp1", tag: "LIC-3O7", type: "COMP", params: { threshold: 80 }, inputs: [a("in", "IN")], outputs: [b("out", "OUT")], confidence: 0.61, needsReview: true, position: { x: 280, y: 320 } },
  ],
  edges: [
    e("w1", "di1", "out", "blk1", "in1"),
    e("w2", "di2", "out", "blk1", "in2"),
    e("w3", "blk1", "out", "ton1", "in"),
    e("w4", "ton1", "q", "do1", "in"),
    e("w5", "ai1", "out", "cmp1", "in"),
    e("w6", "cmp1", "out", "do1", "in"),
  ],
};

const initialItems: ReviewItem[] = [
  { id: "r1", kind: "node", targetId: "blk1", reason: "unknown-symbol", detail: "Symbol on layer LOGIC-MISC did not match any library entry.", status: "open" },
  { id: "r2", kind: "node", targetId: "di2", reason: "ambiguous-text", detail: "Tag read as \"HS-3O2\" — letter O or digit 0?", status: "open" },
  { id: "r3", kind: "node", targetId: "cmp1", reason: "ambiguous-text", detail: "Label \"LIC\" could be comparator or PID controller.", status: "open" },
  { id: "r4", kind: "edge", targetId: "w6", reason: "floating-line", detail: "Line endpoint is 4 mm from XV-305 input; connection guessed.", status: "open" },
];

/** Fresh copy of the mock parser result, named after the uploaded file. */
export function getMockImport(fileName?: string): { graph: LogicGraph; items: ReviewItem[] } {
  const graph: LogicGraph = structuredClone(mockGraph);
  if (fileName) graph.name = `${fileName} (mock parse)`;
  return { graph, items: structuredClone(initialItems) };
}

interface ReviewState {
  graph: LogicGraph;
  items: ReviewItem[];
  override: boolean;
}

const sampleImport = getSampleGraphImport();
let state: ReviewState = { graph: sampleImport.graph, items: sampleImport.items, override: false };
const listeners = new Set<() => void>();
const set = (next: ReviewState) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useReview() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export const openCount = (s: ReviewState) => s.items.filter((i) => i.status === "open").length;
/** Open items that block Simulate (advisory items never block). */
export const blockingCount = (s: ReviewState) => s.items.filter((i) => i.status === "open" && !i.advisory).length;

function markNode(graph: LogicGraph, nodeId: string, patch: Partial<LogicGraph["nodes"][number]>) {
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)) };
}

export const reviewActions = {
  approve(itemId: string) {
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return;
    const graph = item.kind === "node" ? markNode(state.graph, item.targetId, { needsReview: false }) : state.graph;
    set({ ...state, graph, items: state.items.map((i) => (i.id === itemId ? { ...i, status: "approved" } : i)) });
  },
  reassign(itemId: string, type: LogicNodeType) {
    const item = state.items.find((i) => i.id === itemId);
    if (!item || item.kind !== "node") return;
    set({
      ...state,
      graph: markNode(state.graph, item.targetId, { type, needsReview: false, confidence: 1 }),
      items: state.items.map((i) => (i.id === itemId ? { ...i, status: "approved" } : i)),
    });
  },
  remove(itemId: string) {
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return;
    const graph =
      item.kind === "node"
        ? {
            ...state.graph,
            nodes: state.graph.nodes.filter((n) => n.id !== item.targetId),
            edges: state.graph.edges.filter((ed) => ed.from.nodeId !== item.targetId && ed.to.nodeId !== item.targetId),
          }
        : { ...state.graph, edges: state.graph.edges.filter((ed) => ed.id !== item.targetId) };
    set({ ...state, graph, items: state.items.map((i) => (i.id === itemId ? { ...i, status: "deleted" } : i)) });
  },
  setOverride(override: boolean) {
    set({ ...state, override });
  },
  loadImport(graph: LogicGraph, items: ReviewItem[]) {
    set({ graph, items, override: false });
  },
  setParam(nodeId: string, key: string, value: LogicParamValue) {
    const v = typeof value === "string" ? stripNonEnglish(value) : value;
    const node = state.graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    set({ ...state, graph: markNode(state.graph, nodeId, { params: { ...node.params, [key]: v } }) });
  },
  setType(nodeId: string, type: LogicNodeType) {
    set({ ...state, graph: markNode(state.graph, nodeId, { type }) });
  },
  reset() {
    const fresh = getSampleGraphImport();
    set({ graph: fresh.graph, items: fresh.items, override: false });
  },
};

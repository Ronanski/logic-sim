import type {
  LogicEdge,
  LogicGraph,
  LogicNode,
  LogicNodeType,
  LogicParamValue,
} from "./types";

export interface SignalValueMap {
  [portKey: string]: number | boolean;
}

export interface FeedbackLoopWarning {
  cycleNodes: string[];
  cycleTags: string[];
  message: string;
}

export interface SRState {
  q: boolean;
}

export interface TONState {
  elapsedMs: number;
  q: boolean;
}

export interface PIDState {
  integral: number;
  prevError: number;
  initialized: boolean;
}

export interface NodeInternalState {
  sr?: SRState;
  ton?: TONState;
  pid?: PIDState;
  [key: string]: unknown;
}

export interface ScanCycleResult {
  cycle: number;
  timestamp: number;
  signals: SignalValueMap;
  nodeOutputs: Record<string, Record<string, number | boolean>>;
  warnings: FeedbackLoopWarning[];
}

export function makePortKey(nodeId: string, portId: string): string {
  return `${nodeId}:${portId}`;
}

/**
 * Detect feedback loops (cycles) and compute an execution order.
 * In industrial control simulations, cycles (feedback loops) are normal (e.g. seal-in circuits).
 * They are flagged with a warning, and evaluated using previous-scan outputs for feedback signals.
 */
export function analyzeGraphTopology(graph: LogicGraph): {
  evaluationOrder: string[];
  warnings: FeedbackLoopWarning[];
  feedbackEdges: Set<string>;
} {
  const nodeMap = new Map<string, LogicNode>();
  const adjacency = new Map<string, string[]>();
  const edgeMap = new Map<string, LogicEdge[]>(); // u -> edges leaving u

  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
    adjacency.set(node.id, []);
    edgeMap.set(node.id, []);
  }

  for (const edge of graph.edges) {
    if (nodeMap.has(edge.from.nodeId) && nodeMap.has(edge.to.nodeId)) {
      adjacency.get(edge.from.nodeId)!.push(edge.to.nodeId);
      edgeMap.get(edge.from.nodeId)!.push(edge);
    }
  }

  // Tarjan's Strongly Connected Components to identify feedback loops
  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongConnect(u: string) {
    indices.set(u, index);
    lowlinks.set(u, index);
    index++;
    stack.push(u);
    onStack.add(u);

    for (const v of adjacency.get(u) || []) {
      if (!indices.has(v)) {
        strongConnect(v);
        lowlinks.set(u, Math.min(lowlinks.get(u)!, lowlinks.get(v)!));
      } else if (onStack.has(v)) {
        lowlinks.set(u, Math.min(lowlinks.get(u)!, indices.get(v)!));
      }
    }

    if (lowlinks.get(u) === indices.get(u)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== u);

      sccs.push(component);
    }
  }

  for (const node of graph.nodes) {
    if (!indices.has(node.id)) {
      strongConnect(node.id);
    }
  }

  const warnings: FeedbackLoopWarning[] = [];
  const feedbackEdges = new Set<string>();

  for (const scc of sccs) {
    const isCycle =
      scc.length > 1 ||
      (scc.length === 1 && (adjacency.get(scc[0]) || []).includes(scc[0]));

    if (isCycle) {
      const cycleTags = scc.map((id) => nodeMap.get(id)?.tag || id);
      warnings.push({
        cycleNodes: [...scc],
        cycleTags,
        message: `Feedback loop detected across blocks: ${cycleTags.join(" -> ")}. Using 1-scan delay for feedback signals.`,
      });

      // Mark edges within this SCC directed backwards as feedback edges
      const sccSet = new Set(scc);
      for (const u of scc) {
        for (const edge of edgeMap.get(u) || []) {
          if (sccSet.has(edge.to.nodeId)) {
            feedbackEdges.add(edge.id);
          }
        }
      }
    }
  }

  // Kahn's algorithm for topological order, ignoring feedback edges that cause cycles
  const inDegree = new Map<string, number>();
  const cleanAdjacency = new Map<string, string[]>();

  for (const node of graph.nodes) {
    inDegree.set(node.id, 0);
    cleanAdjacency.set(node.id, []);
  }

  for (const edge of graph.edges) {
    if (!feedbackEdges.has(edge.id)) {
      if (inDegree.has(edge.to.nodeId)) {
        inDegree.set(edge.to.nodeId, inDegree.get(edge.to.nodeId)! + 1);
        cleanAdjacency.get(edge.from.nodeId)?.push(edge.to.nodeId);
      }
    }
  }

  const queue: string[] = [];
  for (const [nodeId, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(nodeId);
    }
  }

  const evaluationOrder: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    evaluationOrder.push(u);

    for (const v of cleanAdjacency.get(u) || []) {
      const nextDeg = inDegree.get(v)! - 1;
      inDegree.set(v, nextDeg);
      if (nextDeg === 0) {
        queue.push(v);
      }
    }
  }

  // If any unvisited nodes remain (e.g. isolated loops), append them
  for (const node of graph.nodes) {
    if (!evaluationOrder.includes(node.id)) {
      evaluationOrder.push(node.id);
    }
  }

  return { evaluationOrder, warnings, feedbackEdges };
}

/**
 * Pure evaluation function for each block type.
 */
export function evaluateBlock(
  type: LogicNodeType,
  params: Record<string, LogicParamValue>,
  inputs: Record<string, number | boolean>,
  state: NodeInternalState,
  dtMs: number
): { outputs: Record<string, number | boolean>; nextState: NodeInternalState } {
  const nextState: NodeInternalState = { ...state };
  const outputs: Record<string, number | boolean> = {};

  const toBool = (val: unknown): boolean => Boolean(val);
  const toNum = (val: unknown, fallback = 0): number =>
    typeof val === "number" && !isNaN(val) ? val : fallback;

  switch (type) {
    case "AND": {
      const inputVals = Object.values(inputs);
      const result = inputVals.length > 0 ? inputVals.every((v) => toBool(v)) : false;
      outputs.out = result;
      break;
    }

    case "OR": {
      const inputVals = Object.values(inputs);
      const result = inputVals.length > 0 ? inputVals.some((v) => toBool(v)) : false;
      outputs.out = result;
      break;
    }

    case "NOT": {
      const inVal = inputs.in ?? inputs.in1 ?? Object.values(inputs)[0];
      outputs.out = !toBool(inVal);
      break;
    }

    case "SR": {
      // Set/Reset latch
      const s = toBool(inputs.s ?? inputs.set);
      const r = toBool(inputs.r ?? inputs.reset);
      const resetDominant = params.resetDominant !== false; // default true

      const prevQ = state.sr?.q ?? false;
      let q = prevQ;

      if (resetDominant) {
        if (r) {
          q = false;
        } else if (s) {
          q = true;
        }
      } else {
        if (s) {
          q = true;
        } else if (r) {
          q = false;
        }
      }

      nextState.sr = { q };
      outputs.q = q;
      break;
    }

    case "TON": {
      // On-delay timer
      const inVal = toBool(inputs.in);
      const presetSec = toNum(params.presetSeconds ?? params.durationSec ?? params.pt, 5);
      const presetMs = Math.max(0, presetSec * 1000);

      let elapsedMs = state.ton?.elapsedMs ?? 0;
      let q = false;

      if (inVal) {
        elapsedMs = Math.min(presetMs, elapsedMs + dtMs);
        q = elapsedMs >= presetMs;
      } else {
        elapsedMs = 0;
        q = false;
      }

      nextState.ton = { elapsedMs, q };
      outputs.q = q;
      outputs.et = Number((elapsedMs / 1000).toFixed(2));
      break;
    }

    case "TOF": {
      // Off-delay timer: Q follows IN immediately on rising, holds for presetSeconds after IN falls
      const inVal = toBool(inputs.in);
      const presetMs = Math.max(0, toNum(params.presetSeconds ?? params.durationSec, 1) * 1000);
      const prev = (state.tof as { elapsedMs: number; q: boolean } | undefined) ?? { elapsedMs: 0, q: false };
      let { elapsedMs, q } = prev;
      if (inVal) {
        q = true;
        elapsedMs = 0;
      } else if (q) {
        elapsedMs = Math.min(presetMs, elapsedMs + dtMs);
        if (elapsedMs >= presetMs) q = false;
      }
      nextState.tof = { elapsedMs, q };
      outputs.q = q;
      outputs.et = Number((elapsedMs / 1000).toFixed(2));
      break;
    }

    case "TP": {
      // Pulse timer: rising edge on IN starts a fixed-length pulse on Q
      const inVal = toBool(inputs.in);
      const presetMs = Math.max(0, toNum(params.durationSec, 1) * 1000);
      const prev = (state.tp as { elapsedMs: number; active: boolean; prevIn: boolean } | undefined) ?? {
        elapsedMs: 0,
        active: false,
        prevIn: false,
      };
      let { elapsedMs, active } = prev;
      if (inVal && !prev.prevIn && !active) {
        active = true;
        elapsedMs = 0;
      }
      const q = active && elapsedMs < presetMs;
      if (active) {
        elapsedMs += dtMs;
        if (elapsedMs >= presetMs) active = false;
      }
      nextState.tp = { elapsedMs, active, prevIn: inVal };
      outputs.q = q;
      outputs.et = Number((Math.min(elapsedMs, presetMs) / 1000).toFixed(2));
      break;
    }

    case "COMP":
    case "COMPARATOR": {
      const a = toNum(inputs.a ?? inputs.in1 ?? Object.values(inputs)[0], 0);
      const b = inputs.b !== undefined
        ? toNum(inputs.b)
        : inputs.in2 !== undefined
        ? toNum(inputs.in2)
        : toNum(params.threshold, 0);

      const op = String(params.operator ?? ">").toUpperCase();
      let res = false;

      switch (op) {
        case ">":
        case "GT":
          res = a > b;
          break;
        case "<":
        case "LT":
          res = a < b;
          break;
        case ">=":
        case "GE":
          res = a >= b;
          break;
        case "<=":
        case "LE":
          res = a <= b;
          break;
        case "==":
        case "=":
        case "EQ":
          res = Math.abs(a - b) < 1e-6;
          break;
        case "!=":
        case "<>":
        case "NE":
          res = Math.abs(a - b) >= 1e-6;
          break;
        default:
          res = a > b;
      }

      outputs.out = res;
      break;
    }

    case "PID": {
      const pv = toNum(inputs.pv ?? inputs.in, 0);
      const sp = inputs.sp !== undefined ? toNum(inputs.sp) : toNum(params.value, 0);

      const kp = toNum(params.kp, 1.0);
      const ti = toNum(params.ti, 0); // integral time (seconds)
      const td = toNum(params.td, 0); // derivative time (seconds)
      const outMin = toNum(params.outMin, 0);
      const outMax = toNum(params.outMax, 100);
      const reverse = Boolean(params.reverse);

      const dtSec = dtMs / 1000;
      const error = reverse ? pv - sp : sp - pv;

      const pTerm = kp * error;

      let integral = state.pid?.integral ?? 0;
      if (ti > 0 && dtSec > 0) {
        integral += (kp / ti) * error * dtSec;
        // Anti-windup clamping
        integral = Math.max(outMin, Math.min(outMax, integral));
      } else {
        integral = 0;
      }

      let dTerm = 0;
      const prevError = state.pid?.prevError ?? error;
      if (td > 0 && dtSec > 0 && state.pid?.initialized) {
        dTerm = kp * td * ((error - prevError) / dtSec);
      }

      const rawCv = pTerm + integral + dTerm;
      const cv = Math.max(outMin, Math.min(outMax, rawCv));

      nextState.pid = {
        integral,
        prevError: error,
        initialized: true,
      };

      outputs.cv = Number(cv.toFixed(2));
      break;
    }

    case "DI": {
      const raw = inputs.out ?? inputs.in ?? params.value ?? false;
      const invert = Boolean(params.invert);
      const finalVal = invert ? !toBool(raw) : toBool(raw);
      outputs.out = finalVal;
      break;
    }

    case "DO": {
      const inVal = inputs.in ?? inputs.in1 ?? Object.values(inputs)[0] ?? false;
      outputs.out = toBool(inVal);
      break;
    }

    case "AI": {
      const raw = inputs.pv ?? inputs.out ?? inputs.sp ?? params.value ?? 0;
      outputs.pv = toNum(raw);
      outputs.sp = toNum(raw);
      outputs.out = toNum(raw);
      break;
    }

    case "AO": {
      const inVal = inputs.in ?? inputs.in1 ?? Object.values(inputs)[0] ?? 0;
      outputs.out = toNum(inVal);
      break;
    }

    default: {
      outputs.out = false;
    }
  }

  return { outputs, nextState };
}

/**
 * Complete Simulation Engine managing graph topology, state, and scan cycles.
 */
export class SimulationEngine {
  private graph: LogicGraph;
  private nodeMap = new Map<string, LogicNode>();
  private evaluationOrder: string[] = [];
  private feedbackEdges = new Set<string>();
  private warnings: FeedbackLoopWarning[] = [];

  private cycleCount = 0;
  private signals: SignalValueMap = {};
  private nodeStates = new Map<string, NodeInternalState>();
  private manualInputs = new Map<string, number | boolean>();

  constructor(graph: LogicGraph) {
    this.graph = graph;
    this.rebuildTopology();
  }

  public setGraph(graph: LogicGraph) {
    this.graph = graph;
    this.rebuildTopology();
  }

  public rebuildTopology() {
    this.nodeMap.clear();
    for (const node of this.graph.nodes) {
      this.nodeMap.set(node.id, node);
      if (!this.nodeStates.has(node.id)) {
        this.nodeStates.set(node.id, {});
      }
    }

    const analysis = analyzeGraphTopology(this.graph);
    this.evaluationOrder = analysis.evaluationOrder;
    this.feedbackEdges = analysis.feedbackEdges;
    this.warnings = analysis.warnings;
  }

  public getWarnings(): FeedbackLoopWarning[] {
    return this.warnings;
  }

  public getEvaluationOrder(): string[] {
    return [...this.evaluationOrder];
  }

  public setInput(nodeId: string, portId: string, value: number | boolean) {
    const key = makePortKey(nodeId, portId);
    this.manualInputs.set(key, value);
    this.signals[key] = value;
  }

  public updateNodeParams(nodeId: string, params: Record<string, LogicParamValue>) {
    const node = this.nodeMap.get(nodeId);
    if (node) {
      node.params = { ...node.params, ...params };
    }
  }

  public reset() {
    this.cycleCount = 0;
    this.signals = {};
    this.nodeStates.clear();
    this.manualInputs.clear();
    for (const node of this.graph.nodes) {
      this.nodeStates.set(node.id, {});
    }
  }

  /**
   * Run one scan cycle:
   * 1. Read inputs for each node (from incoming wires or manual overrides)
   * 2. Evaluate blocks according to topological execution order
   * 3. Write outputs to the signals map
   */
  public step(dtMs = 100): ScanCycleResult {
    this.cycleCount++;
    const nodeOutputs: Record<string, Record<string, number | boolean>> = {};

    // Map of incoming edges: toNodeId -> Map<toPortId, { fromNodeId, fromPortId, edgeId }>
    const incomingEdges = new Map<string, Map<string, { fromNodeId: string; fromPortId: string; edgeId: string }>>();
    for (const edge of this.graph.edges) {
      if (!incomingEdges.has(edge.to.nodeId)) {
        incomingEdges.set(edge.to.nodeId, new Map());
      }
      incomingEdges.get(edge.to.nodeId)!.set(edge.to.portId, {
        fromNodeId: edge.from.nodeId,
        fromPortId: edge.from.portId,
        edgeId: edge.id,
      });
    }

    // Evaluate each node in topologically sorted order
    for (const nodeId of this.evaluationOrder) {
      const node = this.nodeMap.get(nodeId);
      if (!node) continue;

      // 1. Gather inputs
      const nodeInputs: Record<string, number | boolean> = {};
      const nodeEdgeMap = incomingEdges.get(nodeId);

      for (const inputPort of node.inputs) {
        const portKey = makePortKey(nodeId, inputPort.id);
        const manual = this.manualInputs.get(portKey);

        if (manual !== undefined) {
          nodeInputs[inputPort.id] = manual;
        } else if (nodeEdgeMap?.has(inputPort.id)) {
          const edgeInfo = nodeEdgeMap.get(inputPort.id)!;
          const srcKey = makePortKey(edgeInfo.fromNodeId, edgeInfo.fromPortId);
          nodeInputs[inputPort.id] = this.signals[srcKey] ?? (inputPort.dataType === "analog" ? 0 : false);
        } else {
          nodeInputs[inputPort.id] = inputPort.dataType === "analog" ? 0 : false;
        }
      }

      // If DI/AI node has no input ports defined, allow manual inputs or param values
      if (node.inputs.length === 0) {
        const outKey = makePortKey(nodeId, "out");
        const pvKey = makePortKey(nodeId, "pv");
        if (this.manualInputs.has(outKey)) {
          nodeInputs.out = this.manualInputs.get(outKey)!;
        }
        if (this.manualInputs.has(pvKey)) {
          nodeInputs.pv = this.manualInputs.get(pvKey)!;
        }
      }

      // 2. Evaluate block
      const currentState = this.nodeStates.get(nodeId) || {};
      const { outputs, nextState } = evaluateBlock(node.type, node.params, nodeInputs, currentState, dtMs);
      this.nodeStates.set(nodeId, nextState);
      nodeOutputs[nodeId] = outputs;

      // 3. Write outputs to signals map
      for (const [portId, val] of Object.entries(outputs)) {
        this.signals[makePortKey(nodeId, portId)] = val;
      }
    }

    return {
      cycle: this.cycleCount,
      timestamp: Date.now(),
      signals: { ...this.signals },
      nodeOutputs,
      warnings: this.warnings,
    };
  }
}

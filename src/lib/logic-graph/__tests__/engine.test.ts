import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateBlock,
  analyzeGraphTopology,
  SimulationEngine,
} from "../engine.ts";
import type { LogicGraph, LogicNode, LogicEdge } from "../types.ts";

describe("Simulation Engine - Block Evaluations", () => {
  it("AND block evaluates all inputs", () => {
    const emptyState = {};

    // Both true -> true
    const res1 = evaluateBlock("AND", {}, { in1: true, in2: true }, emptyState, 100);
    assert.equal(res1.outputs.out, true);

    // One false -> false
    const res2 = evaluateBlock("AND", {}, { in1: true, in2: false }, emptyState, 100);
    assert.equal(res2.outputs.out, false);

    // 3 inputs
    const res3 = evaluateBlock("AND", {}, { in1: true, in2: true, in3: true }, emptyState, 100);
    assert.equal(res3.outputs.out, true);
  });

  it("OR block evaluates any input true", () => {
    const emptyState = {};

    const res1 = evaluateBlock("OR", {}, { in1: false, in2: true }, emptyState, 100);
    assert.equal(res1.outputs.out, true);

    const res2 = evaluateBlock("OR", {}, { in1: false, in2: false }, emptyState, 100);
    assert.equal(res2.outputs.out, false);
  });

  it("NOT block inverts input", () => {
    const emptyState = {};

    const res1 = evaluateBlock("NOT", {}, { in: false }, emptyState, 100);
    assert.equal(res1.outputs.out, true);

    const res2 = evaluateBlock("NOT", {}, { in: true }, emptyState, 100);
    assert.equal(res2.outputs.out, false);
  });

  it("SR latch supports Set, Reset, Hold, and Reset-Dominance", () => {
    let state = {};

    // 1. Set latch
    const s1 = evaluateBlock("SR", { resetDominant: true }, { s: true, r: false }, state, 100);
    assert.equal(s1.outputs.q, true);
    state = s1.nextState;

    // 2. Hold state (s=false, r=false)
    const s2 = evaluateBlock("SR", { resetDominant: true }, { s: false, r: false }, state, 100);
    assert.equal(s2.outputs.q, true);
    state = s2.nextState;

    // 3. Reset latch
    const s3 = evaluateBlock("SR", { resetDominant: true }, { s: false, r: true }, state, 100);
    assert.equal(s3.outputs.q, false);
    state = s3.nextState;

    // 4. Reset-Dominant conflict (both s=true and r=true)
    const s4 = evaluateBlock("SR", { resetDominant: true }, { s: true, r: true }, state, 100);
    assert.equal(s4.outputs.q, false, "Reset-dominant must output false when both S and R are active");

    // 5. Set-Dominant conflict (resetDominant = false)
    const s5 = evaluateBlock("SR", { resetDominant: false }, { s: true, r: true }, state, 100);
    assert.equal(s5.outputs.q, true, "Set-dominant must output true when both S and R are active");
  });

  it("TON timer on-delay accumulation and reset", () => {
    let state = {};
    const params = { presetSeconds: 0.3 }; // 300 ms preset

    // Scan 1: IN = true, elapsed = 100ms (< 300ms) -> Q = false
    const t1 = evaluateBlock("TON", params, { in: true }, state, 100);
    assert.equal(t1.outputs.q, false);
    assert.equal(t1.outputs.et, 0.1);
    state = t1.nextState;

    // Scan 2: IN = true, elapsed = 200ms (< 300ms) -> Q = false
    const t2 = evaluateBlock("TON", params, { in: true }, state, 100);
    assert.equal(t2.outputs.q, false);
    assert.equal(t2.outputs.et, 0.2);
    state = t2.nextState;

    // Scan 3: IN = true, elapsed = 300ms (>= 300ms) -> Q = true
    const t3 = evaluateBlock("TON", params, { in: true }, state, 100);
    assert.equal(t3.outputs.q, true);
    assert.equal(t3.outputs.et, 0.3);
    state = t3.nextState;

    // Scan 4: IN drops to false -> immediate reset of elapsed time and output
    const t4 = evaluateBlock("TON", params, { in: false }, state, 100);
    assert.equal(t4.outputs.q, false);
    assert.equal(t4.outputs.et, 0);
  });

  it("Comparator evaluates GT, LT, EQ, and thresholds", () => {
    const emptyState = {};

    // Greater Than: 15 > 10
    const c1 = evaluateBlock("COMP", { operator: ">" }, { a: 15, b: 10 }, emptyState, 100);
    assert.equal(c1.outputs.out, true);

    // Less Than: 15 < 10
    const c2 = evaluateBlock("COMP", { operator: "<" }, { a: 15, b: 10 }, emptyState, 100);
    assert.equal(c2.outputs.out, false);

    // Equal: 42 == 42
    const c3 = evaluateBlock("COMPARATOR", { operator: "==" }, { a: 42, b: 42 }, emptyState, 100);
    assert.equal(c3.outputs.out, true);

    // Threshold parameter fallback when b is not wired
    const c4 = evaluateBlock("COMP", { operator: ">=", threshold: 50 }, { a: 50 }, emptyState, 100);
    assert.equal(c4.outputs.out, true);
  });

  it("PID controller calculates P, I, D and clamps to limits", () => {
    let state = {};
    const params = {
      kp: 2.0,
      ti: 1.0, // 1 second
      td: 0.1, // 0.1 second
      outMin: 0,
      outMax: 100,
    };

    // SP = 60, PV = 50 -> error = 10
    // dt = 100 ms = 0.1 s
    // P = 2.0 * 10 = 20
    // I = (2.0 / 1.0) * 10 * 0.1 = 2
    // D = 0 (first step)
    // CV = 22
    const p1 = evaluateBlock("PID", params, { sp: 60, pv: 50 }, state, 100);
    assert.equal(p1.outputs.cv, 22);
    state = p1.nextState;

    // Step 2: SP = 60, PV = 50 -> error = 10
    // Integral increases by 2 -> I = 4
    // dError = 0 -> D = 0
    // CV = 20 + 4 = 24
    const p2 = evaluateBlock("PID", params, { sp: 60, pv: 50 }, state, 100);
    assert.equal(p2.outputs.cv, 24);
    state = p2.nextState;

    // Test output clamping to outMax
    const pClamp = evaluateBlock("PID", { kp: 100, outMax: 50 }, { sp: 100, pv: 0 }, {}, 100);
    assert.equal(pClamp.outputs.cv, 50);
  });
});

describe("Simulation Engine - Topology, Loops and Scan Cycle", () => {
  it("topologically sorts blocks in execution order", () => {
    const graph: LogicGraph = {
      id: "test-topo",
      name: "Topo",
      nodes: [
        { id: "motor", tag: "M-1", type: "DO", params: {}, inputs: [{ id: "in", name: "IN", dataType: "bool" }], outputs: [], confidence: 1, needsReview: false },
        { id: "switch", tag: "SW-1", type: "DI", params: {}, inputs: [], outputs: [{ id: "out", name: "OUT", dataType: "bool" }], confidence: 1, needsReview: false },
        { id: "gate", tag: "AND-1", type: "AND", params: {}, inputs: [{ id: "in1", name: "IN1", dataType: "bool" }], outputs: [{ id: "out", name: "OUT", dataType: "bool" }], confidence: 1, needsReview: false },
      ],
      edges: [
        { id: "e1", from: { nodeId: "switch", portId: "out" }, to: { nodeId: "gate", portId: "in1" } },
        { id: "e2", from: { nodeId: "gate", portId: "out" }, to: { nodeId: "motor", portId: "in" } },
      ],
    };

    const analysis = analyzeGraphTopology(graph);
    assert.deepEqual(analysis.evaluationOrder, ["switch", "gate", "motor"]);
    assert.equal(analysis.warnings.length, 0);
  });

  it("detects feedback loops and produces warning", () => {
    const graph: LogicGraph = {
      id: "test-loop",
      name: "Feedback Loop",
      nodes: [
        { id: "n1", tag: "BLOCK-A", type: "AND", params: {}, inputs: [{ id: "in1", name: "IN1", dataType: "bool" }], outputs: [{ id: "out", name: "OUT", dataType: "bool" }], confidence: 1, needsReview: false },
        { id: "n2", tag: "BLOCK-B", type: "OR", params: {}, inputs: [{ id: "in1", name: "IN1", dataType: "bool" }], outputs: [{ id: "out", name: "OUT", dataType: "bool" }], confidence: 1, needsReview: false },
      ],
      edges: [
        { id: "e1", from: { nodeId: "n1", portId: "out" }, to: { nodeId: "n2", portId: "in1" } },
        { id: "e2", from: { nodeId: "n2", portId: "out" }, to: { nodeId: "n1", portId: "in1" } },
      ],
    };

    const analysis = analyzeGraphTopology(graph);
    assert.equal(analysis.warnings.length, 1);
    assert.match(analysis.warnings[0].message, /Feedback loop detected/);
    assert.ok(analysis.warnings[0].cycleTags.includes("BLOCK-A"));
    assert.ok(analysis.warnings[0].cycleTags.includes("BLOCK-B"));
  });

  it("executes complete 100ms scan cycle in SimulationEngine", () => {
    const graph: LogicGraph = {
      id: "scan-test",
      name: "Scan Test",
      nodes: [
        { id: "btn", tag: "PB-1", type: "DI", params: {}, inputs: [], outputs: [{ id: "out", name: "OUT", dataType: "bool" }], confidence: 1, needsReview: false },
        { id: "not1", tag: "INV", type: "NOT", params: {}, inputs: [{ id: "in", name: "IN", dataType: "bool" }], outputs: [{ id: "out", name: "OUT", dataType: "bool" }], confidence: 1, needsReview: false },
      ],
      edges: [
        { id: "e1", from: { nodeId: "btn", portId: "out" }, to: { nodeId: "not1", portId: "in" } },
      ],
    };

    const engine = new SimulationEngine(graph);

    // Initial scan with button false -> NOT outputs true
    engine.setInput("btn", "out", false);
    const tick1 = engine.step(100);
    assert.equal(tick1.cycle, 1);
    assert.equal(tick1.signals["not1:out"], true);

    // Next scan with button true -> NOT outputs false
    engine.setInput("btn", "out", true);
    const tick2 = engine.step(100);
    assert.equal(tick2.cycle, 2);
    assert.equal(tick2.signals["not1:out"], false);
  });
});

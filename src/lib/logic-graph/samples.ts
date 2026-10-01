import type { LogicEdge, LogicGraph, LogicPort } from "./types";

const b = (id: string, name = id): LogicPort => ({ id, name, dataType: "bool" });
const a = (id: string, name = id): LogicPort => ({ id, name, dataType: "analog" });
const e = (id: string, from: string, fp: string, to: string, tp: string): LogicEdge => ({
  id,
  from: { nodeId: from, portId: fp },
  to: { nodeId: to, portId: tp },
});

const interlock: LogicGraph = {
  id: "interlock",
  name: "Interlock",
  description: "Two permissives into an AND block driving a motor.",
  nodes: [
    { id: "di1", tag: "ZS-101", type: "DI", params: { address: "I0.0", invert: false }, inputs: [], outputs: [b("out", "OUT")], confidence: 0.97, needsReview: false, position: { x: 0, y: 0 } },
    { id: "di2", tag: "PS-102", type: "DI", params: { address: "I0.1", invert: false }, inputs: [], outputs: [b("out", "OUT")], confidence: 0.71, needsReview: true, position: { x: 0, y: 160 } },
    { id: "and1", tag: "AND-1", type: "AND", params: { inputs: 2 }, inputs: [b("in1", "IN1"), b("in2", "IN2")], outputs: [b("out", "OUT")], confidence: 0.92, needsReview: false, position: { x: 280, y: 72 } },
    { id: "do1", tag: "M-101", type: "DO", params: { address: "Q0.0", description: "Pump motor" }, inputs: [b("in", "IN")], outputs: [], confidence: 0.95, needsReview: false, position: { x: 560, y: 80 } },
  ],
  edges: [e("e1", "di1", "out", "and1", "in1"), e("e2", "di2", "out", "and1", "in2"), e("e3", "and1", "out", "do1", "in")],
};

const latch: LogicGraph = {
  id: "latch-ton",
  name: "Start/stop latch + TON",
  description: "Start/stop seal-in latch delaying the output with a 5 s on-delay timer.",
  nodes: [
    { id: "start", tag: "HS-201", type: "DI", params: { address: "I1.0", invert: false }, inputs: [], outputs: [b("out", "OUT")], confidence: 0.96, needsReview: false, position: { x: 0, y: 0 } },
    { id: "stop", tag: "HS-202", type: "DI", params: { address: "I1.1", invert: true }, inputs: [], outputs: [b("out", "OUT")], confidence: 0.88, needsReview: false, position: { x: 0, y: 160 } },
    { id: "sr", tag: "SR-1", type: "SR", params: { resetDominant: true }, inputs: [b("s", "S"), b("r", "R")], outputs: [b("q", "Q")], confidence: 0.83, needsReview: false, position: { x: 280, y: 72 } },
    { id: "ton", tag: "TON-1", type: "TON", params: { presetSeconds: 5 }, inputs: [b("in", "IN")], outputs: [b("q", "Q")], confidence: 0.64, needsReview: true, position: { x: 540, y: 88 } },
    { id: "out", tag: "XV-201", type: "DO", params: { address: "Q1.0", description: "Valve open" }, inputs: [b("in", "IN")], outputs: [], confidence: 0.94, needsReview: false, position: { x: 800, y: 88 } },
  ],
  edges: [e("e1", "start", "out", "sr", "s"), e("e2", "stop", "out", "sr", "r"), e("e3", "sr", "q", "ton", "in"), e("e4", "ton", "q", "out", "in")],
};

const pid: LogicGraph = {
  id: "tank-pid",
  name: "Tank level PID",
  description: "Level transmitter and setpoint into a PID driving the inlet valve.",
  nodes: [
    { id: "lt", tag: "LT-301", type: "AI", params: { address: "IW64", rangeMin: 0, rangeMax: 100, unit: "%" }, inputs: [], outputs: [a("pv", "PV")], confidence: 0.93, needsReview: false, position: { x: 0, y: 0 } },
    { id: "sp", tag: "LIC-301.SP", type: "AI", params: { value: 60, unit: "%" }, inputs: [], outputs: [a("sp", "SP")], confidence: 0.58, needsReview: true, position: { x: 0, y: 160 } },
    { id: "pid", tag: "LIC-301", type: "PID", params: { kp: 1.2, ti: 30, td: 0, outMin: 0, outMax: 100, reverse: false }, inputs: [a("pv", "PV"), a("sp", "SP")], outputs: [a("cv", "CV")], confidence: 0.86, needsReview: false, position: { x: 280, y: 64 } },
    { id: "lv", tag: "LV-301", type: "AO", params: { address: "QW80", unit: "%" }, inputs: [a("in", "IN")], outputs: [], confidence: 0.91, needsReview: false, position: { x: 560, y: 88 } },
  ],
  edges: [e("e1", "lt", "pv", "pid", "pv"), e("e2", "sp", "sp", "pid", "sp"), e("e3", "pid", "cv", "lv", "in")],
};

export const defaultGraph: LogicGraph = interlock;
export const sampleGraphs: LogicGraph[] = [interlock, latch, pid];


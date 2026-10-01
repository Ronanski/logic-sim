import { describe, expect, it } from "vitest";

import { SimulationEngine, makePortKey } from "@/lib/logic-graph/engine";
import { convertGraphJson, getSampleGraphImport, stripNonEnglish } from "../graph-json";

const ORInputs = [
  "IN-03B-55", "IN-03B-61", "IN-03B-67", "IN-03B-75", "IN-03C-55", "IN-03C-76", "IN-03D-61", "IN-03E-60", "IN-03E-71",
  "IN-03F-56", "IN-03F-61", "IN-03F-67", "IN-03F-71", "IN-03F-77", "IN-03G-61", "IN-03H-67", "IN-03H-61", "IN-03H-54",
];
const MFT = ["OUT-MFT2", "OUT-MFT1", "OUT-MFT-A", "OUT-MFT-B", "OUT-MASTER"];

function run(engine: SimulationEngine, n: number) {
  let res = engine.step(100);
  for (let i = 1; i < n; i++) res = engine.step(100);
  return res.signals;
}

describe("graph JSON import", () => {
  it("maps types and lays out inputs left, outputs right", () => {
    const { graph, items } = getSampleGraphImport();
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    expect(byId.get("SR-1")!.type).toBe("SR");
    expect(byId.get("TIMER-TR254")!.type).toBe("TP");
    expect(byId.get("TIMER-TR254")!.params.durationSec).toBe(1);
    expect(byId.get("IN-03B-55")!.type).toBe("DI");
    expect(byId.get("OUT-MASTER")!.type).toBe("DO");
    const maxIn = Math.max(...graph.nodes.filter((n) => n.type === "DI").map((n) => n.position!.x));
    const minOut = Math.min(...graph.nodes.filter((n) => n.type === "DO").map((n) => n.position!.x));
    const gates = graph.nodes.filter((n) => n.type !== "DI" && n.type !== "DO").map((n) => n.position!.x);
    expect(Math.min(...gates)).toBeGreaterThan(maxIn);
    expect(Math.max(...gates)).toBeLessThan(minOut);
    expect(items.map((i) => i.targetId).sort()).toEqual(["OUT-MFT-A", "OUT-MFT-B", "TIMER-TR254"]);
    expect(items.every((i) => i.advisory)).toBe(true);
  });

  it.each(ORInputs)("forcing %s sets the latch, MFT on, NO BOILER TRIP off", (input) => {
    const { graph } = getSampleGraphImport();
    const engine = new SimulationEngine(graph);
    let s = run(engine, 3);
    expect(s[makePortKey("OUT-NOBOILERTRIP", "out")]).toBe(true);
    for (const o of MFT) expect(s[makePortKey(o, "out")]).toBe(false);

    engine.setInput(input, "out", true);
    s = run(engine, 3);
    expect(s[makePortKey("SR-1", "q")]).toBe(true);
    for (const o of MFT) expect(s[makePortKey(o, "out")]).toBe(true);
    expect(s[makePortKey("OUT-NOBOILERTRIP", "out")]).toBe(false);

    // Latch holds after the trip input clears (no purge reset yet)
    engine.setInput(input, "out", false);
    s = run(engine, 3);
    expect(s[makePortKey("SR-1", "q")]).toBe(true);
  });

  it("purge completed pulse resets the latch once trips clear", () => {
    const { graph } = getSampleGraphImport();
    const engine = new SimulationEngine(graph);
    engine.setInput("IN-03H-54", "out", true);
    run(engine, 2);
    engine.setInput("IN-03H-54", "out", false);
    engine.setInput("IN-02-65", "out", true);
    const s = run(engine, 3);
    expect(s[makePortKey("SR-1", "q")]).toBe(false);
  });

  it("strips CJK characters from labels", () => {
    expect(stripNonEnglish("MFT 主燃料跳闸 ")).toBe("MFT");
    const { graph } = convertGraphJson({
      nodes: [{ id: "a", tag: "鍋爐 TRIP", type: "signal", params: { role: "input", description: "跳闸 BOILER" }, ports: [{ id: "O1", dir: "out" }] }],
      edges: [],
    });
    expect(graph.nodes[0].tag).toBe("TRIP");
    expect(graph.nodes[0].params.description).toBe("BOILER");
  });

  it("rejects malformed input with a readable error", () => {
    expect(() => convertGraphJson("{nodes:")).toThrow(/not valid JSON/);
    expect(() => convertGraphJson({ nodes: "x" })).toThrow(/expected format/);
  });
});

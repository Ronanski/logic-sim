import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeDxf, parseDxfText } from "../dxf-parser";
import { convertGraphJson } from "../graph-json";

const eq = (a: unknown, b: unknown) => assert.equal(a, b);

function load(name: string) {
  const buf = readFileSync(join(__dirname, "fixtures", name));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { graph, report } = parseDxfText(decodeDxf(ab));
  return { ...convertGraphJson(graph, name), report };
}

describe("DXF import", () => {
  it("DITL-03B: 5 inputs, AND -> TON 60 s, 16 outputs", () => {
    const { graph, report } = load("_9_DITL-03B.dxf");
    eq((graph.nodes.filter((n) => n.type === "DI")).length, 5);
    eq((graph.nodes.filter((n) => n.type === "DO")).length, 16);
    eq((graph.nodes.filter((n) => n.type === "AND")).length, 1);
    const ton = graph.nodes.filter((n) => n.type === "TON");
    eq((ton).length, 1);
    eq(ton[0].params.durationSec, 60);
    eq((report).length, 0);
  });

  it("DITL-03A still parses with its pulse timer", () => {
    const { graph } = load("_8_DITL-03A.dxf");
    eq((graph.nodes.filter((n) => n.type === "DI")).length, 21);
    eq((graph.nodes.filter((n) => n.type === "TP")).length, 1);
  });

  it("DITL-13: PULSE DELAY is recognised as TP, OFF DELAY as TOF, no unknown labels", () => {
    const { graph, report } = load("_27_DITL-13.dxf");
    eq(graph.nodes.some((n) => n.type === "TOF"), true);
    eq(graph.nodes.some((n) => n.type === "TP"), true);
    eq((report.filter((r) => r.startsWith("UNKNOWN LABEL"))).length, 0);
  });

  it("unknown node types are flagged for review instead of becoming AND silently", () => {
    const { graph } = convertGraphJson(
      { nodes: [{ id: "X1", tag: "X", type: "XOR", ports: [{ id: "I1", dir: "in" }, { id: "O1", dir: "out" }] }], edges: [] },
      "t",
    );
    eq(graph.nodes[0].needsReview, true);
  });
});

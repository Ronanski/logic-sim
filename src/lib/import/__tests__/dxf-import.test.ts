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

  it("DITL-03B: terminals carry sheet-table cells and sit on the row grid", () => {
    const { graph } = load("_9_DITL-03B.dxf");
    const di = graph.nodes.find((n) => n.tag === "25A-58")!;
    eq(di.params.rowNo, 2);
    eq(di.params.loc, "HVP SOFT STARTER");
    const dos = graph.nodes.filter((n) => n.type === "DO");
    const irp = dos.find((n) => n.params.rowNo === 55)!;
    eq(irp.params.loc, "IRP");
    eq(String(irp.params.to).startsWith("03A-02"), true);
    // same sheet row -> same screen Y on both sides (row 2 vs row 52)
    const y = (n: { position?: { y: number } }) => n.position!.y;
    eq(y(di), y(dos.find((n) => n.params.rowNo === 52)!));
  });

  it("DITL-03A still parses with its pulse timer", () => {
    const { graph } = load("_8_DITL-03A.dxf");
    eq((graph.nodes.filter((n) => n.type === "DI")).length, 21);
    eq((graph.nodes.filter((n) => n.type === "TP")).length, 1);
    eq(!!graph.geometry && Object.keys(graph.geometry.edgePaths).length > 0, true);
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

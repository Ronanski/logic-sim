import { parseDxfFile } from "./dxf-parser";
import { convertGraphJson } from "./graph-json";
import type { LogicGraph } from "@/lib/logic-graph/types";
import type { ReviewItem } from "@/lib/review/review-store";

export interface DxfImportResult {
  fileName: string;
  ok: boolean;
  error?: string;
  graph?: LogicGraph;
  items: ReviewItem[];
  /** Parser report lines (unknown labels, broken nets, nodes to review). */
  report: string[];
  /** True when the sheet needs a human look. */
  check: boolean;
  counts: { inputs: number; outputs: number; gates: number };
}

const emptyCounts = { inputs: 0, outputs: 0, gates: 0 };

/** Parse one DXF entirely in the browser (no server, no Python). */
export async function importDxf(file: File): Promise<DxfImportResult> {
  try {
    const { graph: raw, report } = await parseDxfFile(file);
    const { graph, items } = convertGraphJson(raw, file.name.replace(/\.dxf$/i, ""));
    const counts = {
      inputs: graph.nodes.filter((n) => n.type === "DI").length,
      outputs: graph.nodes.filter((n) => n.type === "DO").length,
      gates: graph.nodes.filter((n) => n.type !== "DI" && n.type !== "DO").length,
    };
    return { fileName: file.name, ok: true, graph, items, report, check: report.length > 0, counts };
  } catch (err) {
    return {
      fileName: file.name,
      ok: false,
      error: err instanceof Error ? err.message : "Could not read this DXF.",
      items: [],
      report: [],
      check: true,
      counts: emptyCounts,
    };
  }
}

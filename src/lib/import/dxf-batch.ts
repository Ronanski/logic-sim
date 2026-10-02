import { parseDrawing } from "./parse-drawing.functions";
import type { LogicGraph } from "@/lib/logic-graph/types";
import type { ReviewItem } from "@/lib/review/review-store";

export interface DxfImportResult {
  fileName: string;
  ok: boolean;
  error?: string;
  graph?: LogicGraph;
  items: ReviewItem[];
  report: string[];
  check: boolean;
  counts: { inputs: number; outputs: number; gates: number };
}

const emptyCounts = { inputs: 0, outputs: 0, gates: 0 };

/**
 * DXF import entrypoint. Parsing now occurs through the server function so the backend
 * produces the authoritative graph + physical geometry; the browser only renders it.
 */
export async function importDxf(file: File): Promise<DxfImportResult> {
  try {
    const result = await parseDrawing(file);
    const counts = {
      inputs: result.graph.nodes.filter((n) => n.type === "DI").length,
      outputs: result.graph.nodes.filter((n) => n.type === "DO").length,
      gates: result.graph.nodes.filter((n) => n.type !== "DI" && n.type !== "DO").length,
    };
    const report = result.report ?? [];
    return { fileName: file.name, ok: true, graph: result.graph, items: result.items, report, check: report.length > 0, counts };
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

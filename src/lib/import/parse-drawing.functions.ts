import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getMockImport, type ReviewItem } from "@/lib/review/review-store";
import { parseDxfFile } from "@/lib/import/dxf-parser";
import { convertGraphJson } from "@/lib/import/graph-json";
import type { LogicGraph } from "@/lib/logic-graph/types";

export const ALLOWED_EXTENSIONS = [".dxf", ".dwg", ".pdf"] as const;
export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

export interface ParseResult {
  graph: LogicGraph;
  items: ReviewItem[];
  report?: string[];
  source: "dxf-server" | "api" | "mock";
}

const resultSchema = z.object({
  graph: z.object({
    id: z.string(),
    name: z.string(),
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
  }).passthrough(),
  items: z.array(z.any()).default([]),
});

export const parseDrawingFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data.");
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("No file received.");
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
      throw new Error("Only .dxf, .dwg and .pdf files are supported.");
    }
    if (file.size > MAX_FILE_BYTES) throw new Error("File is larger than 20 MB.");
    return { file };
  })
  .handler(async ({ data }): Promise<ParseResult> => {
    const ext = data.file.name.slice(data.file.name.lastIndexOf(".")).toLowerCase();
    if (ext === ".dxf") {
      // DXF parsing is authoritative server-side. The returned graph already contains
      // the physical net geometry used by the simulator renderer.
      const raw = await parseDxfFile(data.file);
      const converted = convertGraphJson(raw.graph, data.file.name.replace(/\.dxf$/i, ""));
      return { graph: converted.graph, items: converted.items, report: raw.report, source: "dxf-server" };
    }
    const url = process.env["PARSER_API_URL"]?.trim();
    if (!url) {
      return { ...getMockImport(data.file.name), source: "mock" };
    }
    const body = new FormData();
    body.append("file", data.file, data.file.name);
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", body });
    } catch (err) {
      console.error("Parser API unreachable", err);
      throw new Error("The drawing parser could not be reached. Try again later.");
    }
    if (!res.ok) {
      console.error("Parser API error", res.status, await res.text().catch(() => ""));
      throw new Error(`The drawing parser rejected the file (status ${res.status}).`);
    }
    const parsed = resultSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new Error("The drawing parser returned an unreadable result.");
    return {
      graph: parsed.data.graph as unknown as LogicGraph,
      items: parsed.data.items as ReviewItem[],
      source: "api",
    };
  });

/** Send a drawing to the parser (or get a mock graph when PARSER_API_URL is empty). */
export function parseDrawing(file: File): Promise<ParseResult> {
  const fd = new FormData();
  fd.append("file", file);
  return parseDrawingFn({ data: fd });
}

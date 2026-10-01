import type { LogicNodeType } from "@/lib/logic-graph/types";
import defaults from "./default-library.json";

/** Where a pattern is matched: CAD block name, CAD layer name, or free-text keyword (tag/label). */
export type MappingSource = "block" | "layer" | "keyword";

export interface SymbolMapping {
  id: string;
  source: MappingSource;
  /** Case-insensitive. Block/layer: exact name. Keyword: whole-word match or tag prefix (e.g. "FIC" matches "FIC-101"). */
  pattern: string;
  blockType: LogicNodeType;
  /** Higher wins when several rules match. */
  priority: number;
}

export interface SymbolLibrary {
  version: number;
  mappings: SymbolMapping[];
}

export const BLOCK_TYPES: LogicNodeType[] = [
  "DI", "DO", "AI", "AO", "AND", "OR", "NOT", "SR", "TON", "PID", "COMP",
];
export const SOURCES: MappingSource[] = ["block", "layer", "keyword"];

const STORAGE_KEY = "logicsim.symbol-library.v1";

export function defaultLibrary(): SymbolLibrary {
  return structuredClone(defaults as SymbolLibrary);
}

export function loadLibrary(): SymbolLibrary {
  if (typeof window === "undefined") return defaultLibrary();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLibrary();
    return parseLibrary(raw);
  } catch {
    return defaultLibrary();
  }
}

export function saveLibrary(lib: SymbolLibrary) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
}

/** Validates JSON text and returns a library; throws on invalid input. */
export function parseLibrary(text: string): SymbolLibrary {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.mappings)) throw new Error("Missing 'mappings' array");
  const mappings: SymbolMapping[] = data.mappings.map((m: any, i: number) => {
    if (!SOURCES.includes(m.source)) throw new Error(`Mapping ${i}: invalid source`);
    if (typeof m.pattern !== "string" || !m.pattern.trim()) throw new Error(`Mapping ${i}: empty pattern`);
    if (!BLOCK_TYPES.includes(m.blockType)) throw new Error(`Mapping ${i}: invalid block type`);
    return {
      id: typeof m.id === "string" ? m.id : crypto.randomUUID(),
      source: m.source,
      pattern: m.pattern.trim(),
      blockType: m.blockType,
      priority: Number.isFinite(m.priority) ? m.priority : 50,
    };
  });
  return { version: Number(data.version) || 1, mappings };
}

export interface SymbolQuery {
  blockName?: string;
  layerName?: string;
  /** Free text such as a tag ("FIC-101") or label. */
  text?: string;
}

export interface SymbolMatch {
  mapping: SymbolMapping;
  blockType: LogicNodeType;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mappingMatches(m: SymbolMapping, q: SymbolQuery): boolean {
  const p = m.pattern.toUpperCase();
  if (m.source === "block") return (q.blockName ?? "").trim().toUpperCase() === p;
  if (m.source === "layer") return (q.layerName ?? "").trim().toUpperCase() === p;
  const text = (q.text ?? "").toUpperCase();
  if (!text) return false;
  // Whole word, or ISA-style tag prefix followed by separator/digit (FIC-101, FIC101).
  return new RegExp(`(^|[^A-Z0-9])${escapeRe(p)}(?=$|[^A-Z])`).test(text);
}

/** Rule-based resolution: all matching rules sorted by priority (desc), then source specificity. */
export function resolveSymbol(lib: SymbolLibrary, q: SymbolQuery): SymbolMatch[] {
  const rank: Record<MappingSource, number> = { block: 3, layer: 2, keyword: 1 };
  return lib.mappings
    .filter((m) => mappingMatches(m, q))
    .sort((a, b) => b.priority - a.priority || rank[b.source] - rank[a.source] || b.pattern.length - a.pattern.length)
    .map((m) => ({ mapping: m, blockType: m.blockType }));
}

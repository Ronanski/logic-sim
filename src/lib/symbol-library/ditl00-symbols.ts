/**
 * Canonical control-symbol geometry referenced from DITL-00 (symbol legend).
 * The paths are normalized to a 0..100 viewBox so the native DXF gate bounds
 * determine the rendered size.
 */
export interface Ditl00Symbol {
  id: string;
  type: "AND" | "OR" | "NOT";
  source: string;
  viewBox: string;
  path: string;
}

export const DITL00_SYMBOLS: Record<"AND" | "OR" | "NOT", Ditl00Symbol> = {
  AND: {
    id: "ditl00-and",
    type: "AND",
    source: "DITL-00.dxf",
    viewBox: "0 0 100 100",
    path: "M1,1 H55 A44,49 0 0 1 55,99 H1 Z",
  },
  OR: {
    id: "ditl00-or",
    type: "OR",
    source: "DITL-00.dxf",
    viewBox: "0 0 100 100",
    path: "M1,1 V99 C55,99 85,75 99,50 C85,25 55,1 1,1 Z",
  },
  NOT: {
    id: "ditl00-not",
    type: "NOT",
    source: "DITL-00.dxf",
    viewBox: "0 0 100 100",
    path: "M1,12 L89,50 L1,88 Z M89,50 a5,8.75 0 1,0 10,0 a5,8.75 0 1,0 -10,0 Z",
  },
};

export type PortDataType = "bool" | "analog";

export interface LogicPort {
  id: string;
  name: string;
  dataType: PortDataType;
}

export type LogicParamValue = number | string | boolean;

export type LogicNodeType =
  | "DI" // digital input
  | "DO" // digital output
  | "AI" // analog input
  | "AO" // analog output
  | "AND"
  | "OR"
  | "NOT"
  | "SR" // set/reset latch
  | "TON" // on-delay timer
  | "TOF" // off-delay timer
  | "TP" // pulse timer
  | "PID"
  | "COMP" // comparator
  | "COMPARATOR";

export interface LogicNode {
  id: string;
  /** Plant tag from the drawing, e.g. "HS-101". */
  tag: string;
  type: LogicNodeType;
  params: Record<string, LogicParamValue>;
  inputs: LogicPort[];
  outputs: LogicPort[];
  /** Parser confidence, 0..1. */
  confidence: number;
  needsReview: boolean;
  /** Optional layout hint for rendering. */
  position?: { x: number; y: number };
  /** Native drawing geometry. Port y values are normalized 0..1 inside the node box. */
  geometry?: {
    width: number;
    height: number;
    ports?: Record<string, { side: "L" | "R"; y: number }>;
  };
}

export interface LogicEdgeEndpoint {
  nodeId: string;
  portId: string;
}

export interface LogicEdge {
  id: string;
  from: LogicEdgeEndpoint;
  to: LogicEdgeEndpoint;
}

export interface LogicPoint {
  x: number;
  y: number;
}

/** Geometry preserved from an imported drawing. Screen coordinates are produced by graph-json. */
export interface ImportedGeometry {
  source: "DXF";
  edgePaths: Record<string, LogicPoint[]>;
}

export interface LogicGraph {
  id: string;
  name: string;
  description?: string;
  nodes: LogicNode[];
  edges: LogicEdge[];
  /** Original DXF path geometry, when available. The renderer should prefer these paths over re-routing. */
  geometry?: ImportedGeometry;
}


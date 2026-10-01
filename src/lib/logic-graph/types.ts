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

export interface LogicGraph {
  id: string;
  name: string;
  description?: string;
  nodes: LogicNode[];
  edges: LogicEdge[];
}


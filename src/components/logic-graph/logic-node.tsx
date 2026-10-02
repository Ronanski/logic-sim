import { Handle, Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { LogicNode } from "@/lib/logic-graph/types";
import { GATE_W, TERMINAL_W, isSymbolGate, nodeHeight, terminalText } from "@/lib/import/graph-json";

export type LogicFlowNode = Node<
  {
    node: LogicNode;
    /** Live state for terminals: input switch position or output lamp. */
    value?: boolean;
    /** Flip an input directly on the canvas. */
    onToggle?: () => void;
  },
  "logic"
>;

const ROW = 20;
const HEADER = 28;
const TIMERS = ["TON", "TOF", "TP"];
/** Gates whose ports are obvious do not need port labels. */
const PLAIN = ["AND", "OR", "NOT"];
/**
 * Logic gate symbols drawn in a 100 x 100 box that is stretched to the node size
 * (AND = flat back + round front, OR = bar + pointed front, NOT = triangle + bubble).
 */
const SYMBOLS: Record<string, string> = {
  AND: "M1,1 H55 A44,49 0 0 1 55,99 H1 Z",
  OR: "M1,1 V99 C55,99 85,75 99,50 C85,25 55,1 1,1 Z",
  NOT: "M1,12 L89,50 L1,88 Z M89,50 a5,8.75 0 1,0 10,0 a5,8.75 0 1,0 -10,0 Z",
};

function timerLabel(node: LogicNode): string | null {
  if (!TIMERS.includes(node.type)) return null;
  const v = Number(node.params.durationSec ?? node.params.presetSeconds);
  if (!Number.isFinite(v)) return null;
  return v >= 60 && v % 60 === 0 ? `${v / 60} min` : `${v} s`;
}

export function LogicNodeView({ data, selected }: NodeProps<LogicFlowNode>) {
  const { node, value, onToggle } = data;
  // Zoomed-out sheets get proportionally larger text/ports so labels stay readable (1 = normal size).
  const b = 1;
  const handleSize = { width: 6 * b, height: 6 * b };

  // Signal terminals: one box with tag, address and the full description (text wraps, nothing is cut off).
  if (node.type === "DI" || node.type === "DO") {
    const { desc, addr, showDesc } = terminalText(node);
    // Terminal text grows with zoom-out, but only up to 1.25x so the wrapped text always fits its box.
    const tb = Math.min(b, 1.25);
    return (
      <div
        className={cn(
          "relative flex flex-col justify-center gap-0 overflow-visible rounded-md border bg-card px-2 text-card-foreground",
          selected && "border-primary",
        )}
        style={{ width: TERMINAL_W, height: nodeHeight(node) }}
        title={[node.tag, desc, addr].filter(Boolean).join(" · ")}
      >
        {node.inputs.map((p) => (
          <Handle key={p.id} type="target" position={Position.Left} id={p.id} style={handleSize} />
        ))}
        {node.outputs.map((p) => (
          <Handle key={p.id} type="source" position={Position.Right} id={p.id} style={handleSize} />
        ))}
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-start gap-2 font-semibold" style={{ fontSize: 12 * tb, lineHeight: `${Math.round(14 * tb)}px` }}>
              {node.needsReview && <AlertTriangle className="h-3 w-3 shrink-0 text-primary" aria-label="Needs review" />}
              <span className="min-w-0 break-words">{node.tag}</span>
              {addr && (
                <span className="ml-auto shrink-0 font-mono font-normal text-muted-foreground" style={{ fontSize: 11 * tb }}>
                  {addr}
                </span>
              )}
            </span>
            {showDesc && (
              <span className="break-words text-muted-foreground" style={{ fontSize: 11 * tb, lineHeight: `${Math.round(14 * tb)}px` }}>
                {desc}
              </span>
            )}
          </div>
          {node.type === "DI" && onToggle && (
            <Switch
              className="nodrag nopan"
              checked={!!value}
              onCheckedChange={() => onToggle()}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Force ${node.tag}`}
            />
          )}
          {node.type === "DO" && (
            <span
              className={cn("shrink-0 rounded-full border", value ? "border-primary bg-primary" : "bg-muted")}
              style={{ width: 16 * Math.min(b, 1.4), height: 16 * Math.min(b, 1.4) }}
              aria-label={value ? "On" : "Off"}
            />
          )}
        </div>
      </div>
    );
  }

  // AND / OR / NOT drawn as real gate symbols. Inputs are spread evenly on the left, the output sits on the middle right.
  if (isSymbolGate(node)) {
    const n = Math.max(node.inputs.length, 1);
    const pct = (i: number) => ((i + 1) / (n + 1)) * 100;
    const showTag = node.tag && node.tag.toUpperCase() !== node.type;
    return (
      <div className="relative" style={{ width: GATE_W, height: nodeHeight(node) }} title={`${node.type}${showTag ? ` · ${node.tag}` : ""}`}>
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <path
            d={SYMBOLS[node.type]}
            className={cn("fill-card", selected ? "stroke-primary" : "stroke-muted-foreground")}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          className="pointer-events-none absolute flex flex-col items-center"
          style={{ top: "50%", left: node.type === "NOT" ? "38%" : "55%", transform: "translate(-50%, -50%)" }}
        >
          <span className="flex items-center gap-1 font-semibold" style={{ fontSize: 12 * b }}>
            {node.needsReview && <AlertTriangle className="h-3 w-3 shrink-0 text-primary" aria-label="Needs review" />}
            {node.type}
          </span>
          {showTag && (
            <span className="font-mono text-muted-foreground" style={{ fontSize: 11 * b }}>
              {node.tag}
            </span>
          )}
        </div>
        {node.inputs.map((p, i) => (
          <div key={p.id}>
            <Handle type="target" position={Position.Left} id={p.id} style={{ ...handleSize, top: `${pct(i)}%` }} />
            {n > 1 && (
              <span
                className="absolute left-2 text-muted-foreground"
                style={{ top: `calc(${pct(i)}% - ${ROW / 2}px)`, fontSize: 11 * b, lineHeight: `${ROW}px` }}
              >
                {p.name}
              </span>
            )}
          </div>
        ))}
        {node.outputs.map((p) => (
          <Handle key={p.id} type="source" position={Position.Right} id={p.id} style={{ ...handleSize, top: "50%" }} />
        ))}
      </div>
    );
  }

  // Logic blocks: type on top, only the ports that matter below.
  const rows = Math.max(node.inputs.length, node.outputs.length, 1);
  const labelPorts = node.inputs.length > 1 || !PLAIN.includes(node.type);
  const labelOut = !PLAIN.includes(node.type);
  const extra = timerLabel(node);
  const showTag = node.tag && node.tag.toUpperCase() !== node.type;

  return (
    <div
      className={cn("rounded-md border bg-card text-card-foreground", selected && "border-primary")}
      style={{ width: GATE_W, height: nodeHeight(node) }}
      title={`${node.type}${showTag ? ` · ${node.tag}` : ""}${extra ? ` · ${extra}` : ""}`}
    >
      <div className="flex items-center gap-2 border-b px-2" style={{ height: HEADER }}>
        {node.needsReview && <AlertTriangle className="h-3 w-3 shrink-0 text-primary" aria-label="Needs review" />}
        <span className="font-semibold" style={{ fontSize: 12 * b }}>{node.type}</span>
        {(extra || showTag) && (
          <span className="ml-auto truncate font-mono text-muted-foreground" style={{ fontSize: 11 * b }}>{extra ?? node.tag}</span>
        )}
      </div>
      <div className="relative" style={{ height: rows * ROW + 8 }}>
        {node.inputs.map((p, i) => (
          <div key={p.id}>
            <Handle type="target" position={Position.Left} id={p.id} style={{ ...handleSize, top: 4 + i * ROW + ROW / 2 }} />
            {labelPorts && (
              <span className="absolute left-2 text-muted-foreground" style={{ top: 4 + i * ROW, fontSize: 11 * b, lineHeight: `${ROW}px` }}>
                {p.name}
              </span>
            )}
          </div>
        ))}
        {node.outputs.map((p, i) => (
          <div key={p.id}>
            <Handle type="source" position={Position.Right} id={p.id} style={{ ...handleSize, top: 4 + i * ROW + ROW / 2 }} />
            {labelOut && (
              <span className="absolute right-2 text-muted-foreground" style={{ top: 4 + i * ROW, fontSize: 11 * b, lineHeight: `${ROW}px` }}>
                {p.name}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

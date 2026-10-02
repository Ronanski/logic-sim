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

const TIMERS = ["TON", "TOF", "TP"];
/** Gates whose ports are obvious do not need port labels. */

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

  // Signal terminals: every box has the same size. A short plant tag (e.g. 09-74) gets its own left column;
  // the description (or, when there is none, the tag text itself) fills the rest and wraps. Nothing is cut off.
  if (node.type === "DI" || node.type === "DO") {
    const { desc, addr, showDesc } = terminalText(node);
    const shortTag = node.tag.length <= 10 && !/\s/.test(node.tag.trim());
    const text = showDesc ? desc : shortTag ? "" : node.tag;
    const tagCol = shortTag || showDesc;
    return (
      <div
        className={cn(
          "relative flex items-center gap-3 overflow-visible rounded-md border border-foreground/30 bg-card px-3 text-card-foreground",
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
        {tagCol && (
          <span className="flex w-16 shrink-0 items-center gap-1 text-[13px] font-semibold leading-4 tracking-wide text-foreground">
            {node.needsReview && <AlertTriangle className="h-3 w-3 shrink-0 text-primary" aria-label="Needs review" />}
            <span className="min-w-0 break-words">{node.tag}</span>
          </span>
        )}
        <span className="min-w-0 flex-1 break-words text-[13px] font-medium leading-4 tracking-wide text-foreground">{text}</span>
        {addr && <span className="shrink-0 font-mono text-[12px] leading-4 text-secondary-foreground">{addr}</span>}
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
            className={cn("h-4 w-4 shrink-0 rounded-full border", value ? "border-primary bg-primary" : "border-foreground/40 bg-muted")}
            aria-label={value ? "On" : "Off"}
          />
        )}
      </div>
    );
  }

  // AND / OR / NOT drawn as real gate symbols. Inputs are spread evenly on the left, the output sits on the middle right.
  if (isSymbolGate(node)) {
    const n = Math.max(node.inputs.length, 1);
    const isMultiInput = n >= 4;
    const pct = (i: number) => ((i + 1) / (n + 1)) * 100;
    const showTag = node.tag && node.tag.toUpperCase() !== node.type;
    const h = nodeHeight(node);

    return (
      <div className="relative" style={{ width: GATE_W, height: h }} title={`${node.type}${showTag ? ` · ${node.tag}` : ""}`}>
        {isMultiInput ? (
          <>
            {/* CAD-style vertical input collector bus rail */}
            <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
              {/* Vertical bus bar */}
              <line
                x1="10"
                y1="14"
                x2="10"
                y2={h - 14}
                className={selected ? "stroke-primary" : "stroke-foreground/70"}
                strokeWidth={2}
              />
              {/* Input tap stubs */}
              {node.inputs.map((_, i) => {
                const py = (pct(i) / 100) * h;
                return (
                  <line
                    key={i}
                    x1="0"
                    y1={py}
                    x2="10"
                    y2={py}
                    className={selected ? "stroke-primary" : "stroke-foreground/70"}
                    strokeWidth={1.5}
                  />
                );
              })}
              {/* Connection line from bus bar to central symbol */}
              <line
                x1="10"
                y1={h / 2}
                x2="22"
                y2={h / 2}
                className={selected ? "stroke-primary" : "stroke-foreground/70"}
                strokeWidth={2}
              />
            </svg>
            {/* Compact symbol in center */}
            <div
              className="absolute flex items-center justify-center rounded-full border bg-card shadow-xs"
              style={{
                left: "22px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "36px",
                height: "36px",
              }}
            >
              <span className="font-bold text-xs">{node.type}</span>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
        {node.inputs.map((p, i) => (
          <div key={p.id}>
            <Handle type="target" position={Position.Left} id={p.id} style={{ ...handleSize, top: `${pct(i)}%` }} />
            {n > 1 && !isMultiInput && (
              <span
                className="absolute left-2 text-muted-foreground"
                style={{ top: `calc(${pct(i)}% - 10px)`, fontSize: 11 * b, lineHeight: "20px" }}
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

  // Logic blocks: a compact box with the type name in the middle (like the AND / OR / NOT labels on the sheet).
  // Port names are only shown where they matter (SR: S / R); timers show their time.
  const inN = Math.max(node.inputs.length, 1);
  const pct = (i: number, n: number) => ((i + 1) / (n + 1)) * 100;
  const namedPorts = node.type === "SR";
  const extra = timerLabel(node);
  const showTag = node.tag && node.tag.toUpperCase() !== node.type;
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-md border-2 border-foreground/70 bg-secondary text-secondary-foreground",
        selected && "border-primary",
      )}
      style={{ width: GATE_W, height: nodeHeight(node) }}
      title={`${node.type}${showTag ? ` · ${node.tag}` : ""}${extra ? ` · ${extra}` : ""}`}
    >
      <span className="flex items-center gap-1 text-[14px] font-bold leading-4 text-foreground">
        {node.needsReview && <AlertTriangle className="h-3 w-3 shrink-0 text-primary" aria-label="Needs review" />}
        {node.type}
      </span>
      {(extra || showTag) && <span className="font-mono text-[12px] leading-4 text-secondary-foreground">{extra ?? node.tag}</span>}
      {node.inputs.map((p, i) => (
        <div key={p.id}>
          <Handle type="target" position={Position.Left} id={p.id} style={{ ...handleSize, top: `${pct(i, inN)}%` }} />
          {namedPorts && (
            <span className="absolute left-1.5 text-[11px] font-medium text-foreground" style={{ top: `calc(${pct(i, inN)}% - 7px)`, lineHeight: "14px" }}>
              {p.name}
            </span>
          )}
        </div>
      ))}
      {node.outputs.map((p) => (
        <div key={p.id}>
          <Handle type="source" position={Position.Right} id={p.id} style={{ ...handleSize, top: "50%" }} />
          {namedPorts && (
            <span className="absolute right-1.5 text-[11px] font-medium text-foreground" style={{ top: "calc(50% - 7px)", lineHeight: "14px" }}>
              {p.name}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

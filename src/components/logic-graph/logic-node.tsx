import { Handle, Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { LogicNode } from "@/lib/logic-graph/types";
import { GATE_W, TERMINAL_H, TERMINAL_W, nodeHeight } from "@/lib/import/graph-json";

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

function timerLabel(node: LogicNode): string | null {
  if (!TIMERS.includes(node.type)) return null;
  const v = Number(node.params.durationSec ?? node.params.presetSeconds);
  if (!Number.isFinite(v)) return null;
  return v >= 60 && v % 60 === 0 ? `${v / 60} min` : `${v} s`;
}

export function LogicNodeView({ data, selected }: NodeProps<LogicFlowNode>) {
  const { node, value, onToggle } = data;
  // Zoomed-out sheets get proportionally larger text/ports so labels stay readable (1 = normal size).
  const b = useStore((st) => Math.round(Math.min(1.8, Math.max(1, 0.85 / st.transform[2])) * 10) / 10);
  const handleSize = { width: 6 * b, height: 6 * b };

  // Signal terminals: one compact box with tag, address and description.
  if (node.type === "DI" || node.type === "DO") {
    const desc = typeof node.params.description === "string" ? node.params.description : "";
    const addr = typeof node.params.address === "string" ? node.params.address : "";
    const showDesc = desc && desc !== node.tag;
    return (
      <div
        className={cn(
          "relative flex flex-col justify-center gap-0 overflow-visible rounded-md border bg-card px-2 text-card-foreground",
          selected && "border-primary",
        )}
        style={{ width: TERMINAL_W, height: TERMINAL_H }}
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
            <span className="flex items-center gap-2 font-semibold" style={{ fontSize: 12 * b, lineHeight: `${Math.round(13 * b)}px` }}>
              {node.needsReview && <AlertTriangle className="h-3 w-3 shrink-0 text-primary" aria-label="Needs review" />}
              <span className="truncate">{node.tag}</span>
              {addr && <span className="ml-auto shrink-0 font-mono font-normal text-muted-foreground" style={{ fontSize: 11 * b }}>{addr}</span>}
            </span>
            {showDesc && (
              <span className="truncate text-muted-foreground" style={{ fontSize: 11 * b, lineHeight: `${Math.round(13 * b)}px` }}>
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

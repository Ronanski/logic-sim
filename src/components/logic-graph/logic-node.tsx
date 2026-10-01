import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LogicNode } from "@/lib/logic-graph/types";

export type LogicFlowNode = Node<{ node: LogicNode }, "logic">;

const ROW = 24;

export function LogicNodeView({ data, selected }: NodeProps<LogicFlowNode>) {
  const { node } = data;
  const rows = Math.max(node.inputs.length, node.outputs.length, 1);

  return (
    <div
      className={cn(
        "w-44 rounded-md border bg-card text-card-foreground",
        selected && "border-primary",
      )}
    >
      <div className="flex h-8 items-center justify-between gap-2 border-b px-2">
        <span className="flex min-w-0 items-center gap-2">
          {node.needsReview && <AlertTriangle className="h-3 w-3 shrink-0 text-primary" aria-label="Needs review" />}
          <span className="truncate text-xs font-semibold">{node.tag}</span>
        </span>
        <Badge variant="secondary" className="h-4 px-2 text-[10px]">
          {node.type}
        </Badge>
      </div>
      {typeof node.params.description === "string" && node.params.description && node.params.description !== node.tag && (
        <div className="truncate border-b px-2 py-2 text-[10px] text-muted-foreground" title={node.params.description}>
          {node.params.description}
        </div>
      )}
      <div className="relative px-2" style={{ height: rows * ROW + 8 }}>
        {node.inputs.map((p, i) => (
          <div key={p.id}>
            <Handle type="target" position={Position.Left} id={p.id} style={{ top: 4 + i * ROW + ROW / 2 }} />
            <span className="absolute left-2 text-[10px] text-muted-foreground" style={{ top: 4 + i * ROW + 4 }}>
              {p.name}
            </span>
          </div>
        ))}
        {node.outputs.map((p, i) => (
          <div key={p.id}>
            <Handle type="source" position={Position.Right} id={p.id} style={{ top: 4 + i * ROW + ROW / 2 }} />
            <span className="absolute right-2 text-[10px] text-muted-foreground" style={{ top: 4 + i * ROW + 4 }}>
              {p.name}
            </span>
          </div>
        ))}
      </div>
      <div className="flex h-6 items-center justify-between border-t px-2 text-[10px] text-muted-foreground">
        <span>{Math.round(node.confidence * 100)}% conf.</span>
        {node.needsReview && (
          <span className="flex items-center gap-1 text-foreground">
            <AlertTriangle className="h-3 w-3" /> Review
          </span>
        )}
      </div>
    </div>
  );
}


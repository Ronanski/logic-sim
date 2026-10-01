import { useMemo, useState, type CSSProperties } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Background, Controls, ReactFlow, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check, RotateCcw, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { LogicNodeView, type LogicFlowNode } from "@/components/logic-graph/logic-node";
import { cn } from "@/lib/utils";
import type { LogicNodeType } from "@/lib/logic-graph/types";
import { openCount, reasonLabel, reviewActions, useReview } from "@/lib/review/review-store";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review — LogicSim" },
      { name: "description", content: "Resolve flagged symbols, lines and text before simulating." },
      { property: "og:title", content: "Review — LogicSim" },
      { property: "og:description", content: "Resolve flagged symbols, lines and text before simulating." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewPage,
});

const nodeTypes = { logic: LogicNodeView };
const blockTypes: LogicNodeType[] = ["DI", "DO", "AI", "AO", "AND", "OR", "NOT", "SR", "TON", "COMP", "PID"];

const flowTheme = {
  "--xy-background-color": "var(--background)",
  "--xy-edge-stroke": "var(--muted-foreground)",
  "--xy-handle-background-color": "var(--muted-foreground)",
  "--xy-handle-border-color": "var(--card)",
  "--xy-controls-button-background-color": "var(--card)",
  "--xy-controls-button-background-color-hover": "var(--accent)",
  "--xy-controls-button-color": "var(--foreground)",
  "--xy-controls-button-border-color": "var(--border)",
  "--xy-background-pattern-dots-color": "var(--border)",
  "--xy-node-boxshadow-selected": "none",
} as CSSProperties;

function ReviewPage() {
  const review = useReview();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const remaining = openCount(review);
  const selected = review.items.find((i) => i.id === selectedId) ?? null;
  const selectedNode = selected?.kind === "node" ? review.graph.nodes.find((n) => n.id === selected.targetId) : undefined;
  const flaggedEdges = new Set(review.items.filter((i) => i.kind === "edge" && i.status === "open").map((i) => i.targetId));

  const nodes: LogicFlowNode[] = useMemo(
    () =>
      review.graph.nodes.map((n, i) => ({
        id: n.id,
        type: "logic",
        position: n.position ?? { x: i * 240, y: 0 },
        data: { node: n },
        selected: selected?.kind === "node" && selected.targetId === n.id,
      })),
    [review.graph.nodes, selected],
  );

  const edges: Edge[] = review.graph.edges.map((ed) => {
    const isSel = selected?.kind === "edge" && selected.targetId === ed.id;
    return {
      id: ed.id,
      source: ed.from.nodeId,
      sourceHandle: ed.from.portId,
      target: ed.to.nodeId,
      targetHandle: ed.to.portId,
      style: {
        stroke: isSel ? "var(--primary)" : "var(--muted-foreground)",
        strokeWidth: isSel ? 3 : 1.5,
        strokeDasharray: flaggedEdges.has(ed.id) ? "6 4" : undefined,
      },
    };
  });

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Review</h1>
          <p className="mt-2 text-sm text-muted-foreground">{review.graph.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={remaining ? "default" : "secondary"}>
            {remaining ? `${remaining} item${remaining === 1 ? "" : "s"} remaining` : "All resolved"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => { reviewActions.reset(); setSelectedId(null); }}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
          <Button size="sm" asChild disabled={remaining > 0 && !review.override}>
            <Link to="/simulate">Go to Simulate</Link>
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Flagged items</CardTitle>
          </CardHeader>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-2 p-4 pt-0">
              {review.items.map((item) => {
                const target =
                  item.kind === "node"
                    ? review.graph.nodes.find((n) => n.id === item.targetId)?.tag
                    : `Wire ${item.targetId}`;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      "flex flex-col gap-2 rounded-md border p-2 text-left transition-colors hover:bg-accent",
                      selectedId === item.id && "border-primary",
                      item.status !== "open" && "opacity-60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{target ?? item.targetId}</span>
                      <Badge variant={item.status === "open" ? "outline" : "secondary"} className="text-[10px]">
                        {item.status === "open" ? reasonLabel[item.reason] : item.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{item.detail}</span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          {selected && selected.status === "open" && (
            <>
              <Separator />
              <CardContent className="flex flex-col gap-2 p-4">
                {selectedNode && (
                  <Select value={selectedNode.type} onValueChange={(v) => reviewActions.reassign(selected.id, v as LogicNodeType)}>
                    <SelectTrigger><SelectValue placeholder="Reassign type" /></SelectTrigger>
                    <SelectContent>
                      {blockTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => reviewActions.approve(selected.id)}>
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                  <Button size="sm" variant="destructive" className="flex-1" onClick={() => reviewActions.remove(selected.id)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>

        <div className="min-h-[480px] overflow-hidden rounded-md border" style={flowTheme}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            nodesDraggable={false}
            onNodeClick={(_, n) => {
              const it = review.items.find((i) => i.kind === "node" && i.targetId === n.id);
              if (it) setSelectedId(it.id);
            }}
            onEdgeClick={(_, ed) => {
              const it = review.items.find((i) => i.kind === "edge" && i.targetId === ed.id);
              if (it) setSelectedId(it.id);
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

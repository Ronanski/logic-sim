import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { LogicNode, LogicParamValue } from "@/lib/logic-graph/types";
import { cn } from "@/lib/utils";

interface Props {
  node: LogicNode | null;
  onParamChange: (key: string, value: LogicParamValue) => void;
  className?: string;
}

export function NodeParamsPanel({ node, onParamChange, className }: Props) {
  return (
    <section className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex h-12 items-center border-b px-4">
        <span className="text-sm font-medium">Node parameters</span>
      </div>
      {!node ? (
        <div className="flex items-center justify-center px-4 py-8">
          <p className="text-center text-xs text-muted-foreground">Select a node to edit its parameters.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 overflow-auto p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{node.tag}</span>
            <div className="flex gap-2">
              <Badge variant="secondary">{node.type}</Badge>
              {node.needsReview && <Badge variant="outline">Needs review</Badge>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            ID {node.id} · confidence {Math.round(node.confidence * 100)}%
          </p>
          {Object.entries(node.params).map(([key, value]) => {
            const id = `param-${node.id}-${key}`;
            if (typeof value === "boolean") {
              return (
                <div key={key} className="flex items-center justify-between gap-2">
                  <Label htmlFor={id}>{key}</Label>
                  <Switch id={id} checked={value} onCheckedChange={(v) => onParamChange(key, v)} />
                </div>
              );
            }
            return (
              <div key={key} className="flex flex-col gap-2">
                <Label htmlFor={id}>{key}</Label>
                <Input
                  id={id}
                  type={typeof value === "number" ? "number" : "text"}
                  value={String(value)}
                  onChange={(ev) =>
                    onParamChange(
                      key,
                      typeof value === "number" ? Number(ev.target.value) : ev.target.value,
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}


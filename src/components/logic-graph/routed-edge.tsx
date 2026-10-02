import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

import { pathFromPoints, type Pt } from "@/lib/logic-graph/route-edges";

const near = (p: Pt | undefined, x: number, y: number) => !!p && Math.abs(p.x - x) < 2 && Math.abs(p.y - y) < 2;

/**
 * Draws the routed wire with square corners. Junction dots mark where wires of one net split or merge;
 * a crossing without a dot is not connected. If the route is stale (node moved), falls back to a plain step wire.
 */
export function RoutedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data }: EdgeProps) {
  const d = data as { points?: Pt[]; junctions?: Pt[] } | undefined;
  const pts = d?.points;
  const ok = !!pts && pts.length >= 2 && near(pts[0], sourceX, sourceY) && near(pts[pts.length - 1], targetX, targetY);
  const path = ok
    ? pathFromPoints(pts!)
    : getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 0 })[0];
  return (
    <>
      <BaseEdge id={id} path={path} style={style} />
      {ok &&
        d?.junctions?.map((j, i) => (
          <circle key={i} cx={j.x} cy={j.y} r={3.5} style={{ fill: style?.stroke as string | undefined, opacity: style?.opacity }} className="pointer-events-none" />
        ))}
    </>
  );
}

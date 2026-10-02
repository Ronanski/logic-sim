import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

import { pathFromPoints, type Pt } from "@/lib/logic-graph/route-edges";

const near = (p: Pt | undefined, x: number, y: number) => !!p && Math.abs(p.x - x) < 2 && Math.abs(p.y - y) < 2;

/** Draws the routed wire. If the route is missing or stale (node moved), falls back to a plain step wire. */
export function RoutedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data }: EdgeProps) {
  const pts = (data as { points?: Pt[] } | undefined)?.points;
  const ok = !!pts && pts.length >= 2 && near(pts[0], sourceX, sourceY) && near(pts[pts.length - 1], targetX, targetY);
  const path = ok
    ? pathFromPoints(pts!)
    : getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 4 })[0];
  return <BaseEdge id={id} path={path} style={style} />;
}

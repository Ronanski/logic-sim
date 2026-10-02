import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

import { pathFromPoints, type Pt } from "@/lib/logic-graph/route-edges";

const near = (p: Pt | undefined, x: number, y: number) => !!p && Math.abs(p.x - x) < 2 && Math.abs(p.y - y) < 2;

/** Arrowhead sits before the target port, following the final route segment. */
function arrowAtTarget(points: Pt[]) {
  let distance = 13;
  for (let i = points.length - 1; i > 0; i--) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 0.01) continue;
    if (distance > length) { distance -= length; continue; }
    const dx = (b.x - a.x) / length;
    const dy = (b.y - a.y) / length;
    const x = b.x - dx * distance;
    const y = b.y - dy * distance;
    return `${x},${y} ${x - dx * 8 - dy * 4},${y - dy * 8 + dx * 4} ${x - dx * 8 + dy * 4},${y - dy * 8 - dx * 4}`;
  }
  return "";
}

/**
 * Draws the routed wire with square corners. Junction dots mark where wires of one net split or merge;
 * a crossing without a dot is not connected. If the route is stale (node moved), falls back to a plain step wire.
 */
export function RoutedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data }: EdgeProps) {
  const d = data as { points?: Pt[]; junctions?: Pt[] } | undefined;
  const pts = d?.points;
  const ok = !!pts && pts.length >= 2 && near(pts[0], sourceX, sourceY) && near(pts[pts.length - 1], targetX, targetY);
  const path = ok && pts
    ? pathFromPoints(pts)
    : getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 0 })[0];
  const arrow = arrowAtTarget(ok && pts ? pts : [{ x: sourceX, y: sourceY }, { x: targetX, y: targetY }]);
  return (
    <>
      <BaseEdge id={id} path={path} style={style} />
      {arrow && <polygon points={arrow} fill={style?.stroke ?? "var(--foreground)"} opacity={style?.opacity} className="pointer-events-none" />}
      {ok &&
        d?.junctions?.map((j, i) => (
          <circle key={i} cx={j.x} cy={j.y} r={3.5} style={{ fill: style?.stroke as string | undefined, opacity: style?.opacity }} className="pointer-events-none" />
        ))}
    </>
  );
}

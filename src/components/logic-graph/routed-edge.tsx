import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

import { pathFromPoints, type Pt } from "@/lib/logic-graph/route-edges";

/**
 * Draws the routed wire with square corners. Junction dots mark where wires of one net split or merge;
 * a crossing without a dot is not connected. If the route is stale (node moved), falls back to a plain step wire.
 */
export function RoutedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data }: EdgeProps) {
  const d = data as { points?: Pt[]; junctions?: Pt[] } | undefined;
  const pts = d?.points;
  const nativeOk = !!pts && pts.length >= 2;
  const snapped = nativeOk
    ? (() => {
        const p = pts!.map((q) => ({ ...q }));
        const a = p[1];
        const z = p[p.length - 2];
        // Keep the imported orthogonal route, but make its endpoints land exactly on the live ReactFlow handles.
        p[0] = { x: sourceX, y: sourceY };
        p[p.length - 1] = { x: targetX, y: targetY };
        if (a) {
          if (Math.abs(a.x - pts![0].x) >= Math.abs(a.y - pts![0].y)) a.y = sourceY;
          else a.x = sourceX;
        }
        if (z) {
          if (Math.abs(z.x - pts![pts!.length - 1].x) >= Math.abs(z.y - pts![pts!.length - 1].y)) z.y = targetY;
          else z.x = targetX;
        }
        // Native DCS routes are orthogonal. If a malformed imported point would create
        // a diagonal segment, keep the original route and insert an orthogonal elbow.
        const orth: Pt[] = [p[0]];
        for (let i = 1; i < p.length; i++) {
          const q = p[i];
          const r = orth[orth.length - 1];
          if (Math.abs(q.x - r.x) > 0.5 && Math.abs(q.y - r.y) > 0.5) {
            orth.push({ x: q.x, y: r.y });
          }
          orth.push(q);
        }
        return orth;
      })()
    : undefined;
  const path = snapped
    ? pathFromPoints(snapped)
    : getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 0 })[0];
  const ok = !!snapped;
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

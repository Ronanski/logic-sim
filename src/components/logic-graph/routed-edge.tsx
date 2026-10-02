import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

import { pathFromPoints, type Pt } from "@/lib/logic-graph/route-edges";

/**
 * Draws the routed wire with square corners. Junction dots mark where wires of one net split or merge;
 * a crossing without a dot is not connected. If the route is stale (node moved), falls back to a plain step wire.
 */
export function RoutedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data }: EdgeProps) {
  const d = data as { points?: Pt[]; junctions?: Pt[]; bundlePath?: string; bundleOwner?: boolean } | undefined;
  const pts = d?.points;
  const nativeOk = !!pts && pts.length >= 2;

  // Keep the imported DXF route untouched. If ReactFlow's live handle is a few
  // pixels away from the native anchor (because a UI card or symbol was resized),
  // add a short orthogonal bridge instead of moving/rewriting the native route.
  // This prevents tiny gaps and preserves the actual DCS path.
  const bridge = (a: Pt, b: Pt): Pt[] => {
    if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) return [a, b];
    // Inputs/outputs in the source drawings are predominantly horizontal.
    return [a, { x: b.x, y: a.y }, b];
  };

  const connected = nativeOk
    ? (() => {
        const native = pts!.map((q) => ({ x: q.x, y: q.y }));
        const head = bridge({ x: sourceX, y: sourceY }, native[0]);
        const tail = bridge(native[native.length - 1], { x: targetX, y: targetY });
        const combined: Pt[] = [];
        const push = (p: Pt) => {
          const last = combined[combined.length - 1];
          if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) combined.push(p);
        };
        head.forEach(push);
        native.slice(1).forEach(push);
        tail.slice(1).forEach(push);

        // Safety: imported routes must remain orthogonal. Only repair malformed
        // individual segments; do not reroute the drawing.
        const orth: Pt[] = [combined[0]];
        for (let i = 1; i < combined.length; i++) {
          const q = combined[i];
          const r = orth[orth.length - 1];
          if (Math.abs(q.x - r.x) > 0.5 && Math.abs(q.y - r.y) > 0.5) {
            orth.push({ x: q.x, y: r.y });
          }
          orth.push(q);
        }
        return orth;
      })()
    : undefined;

  const path = d?.bundleOwner && d.bundlePath
    ? d.bundlePath
    : connected
      ? pathFromPoints(connected)
      : getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 0 })[0];
  const ok = !!connected;
  const hiddenDuplicate = !!d?.bundlePath && d.bundleOwner === false;
  return (
    <>
      <BaseEdge id={id} path={path} style={{ ...style, fill: "none", strokeWidth: style?.strokeWidth ?? 1.5, opacity: hiddenDuplicate ? 0 : style?.opacity }} />
      {ok && d?.bundleOwner !== false &&
        d?.junctions?.map((j, i) => (
          <circle key={i} cx={j.x} cy={j.y} r={3.5} style={{ fill: style?.stroke as string | undefined, opacity: style?.opacity }} className="pointer-events-none" />
        ))}
    </>
  );
}

import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import type { Pt } from "@/lib/logic-graph/route-edges";

type EdgeData = {
  points?: Pt[];
  nativePath?: string;
  junctions?: Pt[];
  bundleOwner?: boolean;
};

/**
 * Renders either an exact backend-supplied DXF net path or a routed fallback path.
 * Native DXF paths are not altered to match ReactFlow handles: node/port placement
 * is transformed from the same DXF coordinate system so the endpoints coincide.
 */
export function RoutedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data }: EdgeProps) {
  const d = data as EdgeData | undefined;
  const nativePath = d?.nativePath;
  const routed = d?.points && d.points.length >= 2 ? d.points : undefined;
  const path = nativePath ?? (routed ? routed.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ") : getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 0 })[0]);
  const hidden = d?.bundleOwner === false;
  const opacity = hidden ? 0 : (style?.opacity ?? 1);
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={8}
        style={{
          ...style,
          fill: "none",
          strokeWidth: style?.strokeWidth ?? 1.35,
          opacity,
          pointerEvents: hidden ? "none" : "visibleStroke",
        }}
        className={hidden ? "pointer-events-none" : ""}
      />
      {!hidden && d?.junctions?.map((j, i) => (
        <circle key={i} cx={j.x} cy={j.y} r={3.25} style={{ fill: style?.stroke as string | undefined, opacity }} className="pointer-events-none" />
      ))}
    </>
  );
}

import { useEffect } from "react";
import { useReactFlow, useStore } from "@xyflow/react";

import type { LogicEdge } from "@/lib/logic-graph/types";
import { routeEdges, type Pt, type RouteRequest } from "@/lib/logic-graph/route-edges";

/** Lives inside <ReactFlow>. Only non-native/synthetic edges are routed here. */
export function RouteManager({ edges, nativeRoutes, nativeNetEdges, onRoutes }: { edges: LogicEdge[]; nativeRoutes?: Record<string, Pt[]>; nativeNetEdges?: Record<string, string>; onRoutes: (r: Record<string, Pt[]>) => void }) {
  const rf = useReactFlow();
  const sig = useStore((s) => {
    let out = "";
    s.nodeLookup.forEach((n) => {
      const p = n.internals.positionAbsolute;
      out += `${n.id}:${Math.round(p.x)},${Math.round(p.y)},${n.measured.width ?? 0},${n.measured.height ?? 0}|`;
    });
    return out;
  });

  useEffect(() => {
    if (!sig || /,0,0\|/.test(sig)) return; // not measured yet
    const t = setTimeout(() => {
      const rects = rf.getNodes().map((n) => {
        const i = rf.getInternalNode(n.id);
        const p = i?.internals.positionAbsolute ?? n.position;
        return { x: p.x, y: p.y, w: n.measured?.width ?? 0, h: n.measured?.height ?? 0 };
      });
      const reqs: RouteRequest[] = [];
      for (const e of edges) {
        if (nativeRoutes?.[e.id]?.length >= 2 || nativeNetEdges?.[e.id]) continue;
        const a = rf.getInternalNode(e.from.nodeId);
        const b = rf.getInternalNode(e.to.nodeId);
        const hs = a?.internals.handleBounds?.source?.find((h) => h.id === e.from.portId);
        const ht = b?.internals.handleBounds?.target?.find((h) => h.id === e.to.portId);
        if (!a || !b || !hs || !ht) continue;
        reqs.push({
          id: e.id,
          net: `${e.from.nodeId}:${e.from.portId}`,
          sx: a.internals.positionAbsolute.x + hs.x + hs.width,
          sy: a.internals.positionAbsolute.y + hs.y + hs.height / 2,
          tx: b.internals.positionAbsolute.x + ht.x,
          ty: b.internals.positionAbsolute.y + ht.y + ht.height / 2,
        });
      }
      onRoutes({ ...(nativeRoutes ?? {}), ...routeEdges(rects, reqs) });
    }, 250);
    return () => clearTimeout(t);
  }, [sig, edges, nativeRoutes, nativeNetEdges, rf, onRoutes]);

  return null;
}

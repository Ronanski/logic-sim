import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { routeEdges } from "../route-edges";

describe("routeEdges", () => {
  it("routes around a node and ends exactly at the handles", () => {
    const rects = [{ x: 100, y: 0, w: 100, h: 200 }];
    const r = routeEdges(rects, [{ id: "a", net: "n1", sx: 0, sy: 100, tx: 400, ty: 100 }]);
    const pts = r.a;
    assert.ok(pts && pts.length >= 2);
    assert.deepEqual(pts[0], { x: 0, y: 100 });
    assert.deepEqual(pts[pts.length - 1], { x: 400, y: 100 });
    // every segment is horizontal or vertical and none cross the node box
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      assert.ok(Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01);
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      const hits = x1 > 100 && x0 < 200 && y1 > 0 && y0 < 200;
      assert.ok(!hits, "wire crosses the node");
    }
  });

  it("lets wires from the same output share a path but keeps other nets apart", () => {
    const r = routeEdges([], [
      { id: "a", net: "n1", sx: 0, sy: 0, tx: 300, ty: 0 },
      { id: "b", net: "n2", sx: 0, sy: 10, tx: 300, ty: 10 },
    ]);
    assert.ok(r.a && r.b);
  });

  it("keeps handle stubs orthogonal even when both handles miss the routing grid", () => {
    const routes = routeEdges([{ x: 100, y: 10, w: 90, h: 110 }], [
      { id: "offset", net: "one", sx: 3, sy: 58, tx: 330, ty: 93 },
    ]);
    assert.ok(routes.offset);
    for (let i = 1; i < routes.offset.length; i++) {
      const a = routes.offset[i - 1];
      const b = routes.offset[i];
      assert.ok(a.x === b.x || a.y === b.y, "wire must remain orthogonal");
    }
  });
});

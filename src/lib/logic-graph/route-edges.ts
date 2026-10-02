/**
 * Orthogonal wire router for the logic canvas.
 *
 * Wires are routed on a coarse grid with A*: they avoid node boxes, prefer few
 * bends, and avoid running on top of wires from other nets. Wires that start at
 * the same output (same net) may share cells, so they merge into one bus like
 * the junction dots on the original drawing.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Pt {
  x: number;
  y: number;
}
export interface RouteRequest {
  id: string;
  /** Wires with the same net id may share a path. */
  net: string;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

const CELL = 10;
const STUB = 20;
const PAD = 100;
const CLEARANCE = 10;
const BEND = 8;
const OVERLAP = 14;
const CROSS = 3;

class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): number {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

export function routeEdges(rects: Rect[], reqs: RouteRequest[]): Record<string, Pt[]> {
  const out: Record<string, Pt[]> = {};
  if (!reqs.length) return out;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  for (const q of reqs) {
    minX = Math.min(minX, q.sx, q.tx);
    minY = Math.min(minY, q.sy, q.ty);
    maxX = Math.max(maxX, q.sx, q.tx);
    maxY = Math.max(maxY, q.sy, q.ty);
  }
  minX -= PAD;
  minY -= PAD;
  const W = Math.ceil((maxX + PAD - minX) / CELL) + 1;
  const H = Math.ceil((maxY + PAD - minY) / CELL) + 1;
  const N = W * H;
  const cx = (i: number) => minX + i * CELL;
  const cy = (j: number) => minY + j * CELL;
  const ci = (x: number) => Math.round((x - minX) / CELL);
  const cj = (y: number) => Math.round((y - minY) / CELL);

  const blocked = new Uint8Array(N);
  for (const r of rects) {
    const i0 = Math.ceil((r.x - CLEARANCE - minX) / CELL);
    const i1 = Math.floor((r.x + r.w + CLEARANCE - minX) / CELL);
    const j0 = Math.ceil((r.y - CLEARANCE - minY) / CELL);
    const j1 = Math.floor((r.y + r.h + CLEARANCE - minY) / CELL);
    for (let j = Math.max(0, j0); j <= Math.min(H - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(W - 1, i1); i++) blocked[j * W + i] = 1;
    }
  }

  const netCode = new Map<string, number>();
  const code = (n: string) => {
    if (!netCode.has(n)) netCode.set(n, netCode.size + 1);
    return netCode.get(n)!;
  };
  const usedH = new Int32Array(N);
  const usedV = new Int32Array(N);
  const g = new Float64Array(N * 2);
  const parent = new Int32Array(N * 2);
  const stamp = new Int32Array(N * 2);
  let run = 0;

  // Short wires first so long ones route around them.
  const order = [...reqs].sort((a, b) => Math.abs(a.tx - a.sx) + Math.abs(a.ty - a.sy) - (Math.abs(b.tx - b.sx) + Math.abs(b.ty - b.sy)));

  for (const q of order) {
    const net = code(q.net);
    const si = Math.max(0, Math.min(W - 1, ci(q.sx + STUB)));
    const sj = Math.max(0, Math.min(H - 1, cj(q.sy)));
    const gi = Math.max(0, Math.min(W - 1, ci(q.tx - STUB)));
    const gj = Math.max(0, Math.min(H - 1, cj(q.ty)));
    const start = sj * W + si;
    const goal = gj * W + gi;
    blocked[start] = 0;
    blocked[goal] = 0;
    run++;

    const heap = new Heap();
    const s0 = start * 2; // state = cell*2 + axis (0 = arrived horizontally, 1 = vertically)
    g[s0] = 0;
    parent[s0] = -1;
    stamp[s0] = run;
    heap.push(Math.abs(si - gi) + Math.abs(sj - gj), s0);
    let found = -1;
    const done = new Set<number>();

    while (heap.size) {
      const s = heap.pop();
      if (done.has(s)) continue;
      done.add(s);
      const cell = s >> 1;
      const axis = s & 1;
      if (cell === goal) {
        found = s;
        break;
      }
      const ci0 = cell % W;
      const cj0 = (cell - ci0) / W;
      for (let m = 0; m < 4; m++) {
        const di = m === 0 ? 1 : m === 1 ? -1 : 0;
        const dj = m === 2 ? 1 : m === 3 ? -1 : 0;
        const ni = ci0 + di;
        const nj = cj0 + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const nc = nj * W + ni;
        if (blocked[nc]) continue;
        const nAxis = m < 2 ? 0 : 1;
        let cost = 1 + (nAxis !== axis ? BEND : 0);
        const same = nAxis === 0 ? usedH[nc] : usedV[nc];
        const cross = nAxis === 0 ? usedV[nc] : usedH[nc];
        if (same === net) cost = Math.max(0.3, cost - 0.7);
        else if (same !== 0) cost += OVERLAP;
        if (cross !== 0 && cross !== net) cost += CROSS;
        if (nc === goal && nAxis === 1) cost += BEND;
        const ns = nc * 2 + nAxis;
        const ng = g[s] + cost;
        if (stamp[ns] !== run || ng < g[ns]) {
          stamp[ns] = run;
          g[ns] = ng;
          parent[ns] = s;
          heap.push(ng + Math.abs(ni - gi) + Math.abs(nj - gj), ns);
        }
      }
    }

    if (found < 0) continue; // caller falls back to a plain step wire

    const cells: number[] = [];
    for (let s = found; s >= 0; s = parent[s]) cells.push(s >> 1);
    cells.reverse();

    // mark usage
    for (let k = 1; k < cells.length; k++) {
      const a = cells[k - 1];
      const b = cells[k];
      const horizontal = Math.floor(a / W) === Math.floor(b / W);
      const arr = horizontal ? usedH : usedV;
      arr[a] = net;
      arr[b] = net;
    }

    // corners
    const pts: Pt[] = cells.map((c) => ({ x: cx(c % W), y: cy(Math.floor(c / W)) }));
    const corners: Pt[] = [pts[0]];
    for (let k = 1; k < pts.length - 1; k++) {
      const a = pts[k - 1];
      const b = pts[k];
      const c = pts[k + 1];
      const h1 = a.y === b.y;
      const h2 = b.y === c.y;
      if (h1 !== h2) corners.push(b);
    }
    if (pts.length > 1) corners.push(pts[pts.length - 1]);

    let poly: Pt[];
    if (corners.length === 1) corners.push({ ...corners[0] });
    if (corners.length === 2 && corners[0].y === corners[1].y) {
      const [a, b] = corners;
      if (Math.abs(q.sy - q.ty) < 0.5) poly = [{ x: a.x, y: q.sy }, { x: b.x, y: q.ty }];
      else {
        const mx = (a.x + b.x) / 2;
        poly = [{ x: a.x, y: q.sy }, { x: mx, y: q.sy }, { x: mx, y: q.ty }, { x: b.x, y: q.ty }];
      }
    } else {
      poly = corners.map((p) => ({ ...p }));
      const first = poly[0];
      const second = poly[1];
      if (second.y === first.y) second.y = q.sy;
      first.y = q.sy;
      const last = poly[poly.length - 1];
      const prev = poly[poly.length - 2];
      if (prev.y === last.y) prev.y = q.ty;
      last.y = q.ty;
    }

    const full: Pt[] = [{ x: q.sx, y: q.sy }, ...poly, { x: q.tx, y: q.ty }];
    // drop duplicate and collinear points
    const clean: Pt[] = [];
    for (const p of full) {
      const l = clean[clean.length - 1];
      if (l && Math.abs(l.x - p.x) < 0.01 && Math.abs(l.y - p.y) < 0.01) continue;
      clean.push(p);
      while (clean.length >= 3) {
        const [a, b, c] = clean.slice(-3);
        const col = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
        if (!col) break;
        clean.splice(clean.length - 2, 1);
      }
    }
    out[q.id] = clean;
  }
  return out;
}

/** SVG path through the points with rounded corners. */
export function pathFromPoints(pts: Pt[], radius = 6): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1];
    const c = pts[i];
    const n = pts[i + 1];
    const d1 = Math.hypot(c.x - p.x, c.y - p.y);
    const d2 = Math.hypot(n.x - c.x, n.y - c.y);
    const r = Math.min(radius, d1 / 2, d2 / 2);
    const bx = c.x + ((p.x - c.x) / d1) * r;
    const by = c.y + ((p.y - c.y) / d1) * r;
    const ax = c.x + ((n.x - c.x) / d2) * r;
    const ay = c.y + ((n.y - c.y) / d2) * r;
    d += ` L ${bx} ${by} Q ${c.x} ${c.y} ${ax} ${ay}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

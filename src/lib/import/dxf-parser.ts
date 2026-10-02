/**
 * LogicSim DXF parser (pure TypeScript; production DXF import invokes it server-side).
 *
 * Usage:
 *   import { parseDxfFile } from "@/lib/dxfParser";
 *   const { graph, report } = await parseDxfFile(file);
 *
 * Drawing standard understood (e.g. DITL-03A/03B):
 *  - wires + gate symbols on layer CON; gates labelled AND / OR / NOT, S+R (SR latch),
 *    ON DELAY / OFF DELAY (D-shaped arc) with a duration number + SEC./MIN.
 *  - signal tag / description / address text on TXT1 / DCS in the same row as the wire
 *  - junction dots (tiny closed polylines) mark real connections
 * Everything configurable is in DEFAULT_SETTINGS.
 */

export interface Settings {
  wire_layers: string[];
  text_layers: string[];
  desc_layer: string;
  addr_layer: string;
  ignore_layers: string[];
  remove_cjk: boolean;
  gate_words: string[];
  tag_regex: string;
  address_regex: string;
  timer_regex: string;
  delay_words: Record<string, string>;
  point_tol: number;
  gap_tol: number;
  arrow_gap: number;
  row_band: number;
  desc_reach: number;
  pulse_default_sec: number;
}

export const DEFAULT_SETTINGS: Settings = {
  wire_layers: ["CON"],
  text_layers: ["TXT1", "DCS"],
  desc_layer: "TXT1",
  addr_layer: "DCS",
  ignore_layers: ["chinese"],
  remove_cjk: true,
  gate_words: ["AND", "OR", "NOT"],
  tag_regex: "^\\(?\\d{2}[A-Z]?-\\d{2}\\)?$",
  address_regex: "^(S\\d\\s+)?[A-Z]\\.[0-9A-F]{4}$",
  timer_regex: "^TR\\d+$",
  delay_words: { "ON DELAY": "TON", "OFF DELAY": "TOF", "PULSE DELAY": "TP" },
  point_tol: 0.35,
  gap_tol: 2.2,
  arrow_gap: 4.0,
  row_band: 4.6,
  desc_reach: 45.0,
  pulse_default_sec: 1.0,
};

export interface GraphNode {
  id: string;
  tag: string;
  type: string;
  params: Record<string, unknown>;
  ports: { id: string; dir: "in" | "out" }[];
  confidence: number;
  needsReview: boolean;
  /** Position on the drawing (DXF units, y up). Keeps the on-screen layout close to the sheet. */
  pos?: { x: number; y: number };
  /** Native DXF geometry for rendering. Port coordinates may be outside 0..1 for external trunks. */
  geometry?: {
    width: number;
    height: number;
    bounds?: { minX: number; minY: number; maxX: number; maxY: number };
    ports?: Record<string, { side: "L" | "R"; x: number; y: number }>;
  };
}
export interface GraphEdge {
  from: { node: string; port: string };
  to: { node: string; port: string };
}
export interface GraphPoint {
  x: number;
  y: number;
}

export interface GraphGeometry {
  source: "DXF";
  /** Canonical native drawing route for each logical edge, in raw DXF coordinates (Y up). */
  edgePaths?: Record<string, GraphPoint[]>;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  geometry?: GraphGeometry;
}
export interface ParseResult {
  graph: Graph;
  report: string[];
}

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f\ufffd]/g;

function cleanText(raw: string, S: Settings): string {
  let s = raw.split("%%%").join("%");
  s = s.replace(/%%d/gi, "\u00b0").replace(/%%p/gi, "\u00b1").replace(/%%c/gi, "\u00d8");
  if (S.remove_cjk) s = s.replace(CJK, "");
  s = s.replace(/\s+/g, " ").trim();
  return /[A-Za-z0-9]/.test(s) ? s : "";
}

// ------------------------------------------------------------ DXF reading
interface Ent {
  t: string;
  g: Record<number, string[]>;
}

export function decodeDxf(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 22));
  if (head.startsWith("AutoCAD Binary DXF")) {
    throw new Error("Binary DXF is not supported. Save or convert it as an ASCII DXF.");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("big5").decode(bytes);
    } catch {
      return new TextDecoder("latin1").decode(bytes);
    }
  }
}

function readEntities(text: string): Ent[] {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(c)) continue;
    pairs.push([c, lines[i + 1].trim()]);
  }
  const ents: Ent[] = [];
  let sec: string | null = null;
  let cur: Ent | null = null;
  for (let k = 0; k < pairs.length; k++) {
    const [c, v] = pairs[k];
    if (c === 0 && v === "SECTION" && k + 1 < pairs.length) sec = pairs[k + 1][1];
    else if (c === 0 && v === "ENDSEC") sec = null;
    if (sec === "ENTITIES") {
      if (c === 0 && v !== "SECTION" && v !== "ENDSEC") {
        cur = { t: v, g: {} };
        ents.push(cur);
      } else if (cur) {
        (cur.g[c] ||= []).push(v);
      }
    }
  }
  return ents.filter((e) => (e.g[67]?.[0] ?? "0") !== "1"); // model space only
}

function num(e: Ent, c: number, i = 0, d = 0): number {
  const v = parseFloat(e.g[c]?.[i] ?? "");
  return Number.isNaN(v) ? d : v;
}

// ------------------------------------------------------------ geometry helpers
type Pt = [number, number];
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function distPtSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

class UF {
  p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  f(x: number): number {
    while (this.p[x] !== x) {
      this.p[x] = this.p[this.p[x]];
      x = this.p[x];
    }
    return x;
  }
  u(a: number, b: number) {
    this.p[this.f(a)] = this.f(b);
  }
}

interface TextItem {
  layer: string;
  text: string;
  x: number;
  y: number;
  h: number;
}
interface Region {
  x: number;
  ylo: number;
  yhi: number;
  port: string;
}
interface Gate {
  type: string;
  id: string;
  x: number;
  y: number;
  in: Region[];
  out: Region[];
  bbox: [number, number, number, number];
  /** Exact detected symbol extents. `bbox` keeps a small exclusion pad for wire filtering. */
  nativeBounds?: [number, number, number, number];
  params?: Record<string, unknown>;
  review?: boolean;
}
interface Contact {
  gi: number;
  port: string;
  wi: number;
  kind: "in" | "out";
  x: number;
  y: number;
}
interface End {
  i: number;
  p: Pt;
  o: Pt;
}
interface Terminal {
  root: number;
  x: number;
  y: number;
  side: "L" | "R";
  wi: number;
}

// ------------------------------------------------------------ parser
export function parseDxfText(text: string, S: Settings = DEFAULT_SETTINGS): ParseResult {
  const ents = readEntities(text);
  const report: string[] = [];
  const segs: [number, number, number, number][] = [];
  const bars: [number, number, number, number][] = [];
  const dots: Pt[] = [];
  const circles: [number, number, number][] = [];
  const arcs: [number, number, number][] = [];
  const texts: TextItem[] = [];
  const seenT = new Set<string>();

  for (const e of ents) {
    const layer = e.g[8]?.[0] ?? "";
    if (S.ignore_layers.includes(layer)) continue;
    const t = e.t;
    if (S.wire_layers.includes(layer)) {
      if (t === "LINE") {
        segs.push([num(e, 10), num(e, 20), num(e, 11), num(e, 21)]);
      } else if (t === "LWPOLYLINE") {
        const xs = (e.g[10] ?? []).map(parseFloat);
        const ys = (e.g[20] ?? []).map(parseFloat);
        const pts: Pt[] = xs.map((x, i) => [x, ys[i]]);
        const closed = Math.trunc(parseFloat(e.g[70]?.[0] ?? "0")) & 1;
        const width = num(e, 43);
        if (closed && pts.length <= 2 && pts.length > 0) {
          dots.push([xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length]);
        } else if (closed) {
          // labelled boxes etc. (not wires)
        } else if (width >= 0.9 && pts.length === 2) {
          bars.push([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]);
        } else {
          for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
        }
      } else if (t === "CIRCLE") {
        circles.push([num(e, 10), num(e, 20), num(e, 40)]);
      } else if (t === "ARC") {
        arcs.push([num(e, 10), num(e, 20), num(e, 40)]);
      }
    }
    if (t === "TEXT" || t === "MTEXT") {
      let raw = e.g[1]?.[0] ?? "";
      if (t === "MTEXT") raw = raw.replace(/\\[A-Za-z][^;]*;|[{}]|\\P/g, " ");
      const s = cleanText(raw, S);
      if (!s) continue;
      const x = num(e, 10);
      const y = num(e, 20);
      const h = num(e, 40, 0, 2.5);
      const key = `${layer}|${s}|${x.toFixed(1)}|${y.toFixed(1)}`;
      if (seenT.has(key)) continue;
      seenT.add(key);
      texts.push({ layer, text: s, x, y, h });
    }
  }

  // axis-aligned lists for ray casting
  const H: [number, number, number][] = []; // xmin, xmax, y
  const V: [number, number, number][] = []; // x, ymin, ymax
  for (const [x1, y1, x2, y2] of segs) {
    if (Math.abs(y1 - y2) < 0.05 && Math.abs(x1 - x2) > 0.05) H.push([Math.min(x1, x2), Math.max(x1, x2), y1]);
    else if (Math.abs(x1 - x2) < 0.05 && Math.abs(y1 - y2) > 0.05) V.push([x1, Math.min(y1, y2), Math.max(y1, y2)]);
  }
  for (const [xmin, xmax, ymin, ymax] of bars) {
    if (xmax - xmin < ymax - ymin) V.push([(xmin + xmax) / 2, ymin, ymax]);
  }

  const center = (t: TextItem): Pt => [t.x + 0.4 * t.h * t.text.length, t.y + t.h / 2];

  const minBy = <T>(a: T[], f: (v: T) => number): T => a.reduce((m, v) => (f(v) < f(m) ? v : m));
  const maxBy = <T>(a: T[], f: (v: T) => number): T => a.reduce((m, v) => (f(v) > f(m) ? v : m));

  function rectAround(cx: number, cy: number) {
    const up = H.filter((h) => h[2] > cy + 0.01 && h[0] - 0.3 <= cx && cx <= h[1] + 0.3);
    const dn = H.filter((h) => h[2] < cy - 0.01 && h[0] - 0.3 <= cx && cx <= h[1] + 0.3);
    const lf = V.filter((v) => v[0] < cx && v[1] - 0.3 <= cy && cy <= v[2] + 0.3);
    const rt = V.filter((v) => v[0] > cx && v[1] - 0.3 <= cy && cy <= v[2] + 0.3);
    if (!(up.length && dn.length && lf.length && rt.length)) return null;
    const a = minBy(up, (h) => h[2] - cy);
    const b = maxBy(dn, (h) => h[2]);
    const l = maxBy(lf, (v) => v[0]);
    const r = minBy(rt, (v) => v[0]);
    if (r[0] - l[0] > 30 || a[2] - b[2] > 30) return null;
    return { l, r, top: a[2], bot: b[2] };
  }

  function boxBelow(cx: number, cy: number) {
    const c = H.filter((h) => h[2] < cy && cy - h[2] <= 8 && h[1] - h[0] <= 8 && h[0] - 0.5 <= cx && cx <= h[1] + 0.5);
    if (!c.length) return null;
    const top = maxBy(c, (h) => h[2]);
    const bot = H.filter(
      (h) => Math.abs(h[0] - top[0]) < 0.3 && Math.abs(h[1] - top[1]) < 0.3 && top[2] - h[2] > 0.5 && top[2] - h[2] <= 8,
    );
    if (!bot.length) return null;
    return { xl: top[0], xr: top[1], top: top[2], bot: maxBy(bot, (h) => h[2])[2] };
  }

  const gates: Gate[] = [];
  const labels = texts.filter((t) => S.wire_layers.includes(t.layer));
  const timRe = new RegExp(S.timer_regex);

  for (const t of labels) {
    const w = t.text.toUpperCase();
    const [cx, cy] = center(t);
    if (w === "OR") {
      const c = circles.find((c) => dist([cx, cy], [c[0], c[1]]) <= c[2] + 1);
      if (!c) {
        report.push(`OR label at (${t.x.toFixed(1)},${t.y.toFixed(1)}) has no circle around it`);
        continue;
      }
      const lf = V.filter((v) => v[0] <= c[0] - c[2] + 1.0 && v[1] - 0.3 <= c[1] && c[1] <= v[2] + 0.3);
      if (!lf.length) {
        report.push(`OR gate at (${c[0].toFixed(1)},${c[1].toFixed(1)}): input bar not found`);
        continue;
      }
      const bar = maxBy(lf, (v) => v[0]);
      gates.push({
        type: "OR", id: "", x: c[0], y: c[1],
        in: [{ x: bar[0], ylo: bar[1], yhi: bar[2], port: "in" }],
        out: [{ x: c[0] + c[2], ylo: c[1] - c[2], yhi: c[1] + c[2], port: "O1" }],
        bbox: [c[0] - c[2], c[1] - c[2], c[0] + c[2], c[1] + c[2]],
      });
    } else if (w === "AND") {
      const r = rectAround(cx, cy);
      if (!r) {
        report.push(`AND label at (${t.x.toFixed(1)},${t.y.toFixed(1)}): box not found`);
        continue;
      }
      gates.push({
        type: "AND", id: "", x: (r.l[0] + r.r[0]) / 2, y: (r.top + r.bot) / 2,
        in: [{ x: r.l[0], ylo: r.l[1], yhi: r.l[2], port: "in" }],
        out: [{ x: r.r[0], ylo: r.bot, yhi: r.top, port: "O1" }],
        bbox: [r.l[0], r.bot, r.r[0], r.top],
      });
    } else if (w === "NOT") {
      const b = boxBelow(cx, cy);
      if (!b) {
        report.push(`NOT label at (${t.x.toFixed(1)},${t.y.toFixed(1)}): symbol box not found`);
        continue;
      }
      gates.push({
        type: "NOT", id: "", x: (b.xl + b.xr) / 2, y: (b.top + b.bot) / 2,
        in: [{ x: b.xl, ylo: b.bot, yhi: b.top, port: "I1" }],
        out: [{ x: b.xr, ylo: b.bot, yhi: b.top, port: "O1" }],
        bbox: [b.xl, b.bot, b.xr, b.top],
      });
    }
  }

  // ON DELAY / OFF DELAY timers
  for (const t of labels) {
    const kind = S.delay_words[t.text.toUpperCase()];
    if (!kind) continue;
    const [cx, cy] = center(t);
    const near = arcs.filter((a) => dist([cx, cy], [a[0], a[1]]) <= 15);
    if (!near.length) {
      report.push(`${t.text} label at (${t.x.toFixed(1)},${t.y.toFixed(1)}): symbol (arc) not found`);
      continue;
    }
    const a = minBy(near, (a) => dist([cx, cy], [a[0], a[1]]));
    const lf = V.filter((v) => v[0] <= a[0] + 0.05 && a[0] - v[0] <= a[2] + 1 && v[1] - 0.3 <= a[1] && a[1] <= v[2] + 0.3);
    const leftX = lf.length ? maxBy(lf, (v) => v[0])[0] : a[0];
    let value: number | null = null;
    let unit = 1;
    for (const tt of labels) {
      if (dist([tt.x, tt.y], [a[0], a[1]]) <= 10) {
        if (/^\d+(\.\d+)?$/.test(tt.text)) value = parseFloat(tt.text);
        else if (/^(MIN|MINS|MINUTES?)\.?$/.test(tt.text.toUpperCase())) unit = 60;
      }
    }
    gates.push({
      type: kind, id: "", x: (leftX + a[0] + a[2]) / 2, y: a[1],
      params: { durationSec: value !== null ? value * unit : S.pulse_default_sec },
      review: value === null,
      in: [{ x: leftX, ylo: a[1] - a[2], yhi: a[1] + a[2], port: "I1" }],
      out: [{ x: a[0] + a[2], ylo: a[1] - a[2], yhi: a[1] + a[2], port: "O1" }],
      bbox: [leftX, a[1] - a[2], a[0] + a[2], a[1] + a[2]],
    });
    if (value === null) report.push(`${t.text} at (${t.x.toFixed(1)},${t.y.toFixed(1)}): duration not found, default used`);
  }

  // SR latch = S label + R label stacked in one box
  const sl = labels.filter((t) => t.text.toUpperCase() === "S");
  const rl = labels.filter((t) => t.text.toUpperCase() === "R");
  for (const s of sl) {
    const rr = rl.filter((r) => Math.abs(r.x - s.x) < 5 && s.y - r.y > 0 && s.y - r.y < 15);
    const sRect = rectAround(...center(s));
    if (!rr.length || !sRect) {
      report.push(`S label at (${s.x.toFixed(1)},${s.y.toFixed(1)}) has no matching R / box`);
      continue;
    }
    const rRect = rectAround(...center(rr[0]));
    if (!rRect) {
      report.push(`R label at (${rr[0].x.toFixed(1)},${rr[0].y.toFixed(1)}): box not found`);
      continue;
    }
    const lx = sRect.l[0];
    const rx = sRect.r[0];
    gates.push({
      type: "SR_LATCH", id: "", x: (lx + rx) / 2, y: (sRect.top + rRect.bot) / 2,
      in: [
        { x: lx, ylo: sRect.bot, yhi: sRect.top, port: "S" },
        { x: lx, ylo: rRect.bot, yhi: rRect.top, port: "R" },
      ],
      out: [{ x: rx, ylo: sRect.bot, yhi: sRect.top, port: "Q" }],
      bbox: [lx, rRect.bot, rx, sRect.top],
    });
  }

  // Some drawings (including DITL-03A) identify a pulse timer with a TRxxx tag and
  // its preset value, without printing the words "PULSE DELAY". Recognize that
  // pattern geometrically from the compact CON symbol + nearby DCS duration text.
  for (const t of texts) {
    if (!timRe.test(t.text) || t.layer !== S.addr_layer) continue;
    const tc = center(t);
    if (gates.some((g) => ["TON", "TOF", "TP"].includes(g.type) && dist([g.x, g.y], tc) <= 9)) continue;

    const compact = segs.filter(([x1, y1, x2, y2]) => {
      const d1 = dist([x1, y1], tc);
      const d2 = dist([x2, y2], tc);
      const len = Math.hypot(x2 - x1, y2 - y1);
      return d1 <= 15 && d2 <= 15 && len >= 0.4 && len <= 15;
    });
    if (compact.length < 2) continue;

    const pts = compact.flatMap(([x1, y1, x2, y2]) => [[x1, y1] as Pt, [x2, y2] as Pt]);
    let xl = Math.min(...pts.map((p) => p[0]));
    let xr = Math.max(...pts.map((p) => p[0]));
    const yb = Math.min(...pts.map((p) => p[1]));
    const yt = Math.max(...pts.map((p) => p[1]));
    // Extend a timer symbol to the nearest horizontal DXF wire endpoints on the
    // same row. This makes the logical ports land on the real conductor, not on
    // a tiny internal symbol stub.
    const midGuess = (yb + yt) / 2;
    const aligned = segs.filter(([x1, y1, x2, y2]) => {
      if (Math.abs(y1 - y2) >= 0.2 || Math.abs(((y1 + y2) / 2) - midGuess) > 2.0) return false;
      return Math.min(Math.abs(x1 - xl), Math.abs(x1 - xr), Math.abs(x2 - xl), Math.abs(x2 - xr)) <= 5;
    });
    for (const [x1, _y1, x2] of aligned) {
      const lo = Math.min(x1, x2);
      const hi = Math.max(x1, x2);
      // Use only the endpoint nearest the compact symbol. Do NOT absorb the whole
      // conductor into the timer bounding box; the remaining conductor belongs to
      // the native physical wire net.
      if (lo < xl && xl - lo <= 5) xl = lo;
      if (hi > xr && hi - xr <= 5 && Math.abs(lo - xr) <= 5) xr = lo;
      if (lo > xr && lo - xr <= 5) xr = lo;
      if (hi < xl && xl - hi <= 5) xl = hi;
    }
    const bw = xr - xl;
    const bh = yt - yb;
    if (bw < 1 || bw > 30 || bh < 1 || bh > 20) continue;

    let durationSec = S.pulse_default_sec;
    let foundDuration = false;
    for (const tt of texts) {
      if (tt.layer !== S.addr_layer || dist([tt.x, tt.y], tc) > 28) continue;
      const norm = tt.text.toUpperCase().replace(/^O(?=\.)/, "0");
      const m = norm.match(/^(\d+(?:\.\d+)?)(?:\s*(SEC|S|MIN|MINS|MINUTES?))?$/);
      if (!m) continue;
      const value = Number(m[1]);
      if (!Number.isFinite(value)) continue;
      durationSec = value * (/^MIN/i.test(m[2] ?? "") ? 60 : 1);
      foundDuration = true;
      break;
    }

    const midY = midGuess;
    gates.push({
      type: "TP", id: "", x: (xl + xr) / 2, y: midY,
      params: { durationSec },
      review: !foundDuration,
      in: [{ x: xl, ylo: midY - Math.max(1, bh / 2), yhi: midY + Math.max(1, bh / 2), port: "I1" }],
      out: [{ x: xr, ylo: midY - Math.max(1, bh / 2), yhi: midY + Math.max(1, bh / 2), port: "O1" }],
      bbox: [xl, yb, xr, yt],
    });
    if (!foundDuration) report.push(`${t.text}: timer preset not found, default used`);
  }

  // Keep the parser's wire-filtering bbox slightly padded for topology stability, but
  // retain the exact detected symbol bounds separately for rendering/placement.
  // This prevents adjacent wires from being reclassified while avoiding visible symbol overlap.
  for (const g of gates) {
    if (!g.nativeBounds) {
      const b = g.bbox;
      g.nativeBounds = [b[0], b[1], b[2], b[3]];
      g.bbox = [b[0] - 0.3, b[1] - 0.3, b[2] + 0.3, b[3] + 0.3];
    }
  }

  // number the gates (before contacts are made, so indexes stay valid)
  gates.sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : b.y - a.y || a.x - b.x));
  const counters: Record<string, number> = {};
  for (const g of gates) {
    counters[g.type] = (counters[g.type] ?? 0) + 1;
    g.id = `${g.type}-${counters[g.type]}`;
  }

  // wires = segments that are not part of a gate body and not diagonal
  const inBox = (p: Pt, bb: Gate["bbox"]) => bb[0] <= p[0] && p[0] <= bb[2] && bb[1] <= p[1] && p[1] <= bb[3];
  const wires: [number, number, number, number][] = [];
  for (const [x1, y1, x2, y2] of segs) {
    if (Math.abs(x1 - x2) > 0.05 && Math.abs(y1 - y2) > 0.05) continue;
    if (dist([x1, y1], [x2, y2]) < 0.05) continue;
    if (gates.some((g) => inBox([x1, y1], g.bbox) && inBox([x2, y2], g.bbox))) continue;
    wires.push([x1, y1, x2, y2]);
  }
  const uf = new UF(wires.length);
  const tol = S.point_tol;
  const ends: End[] = [];
  wires.forEach(([x1, y1, x2, y2], i) => {
    ends.push({ i, p: [x1, y1], o: [x2, y2] });
    ends.push({ i, p: [x2, y2], o: [x1, y1] });
  });
  const touched = new Set<number>();
  const segOf = (w: number[]): [Pt, Pt] => [[w[0], w[1]], [w[2], w[3]]];
  ends.forEach((en, k) => {
    wires.forEach((w, j) => {
      if (en.i === j) return;
      const [a, b] = segOf(w);
      if (distPtSeg(en.p, a, b) <= tol) {
        uf.u(en.i, j);
        touched.add(k);
      }
    });
  });
  for (const d of dots) {
    const near: number[] = [];
    wires.forEach((w, j) => {
      const [a, b] = segOf(w);
      if (distPtSeg(d, a, b) <= 0.8) near.push(j);
    });
    for (const j of near.slice(1)) uf.u(near[0], j);
    ends.forEach((en, k) => {
      if (near.includes(en.i) && dist(en.p, d) <= 0.8) touched.add(k);
    });
  }

  // gate contacts
  const contacts: Contact[] = [];
  gates.forEach((g, gi) => {
    for (const r of g.in) {
      ends.forEach((en, k) => {
        const { p, o } = en;
        if (o[0] < p[0] - 0.05 && r.ylo - 0.3 <= p[1] && p[1] <= r.yhi + 0.3 &&
            r.x - S.arrow_gap <= p[0] && p[0] <= r.x + 0.3 && Math.abs(p[1] - o[1]) < 0.05) {
          contacts.push({ gi, port: r.port, wi: en.i, kind: "in", x: p[0], y: p[1] });
          touched.add(k);
        }
      });
    }
    for (const r of g.out) {
      ends.forEach((en, k) => {
        const { p, o } = en;
        if (o[0] > p[0] + 0.05 && r.ylo - 0.3 <= p[1] && p[1] <= r.yhi + 0.3 &&
            Math.abs(p[0] - r.x) <= 0.3 && Math.abs(p[1] - o[1]) < 0.05) {
          contacts.push({ gi, port: r.port, wi: en.i, kind: "out", x: p[0], y: p[1] });
          touched.add(k);
        }
      });
    }
  });

  // bridge small gaps between free ends
  const free: number[] = [];
  ends.forEach((_, k) => { if (!touched.has(k)) free.push(k); });
  for (let a = 0; a < free.length; a++) {
    for (let b = a + 1; b < free.length; b++) {
      const ea = ends[free[a]];
      const eb = ends[free[b]];
      if (uf.f(ea.i) !== uf.f(eb.i) && dist(ea.p, eb.p) <= S.gap_tol && Math.abs(ea.p[1] - eb.p[1]) <= 0.4) {
        uf.u(ea.i, eb.i);
        touched.add(free[a]);
        touched.add(free[b]);
      }
    }
  }
  const terminals: Terminal[] = [];
  ends.forEach((en, k) => {
    if (touched.has(k) || Math.abs(en.p[1] - en.o[1]) > 0.05) return;
    terminals.push({ root: uf.f(en.i), x: en.p[0], y: en.p[1], side: en.p[0] < en.o[0] ? "L" : "R", wi: en.i });
  });

  // input port numbering for AND / OR (top to bottom)
  gates.forEach((g, gi) => {
    if (g.type === "AND" || g.type === "OR") {
      const cs = contacts.filter((c) => c.gi === gi && c.kind === "in").sort((a, b) => b.y - a.y);
      cs.forEach((c, n) => { c.port = `I${n + 1}`; });
    }
  });

  // row texts for terminals
  const tx = texts.filter((t) => S.text_layers.includes(t.layer));
  const tagRe = new RegExp(S.tag_regex);
  const addrRe = new RegExp(S.address_regex);
  const assigned = new Map<number, TextItem[]>();
  for (const t of tx) {
    let best: [number, number] | null = null;
    terminals.forEach((tm, ti) => {
      const ok = tm.side === "L" ? t.x < tm.x : t.x > tm.x - 1;
      if (ok && Math.abs(t.y - tm.y) <= S.row_band) {
        const d = Math.abs(t.y - tm.y);
        if (best === null || d < best[0]) best = [d, ti];
      }
    });
    if (best !== null) {
      const ti = (best as [number, number])[1];
      if (!assigned.has(ti)) assigned.set(ti, []);
      assigned.get(ti)!.push(t);
    }
  }


  // sheet table columns (row numbers sit in the CON layer, left 1..N and right 51..N)
  const numTexts = texts.filter((t) => S.wire_layers.includes(t.layer) && /^\d{1,3}$/.test(t.text.trim()));
  const median = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : null);
  const midNumX = numTexts.length ? (Math.min(...numTexts.map((t) => t.x)) + Math.max(...numTexts.map((t) => t.x))) / 2 : 0;
  const colL = median(numTexts.filter((t) => t.x < midNumX).map((t) => t.x));
  const colR = median(numTexts.filter((t) => t.x >= midNumX).map((t) => t.x));
  /** Table cells of a terminal's row: row number, LOCATION and (for outputs) the TO page link. */
  const tableCells = (ti: number): Record<string, unknown> => {
    const tm = terminals[ti];
    const col = tm.side === "L" ? colL : colR;
    if (col === null) return {};
    let best: TextItem | null = null;
    for (const t of numTexts) {
      if (Math.abs(t.x - col) > 8 || Math.abs(t.y - tm.y) > S.row_band + 2) continue;
      if (!best || Math.abs(t.y - tm.y) < Math.abs(best.y - tm.y)) best = t;
    }
    if (!best) return {};
    const rows = (assigned.get(ti) ?? []).filter((t) => t.layer === S.desc_layer).sort((a, b) => b.y - a.y);
    const join = (l: TextItem[]) => l.map((t) => t.text).join(" ");
    const out: Record<string, unknown> = { rowNo: parseInt(best.text.trim(), 10) };
    if (tm.side === "L") {
      const loc = join(rows.filter((t) => t.x < col - 1 && !tagRe.test(t.text)));
      if (loc) out.loc = loc;
    } else {
      const loc = join(rows.filter((t) => t.x > col - 1 && t.x <= col + 16 && !/^\d+$/.test(t.text)));
      const to = join(rows.filter((t) => t.x > col + 16));
      if (loc) out.loc = loc;
      if (to) out.to = to;
    }
    return out;
  };

  /**
   * Build an exact-ish graph over the original orthogonal DXF wire segments.
   * We split a segment only at its own endpoints touching another segment, or at explicit junction dots;
   * ordinary crossings therefore remain crossings, not connections.
   */
  const pointKey = (p: Pt) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
  const onSegment = (p: Pt, a: Pt, b: Pt, eps = Math.max(tol, 0.8)) => {
    if (Math.abs(a[1] - b[1]) < 0.05) {
      return Math.abs(p[1] - a[1]) <= eps && p[0] >= Math.min(a[0], b[0]) - eps && p[0] <= Math.max(a[0], b[0]) + eps;
    }
    if (Math.abs(a[0] - b[0]) < 0.05) {
      return Math.abs(p[0] - a[0]) <= eps && p[1] >= Math.min(a[1], b[1]) - eps && p[1] <= Math.max(a[1], b[1]) + eps;
    }
    return false;
  };
  interface WireVertex { p: Pt; links: Set<string>; }
  const wireVertices = new Map<string, WireVertex>();
  const vertex = (p: Pt) => {
    const k = pointKey(p);
    let v = wireVertices.get(k);
    if (!v) { v = { p, links: new Set<string>() }; wireVertices.set(k, v); }
    return v;
  };

  // Start with every segment endpoint. Endpoint-on-segment contacts are the DCS-style junction rule.
  for (let i = 0; i < wires.length; i++) {
    const [a, b] = segOf(wires[i]);
    vertex(a); vertex(b);
  }
  for (let i = 0; i < wires.length; i++) {
    const root = uf.f(i);
    const [a, b] = segOf(wires[i]);
    for (let j = 0; j < ends.length; j++) {
      const en = ends[j];
      if (uf.f(en.i) !== root) continue;
      if (en.i === i) continue;
      if (onSegment(en.p, a, b)) vertex(en.p);
    }
  }
  for (const d of dots) {
    wires.forEach((w, i) => {
      if (distPtSeg(d, ...segOf(w)) <= 0.8) vertex(d);
    });
  }
  // Connect consecutive split points along each original segment.
  for (let i = 0; i < wires.length; i++) {
    const root = uf.f(i);
    const [a, b] = segOf(wires[i]);
    const ps: Pt[] = [];
    for (const v of wireVertices.values()) {
      if (onSegment(v.p, a, b)) ps.push(v.p);
    }
    ps.sort((p1, p2) => Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? p1[0] - p2[0] : p1[1] - p2[1]);
    for (let k = 0; k + 1 < ps.length; k++) {
      const ka = pointKey(ps[k]);
      const kb = pointKey(ps[k + 1]);
      const va = wireVertices.get(ka)!;
      const vb = wireVertices.get(kb)!;
      // Link keys only inside the same union-find net.
      if (uf.f(i) === root) { va.links.add(kb); vb.links.add(ka); }
    }
  }


  // Physical anchor of each recognized logical port.
  const portAnchor = new Map<string, Pt>();
  contacts.forEach((c) => {
    const g = gates[c.gi];
    const regions = c.kind === "in" ? g.in : g.out;
    const r = regions.find((rr) => rr.port === c.port) ?? regions[0];
    // Use the symbol boundary X plus the physical wire Y. This is the real logical
    // terminal point even when the conductor stops a few DXF units short of the symbol.
    portAnchor.set(`${g.id}:${c.port}`, [r?.x ?? c.x, c.y]);
  });

  const terminalAnchorByNode = new Map<string, Pt>();
  const terminalNodeByIndex = new Map<number, string>();

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();
  const addNode = (id: string, tag: string, type: string, params: Record<string, unknown>,
                   ports: GraphNode["ports"], review = false, conf = 1.0, pos?: { x: number; y: number },
                   geometry?: GraphNode["geometry"]): string => {
    while (nodeIds.has(id)) id += "b";
    nodes.push({ id, tag, type, params, ports, confidence: conf, needsReview: review,
      ...(pos ? { pos } : {}), ...(geometry ? { geometry } : {}) });
    nodeIds.add(id);
    return id;
  };

  gates.forEach((g, gi) => {
    let pts: GraphNode["ports"];
    if (g.type === "SR_LATCH") {
      pts = [{ id: "S", dir: "in" }, { id: "R", dir: "in" }, { id: "Q", dir: "out" }];
    } else {
      const ins = Array.from(new Set(contacts.filter((c) => c.gi === gi && c.kind === "in").map((c) => c.port)))
        .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
      pts = [...ins.map((p) => ({ id: p, dir: "in" as const })), { id: "O1", dir: "out" as const }];
    }
    const nativeBounds = g.nativeBounds ?? g.bbox;
    const bw = Math.max(1, nativeBounds[2] - nativeBounds[0]);
    const bh = Math.max(1, nativeBounds[3] - nativeBounds[1]);
    const gp: Record<string, { side: "L" | "R"; x: number; y: number }> = {};
    // Port X comes from the detected symbol boundary, not from the wire endpoint.
    // A few DCS drawings leave a small horizontal gap between the symbol and conductor.
    // The backend adds that bridge to the native net path, so the rendered port lands
    // exactly on the symbol body instead of floating beside it.
    for (const c of contacts.filter((c) => c.gi === gi)) {
      const regions = c.kind === "in" ? g.in : g.out;
      const r = regions.find((rr) => rr.port === c.port) ?? regions[0];
      const px = r?.x ?? c.x;
      gp[c.port] = {
        side: c.kind === "in" ? "L" : "R",
        x: (px - nativeBounds[0]) / bw,
        y: (c.y - nativeBounds[1]) / bh,
      };
    }
    // If a port has no wire contact (for example a symbol directly touching a
    // labelled I/O row), keep the detected native symbol port coordinate. Do not
    // clamp it: long OR receiving trunks legitimately sit outside the small OR body.
    for (const r of g.in) if (!gp[r.port]) {
      gp[r.port] = {
        side: "L",
        x: (r.x - nativeBounds[0]) / bw,
        y: ((r.ylo + r.yhi) / 2 - nativeBounds[1]) / bh,
      };
    }
    for (const r of g.out) if (!gp[r.port]) {
      gp[r.port] = {
        side: "R",
        x: (r.x - nativeBounds[0]) / bw,
        y: ((r.ylo + r.yhi) / 2 - nativeBounds[1]) / bh,
      };
    }
    addNode(g.id, g.type.replace("_LATCH", ""), g.type, g.params ?? {}, pts, g.review ?? false, 1.0,
      { x: g.x, y: g.y }, { width: bw, height: bh, bounds: { minX: nativeBounds[0], minY: nativeBounds[1], maxX: nativeBounds[2], maxY: nativeBounds[3] }, ports: gp });
  });

  const sourceOf = new Map<number, [string, string][]>();
  const sinkOf = new Map<number, [string, string][]>();
  const lst = (m: Map<number, [string, string][]>, k: number) => {
    if (!m.has(k)) m.set(k, []);
    return m.get(k)!;
  };
  for (const c of contacts) {
    const net = uf.f(c.wi);
    lst(c.kind === "in" ? sinkOf : sourceOf, net).push([gates[c.gi].id, c.port]);
  }

  const idx = terminals.map((_, i) => i);
  const inRows = idx.filter((i) => terminals[i].side === "L").sort((a, b) => terminals[b].y - terminals[a].y);
  const outRows = idx.filter((i) => terminals[i].side === "R").sort((a, b) => terminals[b].y - terminals[a].y);
  const byYDesc = (a: TextItem, b: TextItem) => b.y - a.y;
  let inI = 0;
  let outI = 0;

  for (const ti of inRows) {
    const { root, x, y } = terminals[ti];
    if (lst(sourceOf, root).length && !lst(sinkOf, root).length) continue; // left end of a gate-driven net
    const rows = assigned.get(ti) ?? [];
    const tag = rows.find((t) => tagRe.test(t.text) && t.layer === S.desc_layer)?.text ?? "";
    const desc = rows
      .filter((t) => t.layer === S.desc_layer && !tagRe.test(t.text) && !/^\d+$/.test(t.text) && t.x >= x - S.desc_reach)
      .sort(byYDesc).map((t) => t.text).join(" ");
    const addr = rows.find((t) => t.layer === S.addr_layer && addrRe.test(t.text) && t.x < x - 10)?.text ?? "";
    inI += 1;
    const base = tag.replace(/^\(+|\)+$/g, "");
    let sid = tag ? `IN-${base}${tag.startsWith("(") ? "-alt" : ""}` : `IN-${inI}`;
    // Only sheet-table signals become UI terminals. Bare/free wire stubs inside the logic area
    // are not external I/O and must not turn into phantom IN-5 / OUT-1 cards.
    if (!tag && !desc) continue;
    const params: Record<string, unknown> = { description: desc, role: "input", ...tableCells(ti) };
    if (addr) params.address = addr;
    if (tag) params.from = tag;
    sid = addNode(sid, tag || desc || sid, "signal", params, [{ id: "O1", dir: "out" }], false, 1.0, { x, y });
    terminalAnchorByNode.set(sid, [x, y]);
    terminalNodeByIndex.set(ti, sid);
    // A timer is a real recognized gate with native DXF geometry. Do not synthesize a timer
    // at the input row; let the physical wire net connect the actual timer gate.
    lst(sourceOf, root).push([sid, "O1"]);
  }
  for (const ti of outRows) {
    const { root, x } = terminals[ti];
    if (!lst(sourceOf, root).length) continue;
    const rows = assigned.get(ti) ?? [];
    const desc = rows
      .filter((t) => t.layer === S.desc_layer && !/^\d+$/.test(t.text) && t.x <= x + S.desc_reach)
      .sort(byYDesc).map((t) => t.text).join(" ");
    const addr = rows.find((t) => t.layer === S.addr_layer && addrRe.test(t.text))?.text ?? "";
    outI += 1;
    if (!desc) continue;
    const params: Record<string, unknown> = { description: desc, role: "output", ...tableCells(ti) };
    if (addr) params.address = addr;
    const oid = addNode(`OUT-${outI}`, desc, "signal", params, [{ id: "I1", dir: "in" }], false, 1.0, { x, y: terminals[ti].y });
    terminalAnchorByNode.set(oid, [x, terminals[ti].y]);
    terminalNodeByIndex.set(ti, oid);
    lst(sinkOf, root).push([oid, "I1"]);
  }

  // A few DCS symbols are drawn with a tiny gap between the symbol and the source/target
  // row conductor (the DITL-03A TR254 timer is one example). When a gate port has no
  // physical wire contact, connect it to the nearest labelled sheet terminal using only
  // geometry/tolerance. This is intentionally diagram-agnostic; no sheet coordinates are used.
  const syntheticEdges: GraphEdge[] = [];
  const contactedPorts = new Set(contacts.map((c) => `${c.gi}:${c.kind}:${c.port}`));
  const terminalCandidates = [...terminalNodeByIndex.entries()].map(([ti, nodeId]) => ({
    ti, nodeId, x: terminals[ti].x, y: terminals[ti].y, side: terminals[ti].side,
  }));
  const labeledTerminalRows = (x: number, y: number, side: "L" | "R") => {
    const near = tx.filter((t) => Math.abs(t.y - y) <= S.row_band && (side === "L" ? t.x < x + 2 : t.x > x - 2));
    const tag = near.filter((t) => tagRe.test(t.text) && t.layer === S.desc_layer)
      .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0]?.text ?? "";
    const desc = near.filter((t) => t.layer === S.desc_layer && !tagRe.test(t.text) && !/^\d+$/.test(t.text))
      .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0]?.text ?? "";
    const addr = near.filter((t) => t.layer === S.addr_layer && addrRe.test(t.text))
      .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0]?.text ?? "";
    return { tag, desc, addr };
  };
  for (let gi = 0; gi < gates.length; gi++) {
    const g = gates[gi];
    // Only timer blocks get this fallback. Timers can be drawn directly against a
    // sheet row with no separate CON wire segment; other gates should only connect
    // through explicit native DXF contacts to avoid inventing terminals.
    if (!(g.type === "TON" || g.type === "TOF" || g.type === "TP")) continue;
    for (const r of g.in) {
      if (contactedPorts.has(`${gi}:in:${r.port}`)) continue;
      const target = [r.x, (r.ylo + r.yhi) / 2] as Pt;
      const cands = terminalCandidates
        .filter((c) => c.side === "L")
        .map((c) => ({ ...c, d: dist([c.x, c.y], target) }))
        .filter((c) => c.d <= S.gap_tol + 1.0)
        .sort((a, b) => a.d - b.d);
      if (cands.length) {
        syntheticEdges.push({ from: { node: cands[0].nodeId, port: "O1" }, to: { node: g.id, port: r.port } });
        continue;
      }
      // No free wire endpoint: if the DXF itself puts a labelled I/O row directly on
      // the gate port, materialize that row as an input node at the native port anchor.
      const row = labeledTerminalRows(r.x, (r.ylo + r.yhi) / 2, "L");
      if (!row.tag && !row.desc) continue;
      const sid = addNode(`IN-${row.tag || g.id}-${r.port}`, row.tag || row.desc, "signal",
        { description: row.desc, role: "input", ...(row.addr ? { address: row.addr } : {}), ...(row.tag ? { from: row.tag } : {}) },
        [{ id: "O1", dir: "out" }], false, 1.0, { x: r.x, y: (r.ylo + r.yhi) / 2 });
      terminalAnchorByNode.set(sid, [r.x, (r.ylo + r.yhi) / 2]);
      syntheticEdges.push({ from: { node: sid, port: "O1" }, to: { node: g.id, port: r.port } });
    }
    for (const r of g.out) {
      if (contactedPorts.has(`${gi}:out:${r.port}`)) continue;
      const target = [r.x, (r.ylo + r.yhi) / 2] as Pt;
      const cands = terminalCandidates
        .filter((c) => c.side === "R")
        .map((c) => ({ ...c, d: dist([c.x, c.y], target) }))
        .filter((c) => c.d <= S.gap_tol + 1.0)
        .sort((a, b) => a.d - b.d);
      if (cands.length) {
        syntheticEdges.push({ from: { node: g.id, port: r.port }, to: { node: cands[0].nodeId, port: "I1" } });
      }
    }
  }

  const allNets = new Set<number>([...sourceOf.keys(), ...sinkOf.keys()]);
  for (const net of allNets) {
    for (const a of lst(sourceOf, net)) {
      for (const b of lst(sinkOf, net)) {
        edges.push({ from: { node: a[0], port: a[1] }, to: { node: b[0], port: b[1] } });
      }
    }
  }
  // Add only small-gap inferred links that do not already exist in the physical-net graph.
  for (const e of syntheticEdges) {
    const duplicate = edges.some((x) => x.from.node === e.from.node && x.from.port === e.from.port && x.to.node === e.to.node && x.to.port === e.to.port);
    if (!duplicate) edges.push(e);
  }

  // Canonical native edge paths: walk the actual DXF wire graph.
  // This is intentionally backend-side geometry data; the UI only renders these points.
  const shortestWirePath = (start: Pt, target: Pt): Pt[] | null => {
    const sk = pointKey(start);
    const tk = pointKey(target);
    if (!wireVertices.has(sk) || !wireVertices.has(tk)) return null;
    if (sk === tk) return [start, target];
    const distMap = new Map<string, number>([[sk, 0]]);
    const prev = new Map<string, string>();
    const queue: { k: string; d: number }[] = [{ k: sk, d: 0 }];
    while (queue.length) {
      queue.sort((a, b) => a.d - b.d);
      const cur = queue.shift()!;
      if (cur.d !== distMap.get(cur.k)) continue;
      if (cur.k === tk) break;
      const cv = wireVertices.get(cur.k)!;
      for (const nk of cv.links) {
        const nv = wireVertices.get(nk)!;
        const step = dist(cv.p, nv.p);
        const nd = cur.d + step;
        if (nd < (distMap.get(nk) ?? Infinity)) {
          distMap.set(nk, nd);
          prev.set(nk, cur.k);
          queue.push({ k: nk, d: nd });
        }
      }
    }
    if (!prev.has(tk)) return null;
    const keys = [tk];
    while (keys[keys.length - 1] !== sk) keys.push(prev.get(keys[keys.length - 1])!);
    keys.reverse();
    return keys.map((k) => wireVertices.get(k)!.p);
  };

  const physicalAnchorFor = (nodeId: string, portId: string): Pt | null => {
    const direct = terminalAnchorByNode.get(`${nodeId}:${portId}`) ?? terminalAnchorByNode.get(nodeId);
    if (direct) return direct;
    const hit = contacts.find((c) => gates[c.gi].id === nodeId && c.port === portId);
    if (!hit) return null;
    return ends.find((en) => en.i === hit.wi && Math.abs(en.p[1] - hit.y) < 0.3)?.p ?? [hit.x, hit.y];
  };

  const edgePaths: Record<string, GraphPoint[]> = {};
  edges.forEach((e, i) => {
    const sPt = physicalAnchorFor(e.from.node, e.from.port);
    const tPt = physicalAnchorFor(e.to.node, e.to.port);
    if (!sPt || !tPt) return;
    const path = shortestWirePath(sPt, tPt);
    if (!path || path.length < 2) return;
    const simplified: Pt[] = [];
    for (const p of path) {
      const prev = simplified[simplified.length - 2];
      const last = simplified[simplified.length - 1];
      if (last && prev) {
        const collinear = (Math.abs(prev[0] - last[0]) < 0.05 && Math.abs(last[0] - p[0]) < 0.05) ||
          (Math.abs(prev[1] - last[1]) < 0.05 && Math.abs(last[1] - p[1]) < 0.05);
        if (collinear) { simplified[simplified.length - 1] = p; continue; }
      }
      simplified.push(p);
    }
    edgePaths[`e${i + 1}`] = simplified.map(([x, y]) => ({ x, y }));
  });

  // labels inside the logic area that we did not recognise (new symbol types)
  const known = new Set<string>([...S.gate_words.map((w) => w.toUpperCase()), "S", "R",
    ...Object.keys(S.delay_words).map((w) => w.toUpperCase())]);
  if (wires.length) {
    const bx0 = Math.min(...wires.map((w) => Math.min(w[0], w[2])));
    const bx1 = Math.max(...wires.map((w) => Math.max(w[0], w[2])));
    const by0 = Math.min(...wires.map((w) => Math.min(w[1], w[3])));
    const by1 = Math.max(...wires.map((w) => Math.max(w[1], w[3])));
    for (const t of labels) {
      const u = t.text.toUpperCase();
      if (known.has(u) || !(bx0 <= t.x && t.x <= bx1 && by0 <= t.y && t.y <= by1)) continue;
      if (/^\d+(\.\d+)?$/.test(u) || /^(SEC|MIN|MINS)\.?$/.test(u)) {
        if (arcs.some((a) => dist([t.x, t.y], [a[0], a[1]]) <= 10)) continue;
      }
      report.push(`UNKNOWN LABEL '${t.text}' at (${t.x.toFixed(1)},${t.y.toFixed(1)}): new symbol type? send this drawing for review`);
    }
  }

  // sanity report
  for (const net of allNets) {
    const src = lst(sourceOf, net);
    const snk = lst(sinkOf, net);
    if (snk.length && !src.length) report.push(`Net feeding ${snk.map((s) => s.join(".")).join(", ")} has no source`);
    if (src.length && !snk.length) report.push(`Net from ${src.map((s) => s.join(".")).join(", ")} goes nowhere`);
  }
  for (const nd of nodes) if (nd.needsReview) report.push(`Please review: ${nd.id} (${nd.type})`);

  const geometry: GraphGeometry | undefined = Object.keys(edgePaths).length
    ? { source: "DXF" as const, edgePaths }
    : undefined;
  return { graph: { nodes, edges, ...(geometry ? { geometry } : {}) }, report };
}

/** Convenience wrapper for a File picked/dropped in the browser. */
export async function parseDxfFile(file: File, S: Settings = DEFAULT_SETTINGS): Promise<ParseResult> {
  return parseDxfText(decodeDxf(await file.arrayBuffer()), S);
}

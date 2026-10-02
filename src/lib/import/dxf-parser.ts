/**
 * LogicSim DXF parser (runs in the browser, no libraries needed).
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
}
export interface GraphEdge {
  from: { node: string; port: string };
  to: { node: string; port: string };
}
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
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
  params?: Record<string, unknown>;
  review?: boolean;
}
interface Contact {
  gi: number;
  port: string;
  wi: number;
  kind: "in" | "out";
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
        bbox: [c[0] - c[2] - 0.3, c[1] - c[2] - 0.3, c[0] + c[2] + 0.3, c[1] + c[2] + 0.3],
      });
    } else if (w === "AND") {
      const r = rectAround(cx, cy);
      if (!r) {
        report.push(`AND label at (${t.x.toFixed(1)},${t.y.toFixed(1)}): box not found`);
        continue;
      }
      gates.push({
        type: "AND", id: "", x: r.l[0], y: (r.top + r.bot) / 2,
        in: [{ x: r.l[0], ylo: r.l[1], yhi: r.l[2], port: "in" }],
        out: [{ x: r.r[0], ylo: r.bot, yhi: r.top, port: "O1" }],
        bbox: [r.l[0] - 0.3, r.bot - 0.3, r.r[0] + 0.3, r.top + 0.3],
      });
    } else if (w === "NOT") {
      const b = boxBelow(cx, cy);
      if (!b) {
        report.push(`NOT label at (${t.x.toFixed(1)},${t.y.toFixed(1)}): symbol box not found`);
        continue;
      }
      gates.push({
        type: "NOT", id: "", x: b.xl, y: (b.top + b.bot) / 2,
        in: [{ x: b.xl, ylo: b.bot, yhi: b.top, port: "I1" }],
        out: [{ x: b.xr, ylo: b.bot, yhi: b.top, port: "O1" }],
        bbox: [b.xl - 0.3, b.bot - 0.3, b.xr + 0.3, b.top + 0.3],
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
      type: kind, id: "", x: leftX, y: a[1],
      params: { durationSec: value !== null ? value * unit : S.pulse_default_sec },
      review: value === null,
      in: [{ x: leftX, ylo: a[1] - a[2], yhi: a[1] + a[2], port: "I1" }],
      out: [{ x: a[0] + a[2], ylo: a[1] - a[2], yhi: a[1] + a[2], port: "O1" }],
      bbox: [leftX - 0.3, a[1] - a[2] - 0.3, a[0] + a[2] + 0.3, a[1] + a[2] + 0.3],
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
      type: "SR_LATCH", id: "", x: lx, y: (sRect.top + rRect.bot) / 2,
      in: [
        { x: lx, ylo: sRect.bot, yhi: sRect.top, port: "S" },
        { x: lx, ylo: rRect.bot, yhi: rRect.top, port: "R" },
      ],
      out: [{ x: rx, ylo: sRect.bot, yhi: sRect.top, port: "Q" }],
      bbox: [lx - 0.3, rRect.bot - 0.3, rx + 0.3, sRect.top + 0.3],
    });
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
          contacts.push({ gi, port: r.port, wi: en.i, kind: "in", y: p[1] });
          touched.add(k);
        }
      });
    }
    for (const r of g.out) {
      ends.forEach((en, k) => {
        const { p, o } = en;
        if (o[0] > p[0] + 0.05 && r.ylo - 0.3 <= p[1] && p[1] <= r.yhi + 0.3 &&
            Math.abs(p[0] - r.x) <= 0.3 && Math.abs(p[1] - o[1]) < 0.05) {
          contacts.push({ gi, port: r.port, wi: en.i, kind: "out", y: p[1] });
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
    terminals.push({ root: uf.f(en.i), x: en.p[0], y: en.p[1], side: en.p[0] < en.o[0] ? "L" : "R" });
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
  const timRe = new RegExp(S.timer_regex);
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

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();
  const addNode = (id: string, tag: string, type: string, params: Record<string, unknown>,
                   ports: GraphNode["ports"], review = false, conf = 1.0): string => {
    while (nodeIds.has(id)) id += "b";
    nodes.push({ id, tag, type, params, ports, confidence: conf, needsReview: review });
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
    addNode(g.id, g.type.replace("_LATCH", ""), g.type, g.params ?? {}, pts, g.review ?? false);
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
    const timer = rows.find((t) => timRe.test(t.text));
    inI += 1;
    const base = tag.replace(/^\(+|\)+$/g, "");
    let sid = tag ? `IN-${base}${tag.startsWith("(") ? "-alt" : ""}` : `IN-${inI}`;
    const params: Record<string, unknown> = { description: desc, role: "input" };
    if (addr) params.address = addr;
    sid = addNode(sid, tag || desc || sid, "signal", params, [{ id: "O1", dir: "out" }], !(tag || desc));
    let src: [string, string] = [sid, "O1"];
    if (timer) {
      const taddr = tx.find((t) => addrRe.test(t.text) && Math.abs(t.y - y) <= S.row_band && x < t.x && t.x < x + 60)?.text ?? "";
      const tid = addNode(`TIMER-${timer.text}`, timer.text, "TIMER",
        { kind: "pulse", durationSec: S.pulse_default_sec, address: taddr },
        [{ id: "I1", dir: "in" }, { id: "O1", dir: "out" }], true, 0.5);
      edges.push({ from: { node: sid, port: "O1" }, to: { node: tid, port: "I1" } });
      src = [tid, "O1"];
    }
    lst(sourceOf, root).push(src);
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
    const params: Record<string, unknown> = { description: desc, role: "output" };
    if (addr) params.address = addr;
    const oid = addNode(`OUT-${outI}`, desc || `OUT-${outI}`, "signal", params, [{ id: "I1", dir: "in" }], !desc);
    lst(sinkOf, root).push([oid, "I1"]);
  }

  const allNets = new Set<number>([...sourceOf.keys(), ...sinkOf.keys()]);
  for (const net of allNets) {
    for (const a of lst(sourceOf, net)) {
      for (const b of lst(sinkOf, net)) {
        edges.push({ from: { node: a[0], port: a[1] }, to: { node: b[0], port: b[1] } });
      }
    }
  }

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

  return { graph: { nodes, edges }, report };
}

/** Convenience wrapper for a File picked/dropped in the browser. */
export async function parseDxfFile(file: File, S: Settings = DEFAULT_SETTINGS): Promise<ParseResult> {
  return parseDxfText(decodeDxf(await file.arrayBuffer()), S);
}

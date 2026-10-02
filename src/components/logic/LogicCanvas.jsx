import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import NodeSymbol from '@/components/logic/NodeSymbol';
import { nodeSize, inPort, outPort, wirePath, portCount } from '@/lib/logic/symbols';

const PAD = 60;
const MAX_FIT_SCALE = 0.9; // autofit never magnifies symbols beyond this
const snap = (v) => Math.round(v / 10) * 10;

function fitBox(nodes, size) {
  let minX = 0, minY = 0, maxX = 1000, maxY = 600;
  if (nodes.length) {
    minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
    nodes.forEach((n) => {
      const { w, h } = nodeSize(n);
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y - 12);
      maxX = Math.max(maxX, n.x + w); maxY = Math.max(maxY, n.y + h + 8);
    });
  }
  let w = maxX - minX + PAD * 2;
  let h = maxY - minY + PAD * 2;
  const a = size.w / size.h;
  let x = minX - PAD, y = minY - PAD;
  if (w / h < a) { const nw = h * a; x -= (nw - w) / 2; w = nw; }
  else { const nh = w / a; y -= (nh - h) / 2; h = nh; }
  const minW = size.w / MAX_FIT_SCALE;
  if (w < minW) {
    const cx = x + w / 2, cy = y + h / 2;
    w = minW; h = size.h / MAX_FIT_SCALE;
    x = cx - w / 2; y = cy - h / 2;
  }
  return { x, y, w, h };
}

const noop = () => {};

const LogicCanvas = forwardRef(function LogicCanvas(props, ref) {
  const {
    nodes, wires, values = {}, mode, selection, selectedIds = [], trace, pending, symStyle = 'dcs',
    onSelect, onNodeSelect = () => [], onMoveNodes = noop, onMarquee = noop, onPort, onInput, onConnect = noop,
  } = props;
  const [link, setLink] = useState(null);
  const linkRef = useRef(null);
  const wrap = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [custom, setCustom] = useState(null);
  const [fitTick, setFitTick] = useState(0);
  const [marqBox, setMarqBox] = useState(null);
  const drag = useRef(null);
  const marq = useRef(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width || 1, h: e.contentRect.height || 1 }));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const sig = nodes.map((n) => n.id).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const base = useMemo(() => fitBox(nodes, size), [sig, size, fitTick]);
  const vb = custom || base;
  const live = useRef({});
  live.current = { vb, base, custom, size, nodes, onMoveNodes, onMarquee, onSelect, onConnect };
  const onPortDown = (nid, e) => {
    if (e.button !== 0) return;
    const n = nodeById[nid];
    const p = outPort(n);
    linkRef.current = { from: nid, sx: p.x, sy: p.y, x: p.x, y: p.y };
    setLink(linkRef.current);
  };

  const zoomAt = (factor, fx = 0.5, fy = 0.5) => {
    const { vb: cur, base: b } = live.current;
    let w = cur.w / factor;
    if (w >= b.w * 0.999) { setCustom(null); return; }
    w = Math.max(w, b.w / 15);
    const h = (w * cur.h) / cur.w;
    setCustom({ x: cur.x + fx * cur.w - fx * w, y: cur.y + fy * cur.h - fy * h, w, h });
  };

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomAt(1.3), zoomOut: () => zoomAt(1 / 1.3),
    fit: () => { setCustom(null); setFitTick((t) => t + 1); },
    getCenter: () => ({ x: live.current.vb.x + live.current.vb.w / 2, y: live.current.vb.y + live.current.vb.h / 2 }),
  }));

  useEffect(() => {
    const el = wrap.current;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toSvg = (e) => {
    const r = wrap.current.getBoundingClientRect();
    const { vb: v } = live.current;
    return { x: v.x + ((e.clientX - r.left) / r.width) * v.w, y: v.y + ((e.clientY - r.top) / r.height) * v.h };
  };

  useEffect(() => {
    const move = (e) => {
      if (linkRef.current) { const p = toSvg(e); linkRef.current = { ...linkRef.current, x: p.x, y: p.y }; setLink(linkRef.current); return; }
      const d = drag.current;
      if (d) {
        const s = live.current.vb.w / live.current.size.w;
        const dx = (e.clientX - d.sx) * s, dy = (e.clientY - d.sy) * s;
        const patch = {};
        Object.entries(d.starts).forEach(([id, p]) => { patch[id] = { x: snap(p.x + dx), y: snap(p.y + dy) }; });
        live.current.onMoveNodes(patch);
        return;
      }
      const m = marq.current;
      if (m) { const p = toSvg(e); m.x2 = p.x; m.y2 = p.y; setMarqBox({ ...m }); }
    };
    const up = (e) => {
      const l = linkRef.current;
      if (l) {
        linkRef.current = null; setLink(null);
        const p = toSvg(e);
        const unit = live.current.vb.w / live.current.size.w;
        if (Math.hypot(p.x - l.sx, p.y - l.sy) < 8 * unit) return; // plain click: handled by click-to-connect
        let hit = null;
        live.current.nodes.forEach((n) => {
          if (hit || n.id === l.from || portCount(n) === 0) return;
          for (let i = 0; i < portCount(n); i++) {
            const q = inPort(n, i);
            if (Math.hypot(p.x - q.x, p.y - q.y) < 16) { hit = { id: n.id, port: i }; return; }
          }
        });
        if (!hit) {
          const n = live.current.nodes.find((m) => {
            const { w, h } = nodeSize(m);
            return m.id !== l.from && portCount(m) > 0 && p.x >= m.x - 6 && p.x <= m.x + w && p.y >= m.y && p.y <= m.y + h;
          });
          if (n) hit = { id: n.id, port: null };
        }
        if (hit) live.current.onConnect(l.from, hit.id, hit.port);
        return;
      }
      drag.current = null;
      const m = marq.current;
      if (!m) return;
      marq.current = null;
      setMarqBox(null);
      const unit = live.current.vb.w / live.current.size.w;
      if (Math.abs(m.x2 - m.x1) + Math.abs(m.y2 - m.y1) < 6 * unit) {
        if (!m.additive) live.current.onSelect(null);
        return;
      }
      const x1 = Math.min(m.x1, m.x2), x2 = Math.max(m.x1, m.x2), y1 = Math.min(m.y1, m.y2), y2 = Math.max(m.y1, m.y2);
      const ids = live.current.nodes.filter((n) => {
        const { w, h } = nodeSize(n);
        return n.x < x2 && n.x + w > x1 && n.y < y2 && n.y + h > y1;
      }).map((n) => n.id);
      live.current.onMarquee(ids, m.additive);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const selSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const groups = useMemo(() => {
    const g = {};
    nodes.forEach((n) => {
      if (!n.groupId) return;
      const { w, h } = nodeSize(n);
      const b = g[n.groupId] || (g[n.groupId] = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
      b.x1 = Math.min(b.x1, n.x); b.y1 = Math.min(b.y1, n.y - 14);
      b.x2 = Math.max(b.x2, n.x + w); b.y2 = Math.max(b.y2, n.y + h);
    });
    return Object.entries(g);
  }, [nodes]);

  const onNodeDown = (e, n) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const ids = onNodeSelect(n, e.shiftKey || e.ctrlKey || e.metaKey);
    if (mode === 'edit' && ids && ids.length) {
      const starts = {};
      ids.forEach((id) => { const m = nodeById[id]; if (m) starts[id] = { x: m.x, y: m.y }; });
      drag.current = { sx: e.clientX, sy: e.clientY, starts };
    }
  };

  const onBgDown = (e) => {
    if (e.button !== 0) return;
    const p = toSvg(e);
    marq.current = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, additive: e.shiftKey || e.ctrlKey || e.metaKey };
  };

  const wireColor = (w) => {
    if (selection?.kind === 'wire' && selection.id === w.id) return 'hsl(var(--cv-sel))';
    if (trace?.upWires.has(w.id)) return 'hsl(var(--cv-up))';
    if (trace?.downWires.has(w.id)) return 'hsl(var(--cv-down))';
    if (values[w.from]) return 'hsl(var(--cv-on))';
    return mode === 'sim' ? 'hsl(var(--cv-off))' : 'hsl(var(--cv-stroke))';
  };
  const wireDim = (w) => trace && !(trace.upWires.has(w.id) || trace.downWires.has(w.id) || selection?.id === w.id);
  const nodeRole = (id) => (trace?.upNodes.has(id) ? 'up' : trace?.downNodes.has(id) ? 'down' : null);
  const nodeDim = (id) => trace && !(selection?.kind === 'node' && selection.id === id) && !trace.upNodes.has(id) && !trace.downNodes.has(id)
    && !(selection?.kind === 'wire');

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden select-none touch-none" style={{ background: 'hsl(var(--cv-bg))' }}>
      <svg width="100%" height="100%" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} onPointerDown={onBgDown}>
        <defs>
          <pattern id="cv-grid" width={20} height={20} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={0.8} fill="hsl(var(--cv-grid))" />
          </pattern>
        </defs>
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#cv-grid)" />
        {groups.map(([gid, b]) => (
          <rect key={gid} x={b.x1 - 8} y={b.y1 - 8} width={b.x2 - b.x1 + 16} height={b.y2 - b.y1 + 16} rx={10}
            fill="none" stroke="hsl(var(--cv-sel))" strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="2 5" pointerEvents="none" />
        ))}
        {wires.map((w) => {
          const a = nodeById[w.from], b = nodeById[w.to];
          if (!a || !b) return null;
          const d = wirePath(outPort(a), inPort(b, w.toPort));
          const sel = selection?.kind === 'wire' && selection.id === w.id;
          return (
            <g key={w.id} opacity={wireDim(w) ? 0.2 : 1} style={{ transition: 'opacity .2s' }}
              onPointerDown={(e) => { e.stopPropagation(); onSelect({ kind: 'wire', id: w.id }); }}>
              <path d={d} fill="none" stroke={wireColor(w)} strokeWidth={sel ? 3.5 : 2.2} strokeLinejoin="round" />
              <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: 'pointer' }} />
            </g>
          );
        })}
        {nodes.map((n) => (
          <NodeSymbol key={n.id} node={n} on={!!values[n.id]} mode={mode} role={nodeRole(n.id)} symStyle={symStyle}
            selected={selSet.has(n.id)} dim={nodeDim(n.id)}
            pending={pending === n.id} onNodeDown={onNodeDown} onPort={onPort} onPortDown={onPortDown} onInput={onInput} />
        ))}
        {link && <path d={wirePath({ x: link.sx, y: link.sy }, { x: link.x, y: link.y })} fill="none" stroke="hsl(var(--cv-sel))" strokeWidth={2.5} strokeDasharray="6 4" pointerEvents="none" />}
        {marqBox && (
          <rect x={Math.min(marqBox.x1, marqBox.x2)} y={Math.min(marqBox.y1, marqBox.y2)}
            width={Math.abs(marqBox.x2 - marqBox.x1)} height={Math.abs(marqBox.y2 - marqBox.y1)}
            fill="hsl(var(--cv-sel) / 0.1)" stroke="hsl(var(--cv-sel))" strokeWidth={1.2} strokeDasharray="4 3" pointerEvents="none" />
        )}
      </svg>
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Empty diagram — add symbols from the library or import a drawing.
        </div>
      )}
    </div>
  );
});

export default LogicCanvas;
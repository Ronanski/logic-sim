import React from 'react';
import { SYMBOLS, nodeSize, portCount, hasOut, inPort, outPort } from '@/lib/logic/symbols';

const C = {
  stroke: 'hsl(var(--cv-stroke))', fill: 'hsl(var(--cv-fill))', on: 'hsl(var(--cv-on))', off: 'hsl(var(--cv-off))',
  up: 'hsl(var(--cv-up))', down: 'hsl(var(--cv-down))', sel: 'hsl(var(--cv-sel))', text: 'hsl(var(--cv-text))',
};
const mono = { fontFamily: 'var(--font-mono)' };
const cut = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const line = { stroke: 'currentColor', strokeWidth: 2 };

function Gate({ node, w, h, on, symStyle }) {
  const t = node.type;
  const common = { fill: on ? 'hsl(var(--cv-on) / 0.15)' : C.fill, stroke: 'currentColor', strokeWidth: 2 };
  const cy = h / 2;
  if (symStyle === 'dcs' && (t === 'and' || t === 'or')) {
    const n = portCount(node);
    const r = Math.min(h / 2 - 4, 24);
    const cx = (8 + w - 10) / 2;
    const right = t === 'and' ? w - 10 : cx + r;
    return (
      <>
        <line x1={8} y1={3} x2={8} y2={h - 3} stroke="currentColor" strokeWidth={3} />
        {Array.from({ length: n }, (_, i) => {
          const y = (h * (i + 1)) / (n + 1);
          return <line key={i} x1={0} y1={y} x2={8} y2={y} {...line} />;
        })}
        {t === 'and' ? <rect {...common} x={8} y={cy - r} width={w - 18} height={2 * r} /> : <circle {...common} cx={cx} cy={cy} r={r} />}
        <line x1={right} y1={cy} x2={w} y2={cy} {...line} />
      </>
    );
  }
  if (symStyle === 'dcs' && t === 'not') {
    return (
      <>
        <line x1={0} y1={cy} x2={w} y2={cy} {...line} />
        <rect {...common} x={w / 2 - 11} y={cy - 11} width={22} height={22} />
        <path d={`M${w / 2 - 7},${cy - 7} L${w / 2 + 7},${cy + 7} M${w / 2 + 7},${cy - 7} L${w / 2 - 7},${cy + 7}`} stroke="currentColor" strokeWidth={1.6} />
      </>
    );
  }
  if (symStyle === 'traditional') {
    if (t === 'and') return <path {...common} d={`M0,0 H${w * 0.5} A${w * 0.5},${h / 2} 0 0 1 ${w * 0.5},${h} H0 Z`} />;
    if (t === 'or') return <path {...common} d={`M0,0 Q${w * 0.6},0 ${w},${cy} Q${w * 0.6},${h} 0,${h} Q${w * 0.25},${cy} 0,0 Z`} />;
    if (t === 'not') return (
      <>
        <path {...common} d={`M0,2 L${w - 10},${cy} L0,${h - 2} Z`} />
        <circle {...common} cx={w - 5} cy={cy} r={5} />
      </>
    );
  }
  return <rect {...common} width={w} height={h} rx={t === 'not' ? 4 : 8} />;
}

function Body({ node, w, h, on, symStyle }) {
  const t = node.type;
  const label = { and: 'AND', or: 'OR', not: 'NOT' }[t];
  if (label) {
    const dcs = symStyle === 'dcs';
    const showText = symStyle !== 'traditional' && !(dcs && t === 'not');
    const tx = symStyle === 'block' ? w / 2 : dcs ? (t === 'and' ? (8 + w - 10) / 2 : w / 2 - 1) : w * 0.38;
    return (
      <>
        <Gate node={node} w={w} h={h} on={on} symStyle={symStyle} />
        {showText && <text x={tx} y={h / 2 + 4} textAnchor="middle" fontSize={dcs ? 11 : 12} fontWeight={600} fill={C.text} style={mono}>{label}</text>}
        {dcs && t === 'not' && <text x={w / 2} y={h / 2 - 16} textAnchor="middle" fontSize={9} fontWeight={600} fill={C.text} style={mono}>NOT</text>}
      </>
    );
  }
  if (t === 'sr') {
    return (
      <>
        <Gate node={node} w={w} h={h} on={on} symStyle={symStyle} />
        <text x={8} y={h / 3 + 4} fontSize={12} fontWeight={600} fill={C.text} style={mono}>S</text>
        <text x={8} y={(h * 2) / 3 + 4} fontSize={12} fontWeight={600} fill={C.text} style={mono}>R</text>
        <text x={w - 8} y={h / 2 + 4} fontSize={12} fontWeight={600} textAnchor="end" fill={C.text} style={mono}>Q</text>
      </>
    );
  }
  if (SYMBOLS[t].delay) {
    const name = { ton: 'ON DELAY', tof: 'OFF DELAY', pulse: 'PULSE' }[t];
    return (
      <>
        <Gate node={node} w={w} h={h} on={on} symStyle={symStyle} />
        <text x={w / 2} y={20} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={C.text} style={mono}>{name}</text>
        <text x={w / 2} y={42} textAnchor="middle" fontSize={13} fontWeight={600} fill={C.text} style={mono}>{node.delay ?? 3} SEC</text>
      </>
    );
  }
  return null;
}

function Wide({ node, w, h, on, onInput }) {
  const t = node.type;
  const src = SYMBOLS[t].source;
  const cx = w - 26;
  const cy = h / 2;
  const press = (e, down) => { e.stopPropagation(); onInput(node.id, down ? 'down' : 'up'); };
  const toggle = (e) => { e.stopPropagation(); onInput(node.id, 'toggle'); };
  let ctrl;
  if (src && t === 'pushbutton') {
    const hold = !node.latch;
    ctrl = (
      <g style={{ cursor: 'pointer' }}
        onPointerDown={(e) => e.stopPropagation() || (hold && press(e, true))}
        onPointerUp={hold ? (e) => press(e, false) : undefined}
        onPointerLeave={hold && on ? (e) => press(e, false) : undefined}
        onClick={hold ? undefined : toggle}>
        <circle cx={cx} cy={cy} r={14} fill={on ? C.on : C.fill} stroke={C.stroke} strokeWidth={2} />
        <circle cx={cx} cy={cy} r={7} fill={on ? C.fill : C.off} opacity={0.8} />
      </g>
    );
  } else if (src) {
    ctrl = (
      <g style={{ cursor: 'pointer' }} onPointerDown={(e) => e.stopPropagation()} onClick={toggle}>
        <rect x={cx - 18} y={cy - 9} width={36} height={18} rx={9} fill={on ? C.on : C.off} opacity={0.9} />
        <circle cx={on ? cx + 9 : cx - 9} cy={cy} r={7} fill={C.fill} stroke={C.stroke} strokeWidth={1.5} />
      </g>
    );
  } else if (t === 'lamp') {
    ctrl = (
      <g>
        <circle cx={cx} cy={cy} r={14} fill={on ? C.on : C.fill} stroke={C.stroke} strokeWidth={2} />
        <path d={`M${cx - 9},${cy - 9} L${cx + 9},${cy + 9} M${cx + 9},${cy - 9} L${cx - 9},${cy + 9}`} stroke={C.stroke} strokeWidth={1.5} />
      </g>
    );
  } else if (t === 'sv') {
    ctrl = (
      <g>
        <circle cx={cx} cy={cy} r={14} fill={on ? C.on : C.fill} stroke={C.stroke} strokeWidth={2} />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={on ? C.fill : C.text} style={mono}>SV</text>
      </g>
    );
  } else if (t === 'ann') {
    ctrl = (
      <g>
        <rect x={cx - 20} y={cy - 12} width={40} height={24} rx={5} fill={on ? C.on : C.fill} stroke={C.stroke} strokeWidth={2} />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fontWeight={600} fill={on ? C.fill : C.text} style={mono}>ANN</text>
      </g>
    );
  } else {
    ctrl = (
      <g>
        <circle cx={cx} cy={cy} r={12} fill={on ? C.on : C.fill} stroke={C.stroke} strokeWidth={2} />
        <path d={`M${cx - 5},${cy} H${cx + 5} M${cx + 1},${cy - 5} L${cx + 6},${cy} L${cx + 1},${cy + 5}`} stroke={on ? C.fill : C.stroke} strokeWidth={1.8} fill="none" />
      </g>
    );
  }
  const addr = [node.addrKind, node.address].filter(Boolean).join(' · ');
  return (
    <>
      <rect width={w} height={h} rx={7} fill={C.fill} stroke="currentColor" strokeWidth={2} />
      <text x={12} y={21} fontSize={12.5} fontWeight={600} fill={C.text} style={mono}>{cut(node.tag || node.label || SYMBOLS[t].label, 17)}</text>
      <text x={12} y={37} fontSize={8.5} fill={C.text} opacity={0.75}>{cut(node.service, 30)}</text>
      <text x={12} y={48} fontSize={8} fill={C.text} opacity={0.6} style={mono}>{cut(addr, 30)}</text>
      {ctrl}
    </>
  );
}

export default function NodeSymbol({ node, on, mode, role, selected, dim, pending, symStyle = 'dcs', onNodeDown, onPort, onPortDown, onInput }) {
  const { w, h } = nodeSize(node);
  const editing = mode === 'edit';
  if (node.type === 'text') {
    const fs = node.fontSize || 14;
    return (
      <g opacity={dim ? 0.25 : 1}>
        <g transform={`translate(${node.x},${node.y})`} style={{ cursor: editing ? 'move' : 'default' }} onPointerDown={(e) => onNodeDown(e, node)}>
          <rect width={w} height={h} rx={4} fill="transparent" stroke={selected ? C.sel : 'none'} strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={8} y={h / 2 + fs * 0.35} fontSize={fs} fontWeight={600} fill={C.text}>{node.text || 'Text'}</text>
        </g>
      </g>
    );
  }
  const wide = SYMBOLS[node.type].wide;
  const color = selected ? C.sel : role === 'up' ? C.up : role === 'down' ? C.down : C.stroke;
  const n = portCount(node);
  const lowConf = node.confidence !== undefined && node.confidence < 0.7;
  const dcsGate = symStyle === 'dcs' && ['and', 'or', 'not'].includes(node.type);
  return (
    <g opacity={dim ? 0.25 : 1} style={{ transition: 'opacity .2s' }}>
      <g transform={`translate(${node.x},${node.y})`} style={{ color, cursor: editing ? 'move' : 'pointer' }}
        onPointerDown={(e) => onNodeDown(e, node)}>
        {wide ? <Wide node={node} w={w} h={h} on={on} onInput={onInput} /> : <Body node={node} w={w} h={h} on={on} symStyle={symStyle} />}
        {!wide && (node.tag || node.label) && node.type !== 'not' && (
          <text x={0} y={-6} fontSize={9.5} fill={C.text} opacity={0.8} style={mono}>{cut(node.tag || node.label, 16)}</text>
        )}
        {selected && <rect x={-5} y={-5} width={w + 10} height={h + 10} rx={9} fill="none" stroke={C.sel} strokeWidth={1.5} strokeDasharray="5 4" />}
        {lowConf && <circle cx={w} cy={0} r={6} fill="hsl(38 95% 55%)" />}
      </g>
      {Array.from({ length: n }, (_, i) => {
        const p = inPort(node, i);
        return (
          <g key={i} onPointerDown={editing ? (e) => e.stopPropagation() : undefined} onClick={editing ? (e) => { e.stopPropagation(); onPort(node.id, 'in', i); } : undefined} style={{ cursor: editing ? 'crosshair' : 'default' }}>
            {!dcsGate && <circle cx={p.x} cy={p.y} r={4} fill={C.fill} stroke={color} strokeWidth={1.8} />}
            {dcsGate && <circle cx={p.x} cy={p.y} r={3} fill={color} />}
            {editing && <circle cx={p.x} cy={p.y} r={10} fill="transparent" />}
          </g>
        );
      })}
      {hasOut(node) && (() => {
        const p = outPort(node);
        return (
          <g onPointerDown={editing ? (e) => { e.stopPropagation(); onPortDown?.(node.id, e); } : undefined} onClick={editing ? (e) => { e.stopPropagation(); onPort(node.id, 'out', 0); } : undefined} style={{ cursor: editing ? 'crosshair' : 'default' }}>
            <circle cx={p.x} cy={p.y} r={4.5} fill={pending ? C.sel : on ? C.on : C.fill} stroke={pending ? C.sel : color} strokeWidth={1.8} />
            {editing && <circle cx={p.x} cy={p.y} r={10} fill="transparent" />}
          </g>
        );
      })()}
    </g>
  );
}
import { SYMBOLS, portCount } from './symbols';

const SX = 2400;
const SY = 1500;

// Convert the AI analysis result into editable nodes / wires (positions in diagram units)
export function buildFromAnalysis(res) {
  const seen = new Set();
  const nodes = (res.nodes || []).map((r, i) => {
    let id = String(r.id || `n${i + 1}`);
    while (seen.has(id)) id += '_';
    seen.add(id);
    const type = SYMBOLS[r.type] ? r.type : 'input';
    const node = {
      id, type,
      x: Math.round(((Number.isFinite(r.nx) ? r.nx : (i % 8) / 8) * SX) / 10) * 10,
      y: Math.round(((Number.isFinite(r.ny) ? r.ny : Math.floor(i / 8) / 6) * SY) / 10) * 10,
      label: r.label || '', tag: r.tag || '', service: r.service || '',
      address: r.address || '', addrKind: r.address_kind || '',
      confidence: typeof r.confidence === 'number' ? r.confidence : 0.8, note: r.note || '',
    };
    if (SYMBOLS[type].delay) node.delay = Number(r.delay) || 3;
    if (SYMBOLS[type].max && r.inputs) node.inputs = Math.min(SYMBOLS[type].max, Math.max(2, r.inputs));
    return node;
  });
  return { nodes, wires: cleanWires(nodes, res.wires || []), warnings: res.warnings || [], title: res.title || '' };
}

export function cleanWires(nodes, raw) {
  const ids = new Map(nodes.map((n) => [n.id, n]));
  const out = [];
  raw.forEach((w) => {
    const to = ids.get(w.to);
    if (!ids.get(w.from) || !to || w.from === w.to) return;
    const toPort = Math.max(0, Math.min(portCount(to) - 1, w.toPort ?? w.to_port ?? 0));
    out.push({ id: `w${out.length + 1}`, from: w.from, to: w.to, toPort });
  });
  return out;
}
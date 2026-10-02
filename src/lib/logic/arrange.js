import { nodeSize } from './symbols';

// Align / distribute the selected symbols. Grouped symbols move together as one unit.
export function arrangeNodes(nodes, ids, kind) {
  const set = new Set(ids);
  const units = {};
  nodes.filter((n) => set.has(n.id)).forEach((n) => {
    const k = n.groupId || n.id;
    const { w, h } = nodeSize(n);
    const u = units[k] || (units[k] = { ids: [], x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
    u.ids.push(n.id);
    u.x1 = Math.min(u.x1, n.x); u.y1 = Math.min(u.y1, n.y);
    u.x2 = Math.max(u.x2, n.x + w); u.y2 = Math.max(u.y2, n.y + h);
  });
  const list = Object.values(units);
  if (list.length < 2) return {};
  const minX = Math.min(...list.map((u) => u.x1));
  const maxX = Math.max(...list.map((u) => u.x2));
  const minY = Math.min(...list.map((u) => u.y1));
  const maxY = Math.max(...list.map((u) => u.y2));
  const cxOf = (u) => (u.x1 + u.x2) / 2;
  const cyOf = (u) => (u.y1 + u.y2) / 2;

  if (kind === 'distH' || kind === 'distV') {
    if (list.length < 3) return {};
    const h = kind === 'distH';
    const sorted = [...list].sort((a, b) => (h ? cxOf(a) - cxOf(b) : cyOf(a) - cyOf(b)));
    const first = h ? cxOf(sorted[0]) : cyOf(sorted[0]);
    const last = h ? cxOf(sorted[sorted.length - 1]) : cyOf(sorted[sorted.length - 1]);
    const step = (last - first) / (sorted.length - 1);
    sorted.forEach((u, i) => {
      const target = first + i * step;
      u.dx = h ? target - cxOf(u) : 0;
      u.dy = h ? 0 : target - cyOf(u);
    });
  } else {
    list.forEach((u) => {
      u.dx = 0; u.dy = 0;
      if (kind === 'left') u.dx = minX - u.x1;
      if (kind === 'right') u.dx = maxX - u.x2;
      if (kind === 'center') u.dx = (minX + maxX) / 2 - cxOf(u);
      if (kind === 'top') u.dy = minY - u.y1;
      if (kind === 'bottom') u.dy = maxY - u.y2;
      if (kind === 'middle') u.dy = (minY + maxY) / 2 - cyOf(u);
    });
  }
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const patch = {};
  list.forEach((u) => u.ids.forEach((id) => {
    patch[id] = { x: Math.round(byId[id].x + u.dx), y: Math.round(byId[id].y + u.dy) };
  }));
  return patch;
}
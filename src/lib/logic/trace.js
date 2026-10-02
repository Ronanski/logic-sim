function walk(startIds, wires, dir) {
  const nodes = new Set();
  const ws = new Set();
  const stack = [...startIds];
  while (stack.length) {
    const id = stack.pop();
    for (const w of wires) {
      const hit = dir === 'up' ? w.to === id : w.from === id;
      if (!hit) continue;
      ws.add(w.id);
      const nxt = dir === 'up' ? w.from : w.to;
      if (!nodes.has(nxt)) { nodes.add(nxt); stack.push(nxt); }
    }
  }
  return { nodes, wires: ws };
}

// Trace everything feeding (up) and driven by (down) the selected node or wire.
export function computeTrace(wires, sel) {
  if (!sel) return null;
  if (sel.kind === 'node') {
    const up = walk([sel.id], wires, 'up');
    const down = walk([sel.id], wires, 'down');
    return { sel, upNodes: up.nodes, upWires: up.wires, downNodes: down.nodes, downWires: down.wires };
  }
  const w = wires.find((x) => x.id === sel.id);
  if (!w) return null;
  const up = walk([w.from], wires, 'up');
  const down = walk([w.to], wires, 'down');
  up.nodes.add(w.from);
  down.nodes.add(w.to);
  return { sel, upNodes: up.nodes, upWires: up.wires, downNodes: down.nodes, downWires: down.wires };
}
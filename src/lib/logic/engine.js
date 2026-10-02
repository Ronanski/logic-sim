import { portCount, isSource } from './symbols';

const STATEFUL = new Set(['ton', 'tof', 'pulse', 'sr']);

export const initialState = () => ({ out: {}, t: {}, prev: {} });

function incomingMap(wires) {
  const m = {};
  wires.forEach((w) => {
    if (!m[w.to]) m[w.to] = [];
    m[w.to][w.toPort] = w.from;
  });
  return m;
}

function settle(nodes, inc, manual, st) {
  const v = {};
  nodes.forEach((n) => {
    if (isSource(n.type)) v[n.id] = !!manual[n.id];
    else if (STATEFUL.has(n.type)) v[n.id] = !!st.out[n.id];
    else v[n.id] = false;
  });
  const inp = (n, i) => {
    const s = inc[n.id] && inc[n.id][i];
    return s ? !!v[s] : false;
  };
  for (let pass = 0; pass < nodes.length + 2; pass++) {
    let changed = false;
    for (const n of nodes) {
      if (isSource(n.type) || STATEFUL.has(n.type)) continue;
      const c = portCount(n);
      let r;
      if (n.type === 'and') {
        r = c > 0;
        for (let i = 0; i < c; i++) r = r && inp(n, i);
      } else if (n.type === 'or') {
        r = false;
        for (let i = 0; i < c; i++) r = r || inp(n, i);
      } else if (n.type === 'not') r = !inp(n, 0);
      else r = inp(n, 0);
      if (v[n.id] !== r) { v[n.id] = r; changed = true; }
    }
    if (!changed) break;
  }
  return { v, inp };
}

export function stepSim(nodes, wires, manual, st, dt) {
  const inc = incomingMap(wires);
  const first = settle(nodes, inc, manual, st);
  const next = { out: { ...st.out }, t: { ...st.t }, prev: { ...st.prev } };
  for (const n of nodes) {
    if (!STATEFUL.has(n.type)) continue;
    const d = Number(n.delay) || 0;
    const a = first.inp(n, 0);
    const id = n.id;
    const t0 = st.t[id] || 0;
    if (n.type === 'ton') {
      if (a) { next.t[id] = t0 + dt; next.out[id] = t0 + dt >= d; }
      else { next.t[id] = 0; next.out[id] = false; }
    } else if (n.type === 'tof') {
      if (a) { next.out[id] = true; next.t[id] = 0; }
      else if (st.out[id]) {
        next.t[id] = t0 + dt;
        if (t0 + dt >= d) { next.out[id] = false; next.t[id] = 0; }
      }
    } else if (n.type === 'pulse') {
      if (a && !st.prev[id]) { next.out[id] = d > 0; next.t[id] = 0; }
      else if (st.out[id]) {
        next.t[id] = t0 + dt;
        if (t0 + dt >= d) next.out[id] = false;
      }
      next.prev[id] = a;
    } else if (n.type === 'sr') {
      const s = a;
      const r = first.inp(n, 1);
      next.out[id] = r ? false : s ? true : !!st.out[id];
    }
  }
  const res = settle(nodes, inc, manual, next);
  return { state: next, values: res.v };
}
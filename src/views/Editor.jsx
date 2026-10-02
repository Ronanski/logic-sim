
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { getDiagram, updateDiagram, subscribeDiagram } from '@/lib/diagrams';

import EditorToolbar from '@/components/logic/EditorToolbar';
import LogicCanvas from '@/components/logic/LogicCanvas';
import SymbolPalette from '@/components/logic/SymbolPalette';
import InfoPanel from '@/components/logic/InfoPanel';
import SelectionBar from '@/components/logic/SelectionBar';
import ImportDialog from '@/components/logic/import/ImportDialog';
import useSimulation from '@/lib/logic/useSimulation';
import { computeTrace } from '@/lib/logic/trace';
import { arrangeNodes } from '@/lib/logic/arrange';
import { SYMBOLS, portCount } from '@/lib/logic/symbols';

const isWide = () => window.innerWidth >= 1024;
const stamp = () => Date.now().toString(36);

export default function Editor() {
  const { id } = useParams({ strict: false });
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [nodes, setNodes] = useState([]);
  const [wires, setWires] = useState([]);
  const [symStyle, setSymStyle] = useState('dcs');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState('edit');
  const [selection, setSelection] = useState(null);
  const [selIds, setSelIds] = useState([]);
  const [pending, setPending] = useState(null);
  const [showInfo, setShowInfo] = useState(isWide);
  const [showPalette, setShowPalette] = useState(isWide);
  const [importOpen, setImportOpen] = useState(false);
  const [hasClip, setHasClip] = useState(false);
  const canvas = useRef(null);
  const clip = useRef(null);
  const pasteN = useRef(0);
  const cur = useRef({});
  cur.current = { name, nodes, wires, dirty, symStyle };
  // Simulation runs live in both Build and Simulate modes
  const sim = useSimulation(nodes, wires, true);
  const trace = useMemo(() => computeTrace(wires, selection), [wires, selection]);

  useEffect(() => {
    getDiagram(id).then((d) => {
      setName(d.name || ''); setNodes(d.nodes || []); setWires(d.wires || []);
      setSymStyle(d.symbol_style || 'dcs'); setLoaded(true);
    });
  }, [id]);

  // Real-time sync: changes saved from another open session appear here automatically
  useEffect(() => {
    const unsub = subscribeDiagram(id, (d) => {
      if (!d || !Array.isArray(d.nodes)) return;
      const c = cur.current;
      if (c.dirty) return;
      const remote = JSON.stringify([d.name, d.nodes, d.wires || [], d.symbol_style || 'dcs']);
      if (remote === JSON.stringify([c.name, c.nodes, c.wires, c.symStyle])) return;
      setName(d.name || ''); setNodes(d.nodes); setWires(d.wires || []); setSymStyle(d.symbol_style || 'dcs');
    });
    return unsub;
  }, [id]);

  useEffect(() => {
    if (!dirty) return undefined;
    const t = setTimeout(async () => {
      setSaving(true);
      await updateDiagram(id, { name, nodes, wires, symbol_style: symStyle });
      setSaving(false); setDirty(false);
    }, 1200);
    return () => clearTimeout(t);
  }, [dirty, name, nodes, wires, symStyle, id]);

  const editNodes = (fn) => { setNodes(fn); setDirty(true); };
  const editWires = (fn) => { setWires(fn); setDirty(true); };

  const selectNodes = (ids) => {
    setSelIds(ids);
    setSelection(ids.length === 1 ? { kind: 'node', id: ids[0] } : null);
  };
  const onSelect = (s) => {
    if (!s) { selectNodes([]); setPending(null); return; }
    if (s.kind === 'wire') { setSelIds([]); setSelection(s); } else selectNodes([s.id]);
  };
  const withGroup = (ids) => {
    const gs = new Set(nodes.filter((n) => ids.includes(n.id) && n.groupId).map((n) => n.groupId));
    return nodes.filter((n) => ids.includes(n.id) || (n.groupId && gs.has(n.groupId))).map((n) => n.id);
  };

  const addNode = (type) => {
    const s = SYMBOLS[type];
    const c = canvas.current?.getCenter() || { x: 100, y: 100 };
    const nid = `n${stamp()}`;
    const node = { id: nid, type, x: Math.round(c.x / 10) * 10, y: Math.round(c.y / 10) * 10, tag: s.wide ? 'NEW' : '', label: s.wide ? '' : s.label.toUpperCase() };
    if (s.delay) node.delay = 3;
    if (type === 'text') { node.text = 'Label'; node.label = ''; node.tag = ''; node.fontSize = 14; }
    editNodes((ns) => [...ns, node]);
    selectNodes([nid]);
  };

  const onConnect = (from, to, port) => {
    const node = nodes.find((n) => n.id === to);
    if (!node || from === to || mode !== 'edit') return;
    if (port == null) { connectTo(node, from); return; }
    editWires((ws) => [...ws.filter((w) => !(w.to === to && w.toPort === port)), { id: `w${stamp()}`, from, to, toPort: port }]);
    setPending(null);
  };

  const connectTo = (node, from = pending) => {
    const s = SYMBOLS[node.type];
    const c = portCount(node);
    const used = new Set(wires.filter((w) => w.to === node.id).map((w) => w.toPort));
    let idx = Array.from({ length: c }, (_, i) => i).find((i) => !used.has(i));
    if (idx === undefined) {
      if (s.max && c < s.max) {
        idx = c;
        editNodes((ns) => ns.map((n) => (n.id === node.id ? { ...n, inputs: c + 1 } : n)));
      } else idx = 0;
    }
    editWires((ws) => [...ws.filter((w) => !(w.to === node.id && w.toPort === idx)), { id: `w${stamp()}`, from, to: node.id, toPort: idx }]);
    setPending(null);
  };

  // Called by the canvas on symbol press; returns the ids that should drag together
  const onNodeSelect = (node, additive) => {
    if (mode === 'edit' && pending && pending !== node.id && portCount(node) > 0) { connectTo(node); return []; }
    const group = withGroup([node.id]);
    if (additive) {
      const has = selIds.includes(node.id);
      const next = has ? selIds.filter((i) => !group.includes(i)) : [...new Set([...selIds, ...group])];
      selectNodes(next);
      return has ? [] : next;
    }
    if (selIds.includes(node.id)) return selIds;
    selectNodes(group);
    return group;
  };

  const onMarquee = (ids, additive) => {
    const ex = withGroup(ids);
    selectNodes(additive ? [...new Set([...selIds, ...ex])] : ex);
  };

  const onPort = (nid, kind, idx) => {
    if (kind === 'out') { setPending((p) => (p === nid ? null : nid)); return; }
    if (!pending || pending === nid) return;
    editWires((ws) => [...ws.filter((w) => !(w.to === nid && w.toPort === idx)), { id: `w${stamp()}`, from: pending, to: nid, toPort: idx }]);
    setPending(null);
  };

  const moveNodes = (patch) => editNodes((ns) => ns.map((n) => (patch[n.id] ? { ...n, ...patch[n.id] } : n)));

  const changeNode = (nid, patch) => editNodes((ns) => ns.map((n) => {
    if (n.id !== nid) return n;
    const u = { ...n, ...patch };
    if (patch.inputs) editWires((ws) => ws.filter((w) => w.to !== nid || w.toPort < portCount(u)));
    return u;
  }));

  const deleteSelected = () => {
    if (mode !== 'edit') return;
    if (selIds.length) {
      const set = new Set(selIds);
      editNodes((ns) => ns.filter((n) => !set.has(n.id)));
      editWires((ws) => ws.filter((w) => !set.has(w.from) && !set.has(w.to)));
    } else if (selection?.kind === 'wire') editWires((ws) => ws.filter((w) => w.id !== selection.id));
    else return;
    selectNodes([]);
  };

  const copy = () => {
    if (!selIds.length) return;
    const set = new Set(selIds);
    clip.current = { nodes: nodes.filter((n) => set.has(n.id)), wires: wires.filter((w) => set.has(w.from) && set.has(w.to)) };
    pasteN.current = 0;
    setHasClip(true);
  };

  const paste = () => {
    const c = clip.current;
    if (!c || mode !== 'edit') return;
    pasteN.current += 1;
    const off = 30 * pasteN.current;
    const s = stamp();
    const map = {};
    const gmap = {};
    const created = c.nodes.map((n, i) => {
      const nid = `n${s}${i}`;
      map[n.id] = nid;
      const copyN = { ...n, id: nid, x: n.x + off, y: n.y + off };
      if (n.groupId) {
        if (!gmap[n.groupId]) gmap[n.groupId] = `g${s}${Object.keys(gmap).length}`;
        copyN.groupId = gmap[n.groupId];
      }
      return copyN;
    });
    const cw = c.wires.map((w, i) => ({ id: `w${s}${i}`, from: map[w.from], to: map[w.to], toPort: w.toPort }));
    editNodes((ns) => [...ns, ...created]);
    editWires((ws) => [...ws, ...cw]);
    selectNodes(created.map((n) => n.id));
  };

  const group = () => {
    if (selIds.length < 2) return;
    const g = `g${stamp()}`;
    editNodes((ns) => ns.map((n) => (selIds.includes(n.id) ? { ...n, groupId: g } : n)));
  };
  const ungroup = () => editNodes((ns) => ns.map((n) => {
    if (!selIds.includes(n.id) || !n.groupId) return n;
    const { groupId, ...rest } = n; // eslint-disable-line no-unused-vars
    return rest;
  }));
  const arrange = (kind) => moveNodes(arrangeNodes(nodes, selIds, kind));

  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === 'Escape') { setPending(null); selectNodes([]); return; }
      if (mode !== 'edit') return;
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      else if (mod && k === 'a') { e.preventDefault(); selectNodes(nodes.map((n) => n.id)); }
      else if (mod && k === 'c') copy();
      else if (mod && k === 'v') { e.preventDefault(); paste(); }
      else if (mod && k === 'x') { copy(); deleteSelected(); }
      else if (mod && k === 'd') { e.preventDefault(); copy(); paste(); }
      else if (mod && k === 'g') { e.preventDefault(); if (e.shiftKey) ungroup(); else group(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const doImport = (d) => {
    setNodes(d.nodes); setWires(d.wires); selectNodes([]); setDirty(true);
    if (d.title && !name) setName(d.title);
    setTimeout(() => canvas.current?.fit(), 50);
  };

  const changeMode = (m) => { setMode(m); setPending(null); sim.setRunning(true); };

  if (!loaded) return <div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" /></div>;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <EditorToolbar name={name} onName={(v) => { setName(v); setDirty(true); }} saving={saving || dirty} mode={mode} onMode={changeMode}
        running={sim.running} onRun={() => sim.setRunning(!sim.running)} onReset={sim.reset} canvas={canvas}
        onImport={() => setImportOpen(true)} showInfo={showInfo} onInfo={() => setShowInfo(!showInfo)}
        showPalette={showPalette} onPalette={() => setShowPalette(!showPalette)}
        symStyle={symStyle} onSymStyle={(v) => { setSymStyle(v); setDirty(true); }} />
      <div className="relative flex min-h-0 flex-1">
        {mode === 'edit' && showPalette && <div className="absolute inset-y-0 left-0 z-20 lg:static"><SymbolPalette onAdd={addNode} /></div>}
        <div className="relative min-w-0 flex-1">
          <LogicCanvas ref={canvas} nodes={nodes} wires={wires} values={sim.values} mode={mode} selection={selection} selectedIds={selIds}
            trace={trace} pending={pending} symStyle={symStyle}
            onSelect={onSelect} onNodeSelect={onNodeSelect} onMarquee={onMarquee} onMoveNodes={moveNodes}
            onPort={onPort} onConnect={onConnect} onInput={sim.setInput} />
          {mode === 'edit' && (
            <SelectionBar count={selIds.length} canPaste={hasClip} canUngroup={nodes.some((n) => selIds.includes(n.id) && n.groupId)}
              onCopy={copy} onPaste={paste} onGroup={group} onUngroup={ungroup} onArrange={arrange} onDelete={deleteSelected} />
          )}
        </div>
        {showInfo && (
          <div className="absolute inset-y-0 right-0 z-20 lg:static">
            <InfoPanel nodes={nodes} wires={wires} values={sim.values} selection={selection} trace={trace} mode={mode}
              onSelect={onSelect} onChange={changeNode} onDelete={deleteSelected} />
          </div>
        )}
      </div>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} hasExisting={nodes.length > 0} onConfirm={doImport} />
    </div>
  );
}
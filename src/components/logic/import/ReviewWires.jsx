import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, ArrowRight, Plus } from 'lucide-react';
import NativeSelect from '@/components/logic/NativeSelect';
import { SYMBOLS } from '@/lib/logic/symbols';

const name = (n) => (n ? `${n.tag || n.label || SYMBOLS[n.type].label} (${n.id})` : '?');

export default function ReviewWires({ nodes, wires, onAdd, onRemove }) {
  const sources = nodes.filter((n) => SYMBOLS[n.type].out !== false);
  const targets = nodes.filter((n) => SYMBOLS[n.type].inputs > 0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [port, setPort] = useState(1);
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {wires.map((w) => (
          <div key={w.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
            <span className="flex-1 truncate">{name(byId[w.from])}</span><ArrowRight className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">{name(byId[w.to])} · in {w.toPort + 1}</span>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onRemove(w.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
        {wires.length === 0 && <p className="text-sm text-muted-foreground">No wires detected.</p>}
      </div>
      <div className="space-y-2 rounded-lg border border-dashed p-3">
        <p className="text-xs font-semibold">Add a missing wire</p>
        <NativeSelect value={from} onChange={setFrom} options={[{ value: '', label: 'From (source)…' }, ...sources.map((n) => ({ value: n.id, label: name(n) }))]} />
        <NativeSelect value={to} onChange={setTo} options={[{ value: '', label: 'To (destination)…' }, ...targets.map((n) => ({ value: n.id, label: name(n) }))]} />
        <div className="flex gap-2">
          <Input type="number" min={1} max={6} value={port} onChange={(e) => setPort(Number(e.target.value) || 1)} className="w-24" />
          <Button size="sm" disabled={!from || !to} onClick={() => { onAdd({ from, to, toPort: port - 1 }); setFrom(''); setTo(''); }}><Plus className="mr-1 h-4 w-4" />Add wire</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Input number counts from the top of the destination symbol (1 = top).</p>
      </div>
    </div>
  );
}
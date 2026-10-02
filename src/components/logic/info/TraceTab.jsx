import React from 'react';
import { SYMBOLS } from '@/lib/logic/symbols';

function List({ title, color, ids, nodes, values, onSelect }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{title} ({ids.length})
      </p>
      {ids.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
      <div className="space-y-1">
        {ids.map((id) => {
          const n = nodes.find((x) => x.id === id);
          if (!n) return null;
          return (
            <button key={id} onClick={() => onSelect({ kind: 'node', id })}
              className="flex w-full items-center justify-between rounded-md border bg-background px-2.5 py-1.5 text-left text-xs hover:bg-accent">
              <span><b>{n.tag || n.label || SYMBOLS[n.type].label}</b><span className="block text-[10px] text-muted-foreground">{SYMBOLS[n.type].label}{n.address ? ` · ${n.address}` : ''}</span></span>
              <span className={`font-mono font-semibold ${values[id] ? 'text-green-600' : 'text-muted-foreground'}`}>{values[id] ? '1' : '0'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TraceTab({ trace, nodes, values, onSelect }) {
  if (!trace) return <p className="text-sm text-muted-foreground">Select a symbol or wire. Everything that feeds it is shown in blue and everything it drives in orange on the diagram.</p>;
  return (
    <div className="space-y-4">
      <List title="Sources (upstream)" color="hsl(var(--cv-up))" ids={[...trace.upNodes]} nodes={nodes} values={values} onSelect={onSelect} />
      <List title="Drives (downstream)" color="hsl(var(--cv-down))" ids={[...trace.downNodes]} nodes={nodes} values={values} onSelect={onSelect} />
    </div>
  );
}
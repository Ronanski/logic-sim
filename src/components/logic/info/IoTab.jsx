import React from 'react';
import { SYMBOLS, KIND_LABEL } from '@/lib/logic/symbols';

function Rows({ title, items, values, onSelect }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title} ({items.length})</p>
      <div className="space-y-1">
        {items.map((n) => (
          <button key={n.id} onClick={() => onSelect({ kind: 'node', id: n.id })}
            className="flex w-full items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left hover:bg-accent">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${values[n.id] ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{n.tag || SYMBOLS[n.type].label}</span>
              <span className="block truncate text-[10px] text-muted-foreground">{n.service || '—'}</span>
              <span className="block truncate font-mono text-[10px] text-muted-foreground">{n.address || 'no address'}</span>
            </span>
            {n.addrKind && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold" title={KIND_LABEL[n.addrKind]}>{n.addrKind}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function IoTab({ nodes, values, onSelect }) {
  const ins = nodes.filter((n) => SYMBOLS[n.type].source);
  const outs = nodes.filter((n) => SYMBOLS[n.type].out === false && SYMBOLS[n.type].inputs > 0);
  return (
    <div className="space-y-4">
      <Rows title="Inputs" items={ins} values={values} onSelect={onSelect} />
      <Rows title="Outputs" items={outs} values={values} onSelect={onSelect} />
    </div>
  );
}
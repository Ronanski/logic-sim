import React from 'react';
import { GROUPS, SYMBOLS } from '@/lib/logic/symbols';

export default function SymbolPalette({ onAdd }) {
  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold">Symbol Library</p>
        <p className="text-xs text-muted-foreground">Click a symbol to place it. Connect: click an output dot, then an input dot.</p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {GROUPS.map((g) => (
          <div key={g}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</p>
            <div className="space-y-1.5">
              {Object.entries(SYMBOLS).filter(([, s]) => s.group === g).map(([type, s]) => (
                <button
                  key={type}
                  onClick={() => onAdd(type)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-left transition hover:border-primary hover:bg-accent"
                >
                  <span className="text-sm font-medium">{s.label}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-muted-foreground">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
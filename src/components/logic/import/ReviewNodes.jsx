import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Trash2, AlertTriangle } from 'lucide-react';
import NativeSelect from '@/components/logic/NativeSelect';
import { SYMBOLS, ADDRESS_KINDS, KIND_LABEL } from '@/lib/logic/symbols';

const TYPE_OPTS = Object.entries(SYMBOLS).map(([value, s]) => ({ value, label: s.label }));
const KIND_OPTS = ADDRESS_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }));

export default function ReviewNodes({ nodes, onChange, onRemove }) {
  const [onlyCheck, setOnlyCheck] = useState(false);
  const list = nodes.filter((n) => !onlyCheck || n.confidence < 0.75);
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm"><Switch checked={onlyCheck} onCheckedChange={setOnlyCheck} />Show only uncertain symbols ({nodes.filter((n) => n.confidence < 0.75).length})</label>
      {list.map((n) => {
        const s = SYMBOLS[n.type];
        const unsure = n.confidence < 0.75;
        return (
          <div key={n.id} className={`rounded-lg border p-3 ${unsure ? 'border-amber-400 bg-amber-400/5' : ''}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{n.id}</span>
              {unsure && <span className="flex items-center gap-1 text-xs font-medium text-amber-600"><AlertTriangle className="h-3.5 w-3.5" />Please check ({Math.round(n.confidence * 100)}%)</span>}
              <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" onClick={() => onRemove(n.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            {n.note && <p className="mb-2 text-xs text-muted-foreground">{n.note}</p>}
            <div className="grid grid-cols-2 gap-2">
              <NativeSelect value={n.type} onChange={(v) => onChange(n.id, { type: v, confidence: 1 })} options={TYPE_OPTS} />
              <Input placeholder="Tag / label" value={n.tag || n.label || ''} onChange={(e) => onChange(n.id, s.wide ? { tag: e.target.value } : { label: e.target.value })} />
              {s.wide && <Input className="col-span-2" placeholder="Service" value={n.service || ''} onChange={(e) => onChange(n.id, { service: e.target.value })} />}
              {s.wide && <Input className="font-mono" placeholder="Address" value={n.address || ''} onChange={(e) => onChange(n.id, { address: e.target.value })} />}
              {s.wide && <NativeSelect value={n.addrKind || ''} onChange={(v) => onChange(n.id, { addrKind: v })} options={KIND_OPTS} />}
              {s.delay && <Input type="number" placeholder="Delay (s)" value={n.delay ?? 3} onChange={(e) => onChange(n.id, { delay: Number(e.target.value) })} />}
            </div>
            {unsure && <Button size="sm" variant="outline" className="mt-2" onClick={() => onChange(n.id, { confidence: 1 })}>Mark as correct</Button>}
          </div>
        );
      })}
    </div>
  );
}
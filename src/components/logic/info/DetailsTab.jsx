import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Trash2 } from 'lucide-react';
import NativeSelect from '@/components/logic/NativeSelect';
import { SYMBOLS, ADDRESS_KINDS, KIND_LABEL } from '@/lib/logic/symbols';

const Field = ({ label, children }) => (
  <div className="space-y-1"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>
);

export default function DetailsTab({ node, wire, nodes, values, mode, onChange, onDelete }) {
  if (wire) {
    const a = nodes.find((n) => n.id === wire.from);
    const b = nodes.find((n) => n.id === wire.to);
    return (
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between"><p className="font-semibold">Wire</p>
          <Badge variant={values[wire.from] ? 'default' : 'secondary'}>{values[wire.from] ? 'Signal 1' : 'Signal 0'}</Badge></div>
        <p className="text-muted-foreground">From <b className="text-foreground">{a?.tag || a?.label || a?.type}</b><br />
          To <b className="text-foreground">{b?.tag || b?.label || b?.type}</b> (input {wire.toPort + 1})</p>
        {mode === 'edit' && <Button size="sm" variant="destructive" onClick={onDelete}><Trash2 className="mr-1 h-4 w-4" />Delete wire</Button>}
      </div>
    );
  }
  if (!node) return <p className="text-sm text-muted-foreground">Select an input, output, logic symbol or wire to see its details and trace its signal path.</p>;
  const s = SYMBOLS[node.type];
  const set = (k) => (v) => onChange(node.id, { [k]: v });
  if (node.type === 'text') {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold">Text</p>
        <Field label="Text"><Input value={node.text || ''} onChange={(e) => set('text')(e.target.value)} /></Field>
        <Field label="Font size"><Input type="number" min="8" max="72" value={node.fontSize || 14} onChange={(e) => set('fontSize')(Math.min(72, Math.max(8, Number(e.target.value) || 14)))} /></Field>
        {mode === 'edit' && <Button size="sm" variant="destructive" onClick={onDelete}><Trash2 className="mr-1 h-4 w-4" />Delete text</Button>}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div><p className="text-sm font-semibold">{s.label}</p><p className="text-[11px] text-muted-foreground">ID {node.id}</p></div>
        <Badge variant={values[node.id] ? 'default' : 'secondary'}>{values[node.id] ? 'ON (1)' : 'OFF (0)'}</Badge>
      </div>
      <p className="rounded-md bg-muted p-2 text-xs leading-relaxed text-muted-foreground">{s.desc}</p>
      {s.truth.length > 0 && (
        <div className="rounded-md border p-2 font-mono text-[11px] leading-5">{s.truth.map((r) => <div key={r}>{r}</div>)}</div>
      )}
      <Field label="Tag no."><Input value={node.tag || ''} onChange={(e) => set('tag')(e.target.value)} /></Field>
      <Field label="Service / description"><Input value={node.service || ''} onChange={(e) => set('service')(e.target.value)} /></Field>
      {(s.wide) && (
        <>
          <Field label="Address"><Input className="font-mono" value={node.address || ''} onChange={(e) => set('address')(e.target.value)} /></Field>
          <Field label="Address type (IRP / ARP / CRT / hardwire)">
            <NativeSelect value={node.addrKind || ''} onChange={set('addrKind')} options={ADDRESS_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
          </Field>
        </>
      )}
      {!s.wide && <Field label="Label"><Input value={node.label || ''} onChange={(e) => set('label')(e.target.value)} /></Field>}
      {s.delay && <Field label="Delay (seconds)"><Input type="number" min="0" step="0.5" value={node.delay ?? 3} onChange={(e) => set('delay')(Number(e.target.value))} /></Field>}
      {s.max && <Field label="Number of inputs"><Input type="number" min={s.min} max={s.max} value={node.inputs ?? s.inputs} onChange={(e) => set('inputs')(Math.min(s.max, Math.max(s.min, Number(e.target.value) || s.min)))} /></Field>}
      {node.type === 'pushbutton' && (
        <label className="flex items-center gap-2 text-sm"><Switch checked={!!node.latch} onCheckedChange={set('latch')} />Latching (click to hold ON)</label>
      )}
      {node.note && <p className="rounded-md border border-amber-400/50 bg-amber-400/10 p-2 text-xs">Import note: {node.note}</p>}
      {mode === 'edit' && <Button size="sm" variant="destructive" onClick={onDelete}><Trash2 className="mr-1 h-4 w-4" />Delete symbol</Button>}
    </div>
  );
}
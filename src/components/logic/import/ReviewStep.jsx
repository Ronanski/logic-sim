import React from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertTriangle } from 'lucide-react';
import ReviewNodes from '@/components/logic/import/ReviewNodes';
import ReviewWires from '@/components/logic/import/ReviewWires';
import LogicCanvas from '@/components/logic/LogicCanvas';
import { cleanWires } from '@/lib/logic/importMap';

export default function ReviewStep({ data, setData, imageUrl, hasExisting, onConfirm, onCancel }) {
  const { nodes, wires, warnings } = data;
  const patch = (id, p) => setData({ ...data, nodes: nodes.map((n) => (n.id === id ? { ...n, ...p } : n)) });
  const remove = (id) => setData({ ...data, nodes: nodes.filter((n) => n.id !== id), wires: wires.filter((w) => w.from !== id && w.to !== id) });
  const addWire = (w) => setData({ ...data, wires: cleanWires(nodes, [...wires, w]) });
  const rmWire = (id) => setData({ ...data, wires: wires.filter((w) => w.id !== id) });
  const unsure = nodes.filter((n) => n.confidence < 0.75).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-md bg-muted px-2 py-1">{nodes.length} symbols</span>
        <span className="rounded-md bg-muted px-2 py-1">{wires.length} wires</span>
        {unsure > 0 && <span className="flex items-center gap-1 rounded-md bg-amber-400/20 px-2 py-1 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />{unsure} need review</span>}
        {warnings.map((w, i) => <span key={i} className="text-xs text-muted-foreground">• {w}</span>)}
      </div>
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <div className="hidden min-h-0 overflow-auto rounded-lg border bg-muted/30 lg:block">
          {imageUrl && <img src={imageUrl} alt="Imported drawing" className="w-full" />}
        </div>
        <Tabs defaultValue="symbols" className="flex min-h-0 flex-col">
          <TabsList className="grid grid-cols-3"><TabsTrigger value="symbols">Symbols</TabsTrigger><TabsTrigger value="wires">Wires</TabsTrigger><TabsTrigger value="preview">Preview</TabsTrigger></TabsList>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            <TabsContent value="symbols" className="mt-0"><ReviewNodes nodes={nodes} onChange={patch} onRemove={remove} /></TabsContent>
            <TabsContent value="wires" className="mt-0"><ReviewWires nodes={nodes} wires={wires} onAdd={addWire} onRemove={rmWire} /></TabsContent>
            <TabsContent value="preview" className="mt-0 h-[360px] overflow-hidden rounded-lg border">
              <LogicCanvas nodes={nodes} wires={wires} mode="view" onSelect={() => {}} onMoveNode={() => {}} onPort={() => {}} onInput={() => {}} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
      <div className="flex items-center justify-end gap-2 border-t pt-3">
        {hasExisting && <span className="mr-auto text-xs text-muted-foreground">This replaces the current diagram.</span>}
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onConfirm(data)} disabled={nodes.length === 0}>Import {nodes.length} symbols</Button>
      </div>
    </div>
  );
}
import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import DetailsTab from '@/components/logic/info/DetailsTab';
import TraceTab from '@/components/logic/info/TraceTab';
import IoTab from '@/components/logic/info/IoTab';

export default function InfoPanel({ nodes, wires, values, selection, trace, mode, onSelect, onChange, onDelete }) {
  const node = selection?.kind === 'node' ? nodes.find((n) => n.id === selection.id) : null;
  const wire = selection?.kind === 'wire' ? wires.find((w) => w.id === selection.id) : null;
  return (
    <div className="flex h-full w-80 max-w-[88vw] flex-col border-l bg-card">
      <Tabs defaultValue="details" className="flex h-full flex-col">
        <TabsList className="m-3 grid grid-cols-3">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="trace">Trace</TabsTrigger>
          <TabsTrigger value="io">I/O List</TabsTrigger>
        </TabsList>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <TabsContent value="details" className="mt-0">
            <DetailsTab node={node} wire={wire} nodes={nodes} values={values} mode={mode} onChange={onChange} onDelete={onDelete} />
          </TabsContent>
          <TabsContent value="trace" className="mt-0"><TraceTab trace={trace} nodes={nodes} values={values} onSelect={onSelect} /></TabsContent>
          <TabsContent value="io" className="mt-0"><IoTab nodes={nodes} values={values} onSelect={onSelect} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
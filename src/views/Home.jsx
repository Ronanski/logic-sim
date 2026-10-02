
import React, { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { listDiagrams, createDiagram, deleteDiagram } from '@/lib/diagrams';
import { logout } from '@/lib/auth';

import { Button } from '@/components/ui/button';
import { Plus, Upload, Sparkles, Trash2, Cpu, LogOut } from 'lucide-react';
import ThemeSwitcher from '@/components/logic/ThemeSwitcher';
import ImportDialog from '@/components/logic/import/ImportDialog';
import { SAMPLE } from '@/lib/logic/sample';

export default function Home() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setItems(await listDiagrams(50));
  };
  useEffect(() => { load(); }, []);

  const create = async (data) => {
    const rec = await createDiagram(data);
    navigate({ to: '/diagram/$id', params: { id: rec.id } });
  };
  const remove = async (e, id) => {
    e.stopPropagation();
    await deleteDiagram(id);
    load();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 border-b bg-card px-5 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Cpu className="h-5 w-5" /></div>
        <div className="mr-auto"><p className="font-semibold leading-tight">DCS Logic Studio</p><p className="text-xs text-muted-foreground">Interlock logic builder &amp; simulator</p></div>
        <ThemeSwitcher />
        <Button variant="ghost" size="icon" title="Log out" onClick={() => logout()}><LogOut className="h-4 w-4" /></Button>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Logic diagrams</h1>
        <p className="mt-1 text-muted-foreground">Build interlock logic, import it from a drawing, and simulate it live.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => create({ name: 'Untitled diagram', nodes: [], wires: [] })}><Plus className="mr-1 h-4 w-4" />New diagram</Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="mr-1 h-4 w-4" />Import from screenshot</Button>
          <Button variant="outline" onClick={() => create(SAMPLE)}><Sparkles className="mr-1 h-4 w-4" />Load sample</Button>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {items === null && <p className="text-sm text-muted-foreground">Loading…</p>}
          {items?.length === 0 && <p className="text-sm text-muted-foreground">No diagrams yet — start with the sample to see the simulator in action.</p>}
          {items?.map((d) => (
            <div key={d.id} onClick={() => navigate({ to: '/diagram/$id', params: { id: d.id } })} className="group flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-4 transition hover:border-primary hover:shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground">{(d.nodes || []).length} symbols · {(d.wires || []).length} wires · {new Date(d.updated_date).toLocaleDateString()}</p>
              </div>
              <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={(e) => remove(e, d.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </main>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} hasExisting={false}
        onConfirm={(d) => create({ name: d.title || 'Imported diagram', nodes: d.nodes, wires: d.wires })} />
    </div>
  );
}
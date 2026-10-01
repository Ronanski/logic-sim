import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { LogicNodeType } from "@/lib/logic-graph/types";
import {
  BLOCK_TYPES,
  SOURCES,
  defaultLibrary,
  loadLibrary,
  parseLibrary,
  resolveSymbol,
  saveLibrary,
  type MappingSource,
  type SymbolLibrary,
  type SymbolMapping,
} from "@/lib/symbol-library/library";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — LogicSim" },
      { name: "description", content: "Manage the symbol library that maps drawing blocks, layers and keywords to logic blocks." },
      { property: "og:title", content: "Settings — LogicSim" },
      { property: "og:description", content: "Manage the LogicSim symbol library mappings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

type Draft = Omit<SymbolMapping, "id"> & { id?: string };
const emptyDraft: Draft = { source: "keyword", pattern: "", blockType: "AND", priority: 50 };

function SettingsPage() {
  const [lib, setLib] = useState<SymbolLibrary>(defaultLibrary);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [test, setTest] = useState({ blockName: "", layerName: "", text: "FIC-101" });

  useEffect(() => {
    setLib(loadLibrary());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) saveLibrary(lib);
  }, [lib, loaded]);

  const rows = useMemo(() => {
    const f = filter.trim().toUpperCase();
    return [...lib.mappings]
      .filter((m) => !f || m.pattern.toUpperCase().includes(f) || m.blockType.includes(f) || m.source.toUpperCase().includes(f))
      .sort((a, b) => a.source.localeCompare(b.source) || b.priority - a.priority || a.pattern.localeCompare(b.pattern));
  }, [lib, filter]);

  const matches = useMemo(() => resolveSymbol(lib, test), [lib, test]);

  const saveDraft = () => {
    if (!draft || !draft.pattern.trim()) return;
    const m: SymbolMapping = { ...draft, pattern: draft.pattern.trim(), id: draft.id ?? crypto.randomUUID() };
    setLib((l) => ({
      ...l,
      mappings: draft.id ? l.mappings.map((x) => (x.id === draft.id ? m : x)) : [...l.mappings, m],
    }));
    setDraft(null);
  };

  const duplicate =
    draft &&
    lib.mappings.some(
      (m) => m.id !== draft.id && m.source === draft.source && m.pattern.toUpperCase() === draft.pattern.trim().toUpperCase(),
    );

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Symbol library: rules that map drawing block names, layer names and keywords to function block types.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setJsonText(JSON.stringify(lib, null, 2));
              setJsonError("");
              setJsonOpen(true);
            }}
          >
            Edit JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLib(defaultLibrary())}>
            <RotateCcw className="h-4 w-4" /> Reset defaults
          </Button>
          <Button size="sm" onClick={() => setDraft({ ...emptyDraft })}>
            <Plus className="h-4 w-4" /> Add mapping
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mappings ({lib.mappings.length})</CardTitle>
            <Input placeholder="Filter by pattern, type or source…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead>Block type</TableHead>
                  <TableHead className="text-right">Priority</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Badge variant="secondary">{m.source}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{m.pattern}</TableCell>
                    <TableCell>{m.blockType}</TableCell>
                    <TableCell className="text-right">{m.priority}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" aria-label={`Edit ${m.pattern}`} onClick={() => setDraft({ ...m })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${m.pattern}`}
                        onClick={() => setLib((l) => ({ ...l, mappings: l.mappings.filter((x) => x.id !== m.id) }))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No mappings.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Test lookup</CardTitle>
            <CardDescription>Check which rule wins for a symbol.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {(["blockName", "layerName", "text"] as const).map((k) => (
              <div key={k} className="flex flex-col gap-2">
                <Label htmlFor={k}>{k === "blockName" ? "Block name" : k === "layerName" ? "Layer name" : "Tag / text"}</Label>
                <Input id={k} value={test[k]} onChange={(e) => setTest((t) => ({ ...t, [k]: e.target.value }))} />
              </div>
            ))}
            <div className="flex flex-col gap-2 text-sm">
              {matches.length === 0 ? (
                <span className="text-muted-foreground">No match — would be flagged for review.</span>
              ) : (
                matches.map((r, i) => (
                  <div key={r.mapping.id} className="flex items-center justify-between gap-2">
                    <span className={i === 0 ? "font-semibold" : "text-muted-foreground"}>
                      {r.blockType} <span className="text-xs text-muted-foreground">via {r.mapping.source} "{r.mapping.pattern}"</span>
                    </span>
                    {i === 0 && <Badge>Winner</Badge>}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit mapping" : "Add mapping"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Source</Label>
                <Select value={draft.source} onValueChange={(v) => setDraft({ ...draft, source: v as MappingSource })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pattern">Pattern</Label>
                <Input id="pattern" value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} placeholder="e.g. FIC" />
                {duplicate && <span className="text-xs text-destructive">A mapping with this source and pattern already exists.</span>}
              </div>
              <div className="flex flex-col gap-2">
                <Label>Block type</Label>
                <Select value={draft.blockType} onValueChange={(v) => setDraft({ ...draft, blockType: v as LogicNodeType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BLOCK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="priority">Priority</Label>
                <Input id="priority" type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={saveDraft} disabled={!draft?.pattern.trim() || !!duplicate}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={jsonOpen} onOpenChange={setJsonOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Symbol library JSON</DialogTitle>
          </DialogHeader>
          <Textarea className="h-96 font-mono text-xs" value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
          {jsonError && <span className="text-xs text-destructive">{jsonError}</span>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setJsonOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                try {
                  setLib(parseLibrary(jsonText));
                  setJsonOpen(false);
                } catch (e) {
                  setJsonError((e as Error).message);
                }
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

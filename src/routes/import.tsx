import { useRef, useState, type DragEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, FileJson, FileUp, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SAMPLE_GRAPH_JSON, convertGraphJson } from "@/lib/import/graph-json";
import { ALLOWED_EXTENSIONS, MAX_FILE_BYTES, parseDrawing } from "@/lib/import/parse-drawing.functions";
import { reviewActions } from "@/lib/review/review-store";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Import — LogicSim" },
      { name: "description", content: "Upload DXF, DWG or PDF drawings to extract control logic." },
      { property: "og:title", content: "Import — LogicSim" },
      { property: "og:description", content: "Upload DXF, DWG or PDF drawings to extract control logic." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ImportPage,
});

type Status = "idle" | "uploading" | "converting" | "parsing" | "done" | "failed";
const steps: Status[] = ["uploading", "converting", "parsing", "done"];
const stepLabel: Record<Status, string> = {
  idle: "Waiting for file",
  uploading: "Uploading",
  converting: "Converting",
  parsing: "Parsing",
  done: "Done",
  failed: "Failed",
};

function validate(file: File): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    return `"${file.name}" is not supported. Use a .dxf, .dwg or .pdf file.`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1048576} MB.`;
  }
  return null;
}

function ImportPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = status === "uploading" || status === "converting" || status === "parsing";

  async function handleFiles(files: FileList | null) {
    if (busy || !files?.length) return;
    if (files.length > 1) {
      setStatus("failed");
      setError("Drop one drawing at a time.");
      return;
    }
    const file = files[0];
    setFileName(file.name);
    const problem = validate(file);
    if (problem) {
      setStatus("failed");
      setError(problem);
      return;
    }
    setError(null);
    setStatus("uploading");
    // The parser handles conversion and parsing in one request; advance the
    // visible step while the request is in flight.
    const t1 = setTimeout(() => setStatus((s) => (s === "uploading" ? "converting" : s)), 600);
    const t2 = setTimeout(() => setStatus((s) => (s === "converting" ? "parsing" : s)), 1200);
    try {
      const result = await parseDrawing(file);
      clearTimeout(t1);
      clearTimeout(t2);
      reviewActions.loadImport(result.graph, result.items);
      setStatus("done");
      setTimeout(() => navigate({ to: "/review" }), 800);
    } catch (err) {
      clearTimeout(t1);
      clearTimeout(t2);
      setStatus("failed");
      setError(err instanceof Error ? err.message : "Something went wrong while parsing the drawing.");
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void handleFiles(e.dataTransfer.files);
  }

  const currentIdx = steps.indexOf(status);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Import</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload one engineering drawing (.dxf, .dwg or .pdf, up to {MAX_FILE_BYTES / 1048576} MB).
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a drawing here or click to choose a file"
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex min-h-64 cursor-pointer flex-col items-center justify-center gap-4 rounded-md border border-dashed p-6 text-center transition-colors",
          dragging ? "border-primary bg-accent" : "hover:bg-accent",
          busy && "cursor-not-allowed opacity-60",
        )}
      >
        <FileUp className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{dragging ? "Release to upload" : "Drag a drawing here"}</p>
          <p className="mt-2 text-xs text-muted-foreground">or click to choose a file</p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} type="button">
          Select file
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <GraphJsonCard />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Import failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {status !== "idle" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="truncate text-sm">{fileName}</CardTitle>
            <Badge variant={status === "failed" ? "destructive" : status === "done" ? "default" : "secondary"}>
              {stepLabel[status]}
            </Badge>
          </CardHeader>
          <CardContent>
            <ol className="grid grid-cols-4 gap-2">
              {steps.map((s, i) => {
                const reached = status !== "failed" && currentIdx >= i;
                const active = status === s && busy;
                return (
                  <li
                    key={s}
                    className={cn(
                      "flex items-center gap-2 rounded-md border p-2 text-xs",
                      reached ? "border-primary text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {active ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className={cn("h-4 w-4", reached ? "text-primary" : "text-muted-foreground")} />
                    )}
                    {stepLabel[s]}
                  </li>
                );
              })}
            </ol>
            {status === "done" && (
              <p className="mt-4 text-xs text-muted-foreground">Opening Review…</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const MAX_JSON_BYTES = 5 * 1048576;

function GraphJsonCard() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(SAMPLE_GRAPH_JSON);
  const [name, setName] = useState("DITL-03A (graph JSON)");
  const [error, setError] = useState<string | null>(null);

  function load(source: string, label: string) {
    try {
      const result = convertGraphJson(source, label);
      setError(null);
      reviewActions.loadImport(result.graph, result.items);
      navigate({ to: "/review" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the graph JSON.");
    }
  }

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_JSON_BYTES) {
      setError(`"${file.name}" is larger than 5 MB.`);
      return;
    }
    const content = await file.text();
    setText(content);
    setName(file.name);
    load(content, file.name);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileJson className="h-4 w-4 text-muted-foreground" /> Load graph JSON
        </CardTitle>
        <Button size="sm" variant="outline" type="button" onClick={() => fileRef.current?.click()}>
          Upload .json
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files);
            e.target.value = "";
          }}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Upload a file or paste JSON with nodes and edges. The sample graph DITL-03A is loaded below.
        </p>
        <Textarea
          aria-label="Graph JSON"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setName("Pasted graph JSON");
          }}
          className="h-48 font-mono text-xs"
          spellCheck={false}
        />
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Graph JSON not loaded</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end">
          <Button size="sm" type="button" onClick={() => load(text, name)} disabled={!text.trim()}>
            Load graph
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

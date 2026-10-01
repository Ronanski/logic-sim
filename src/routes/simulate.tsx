import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Background,
  Controls,
  ReactFlow,
  applyNodeChanges,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Activity,
  Check,
  Pause,
  Play,
  RotateCcw,
  StepForward,
  Sliders,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { LogicNodeView, type LogicFlowNode } from "@/components/logic-graph/logic-node";
import { NodeParamsPanel } from "@/components/logic-graph/node-params-panel";
import {
  SimulationEngine,
  makePortKey,
  type FeedbackLoopWarning,
  type SignalValueMap,
} from "@/lib/logic-graph/engine";
import { defaultGraph, sampleGraphs } from "@/lib/logic-graph/samples";
import type { LogicGraph, LogicParamValue } from "@/lib/logic-graph/types";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { blockingCount, reviewActions, useReview } from "@/lib/review/review-store";

export const Route = createFileRoute("/simulate")({
  head: () => ({
    meta: [
      { title: "Simulate — LogicSim" },
      { name: "description", content: "Run imported control logic and observe signal behavior." },
      { property: "og:title", content: "Simulate — LogicSim" },
      { property: "og:description", content: "Run imported control logic and observe signal behavior." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SimulateGate,
});

const nodeTypes = { logic: LogicNodeView };

const flowTheme = {
  "--xy-background-color": "var(--background)",
  "--xy-edge-stroke": "var(--muted-foreground)",
  "--xy-edge-stroke-selected": "var(--primary)",
  "--xy-handle-background-color": "var(--muted-foreground)",
  "--xy-handle-border-color": "var(--card)",
  "--xy-controls-button-background-color": "var(--card)",
  "--xy-controls-button-background-color-hover": "var(--accent)",
  "--xy-controls-button-color": "var(--foreground)",
  "--xy-controls-button-border-color": "var(--border)",
  "--xy-background-pattern-dots-color": "var(--border)",
  "--xy-node-boxshadow-selected": "none",
} as CSSProperties;

function toFlowNodes(graph: LogicGraph): LogicFlowNode[] {
  return graph.nodes.map((n, i) => ({
    id: n.id,
    type: "logic",
    position: n.position ?? { x: i * 240, y: 0 },
    data: { node: n },
  }));
}

interface TrendPoint {
  time: string;
  cycle: number;
  [signalKey: string]: number | string;
}

function SimulateGate() {
  const review = useReview();
  const remaining = blockingCount(review);
  if (remaining > 0 && !review.override) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-primary" /> Simulation blocked
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {remaining} review item{remaining === 1 ? " is" : "s are"} unresolved. Resolve them first, or override to simulate anyway.
            </p>
            <div className="flex gap-2">
              <Button asChild><Link to="/review">Go to Review</Link></Button>
              <Button variant="outline" onClick={() => reviewActions.setOverride(true)}>Override and continue</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      {remaining > 0 && (
        <div className="flex items-center justify-between gap-2 border-b px-6 py-2 text-xs text-muted-foreground">
          <span>Override active: {remaining} review item{remaining === 1 ? "" : "s"} still unresolved.</span>
          <Button size="sm" variant="ghost" onClick={() => reviewActions.setOverride(false)}>Cancel override</Button>
        </div>
      )}
      <div className="min-h-0 flex-1"><SimulatePage /></div>
    </div>
  );
}

function SimulatePage() {
  const review = useReview();
  // A graph loaded from graph JSON is offered first and selected by default.
  const imported = review.graph.id === "json-import" ? structuredClone(review.graph) : null;
  const [graphs, setGraphs] = useState<LogicGraph[]>(() => (imported ? [imported, ...sampleGraphs] : sampleGraphs));
  const [graphId, setGraphId] = useState(imported?.id ?? defaultGraph.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flowNodes, setFlowNodes] = useState<LogicFlowNode[]>(() => toFlowNodes(imported ?? defaultGraph));

  // Simulation execution state
  const [isRunning, setIsRunning] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [signals, setSignals] = useState<SignalValueMap>({});
  const [warnings, setWarnings] = useState<FeedbackLoopWarning[]>([]);
  const [forcedInputs, setForcedInputs] = useState<Record<string, number | boolean>>({});

  // Trend chart history & signal selection
  const [trendHistory, setTrendHistory] = useState<TrendPoint[]>([]);
  const [selectedChartSignals, setSelectedChartSignals] = useState<string[]>([]);

  // Simple physics model for PID sample (tank liquid level)
  const tankLevelRef = useRef<number>(20); // initial 20% level

  const graph = graphs.find((g) => g.id === graphId) ?? defaultGraph;
  const outputLamps = graph.id === "json-import" ? graph.nodes.filter((n) => n.type === "DO") : [];
  const selectedNode = graph.nodes.find((n) => n.id === selectedId) ?? null;

  // Initialize engine instance
  const engineRef = useRef<SimulationEngine>(new SimulationEngine(graph));
  const workerRef = useRef<Worker | null>(null);

  // Sync engine when graph changes
  useEffect(() => {
    const engine = new SimulationEngine(graph);
    engineRef.current = engine;
    setWarnings(engine.getWarnings());
    setSignals({});
    setCycle(0);
    setTrendHistory([]);
    tankLevelRef.current = 20;

    // Default signal selection for chart based on graph
    if (graph.id === "tank-pid") {
      setSelectedChartSignals(["LT-301.PV", "LIC-301.SP", "LIC-301.CV"]);
    } else if (graph.id === "latch-ton") {
      setSelectedChartSignals(["HS-201.OUT", "SR-1.Q", "TON-1.Q", "XV-201.IN"]);
    } else {
      setSelectedChartSignals(["ZS-101.OUT", "PS-102.OUT", "M-101.IN"]);
    }
  }, [graphId, graph]);

  // Handle single scan step
  const executeScanStep = useCallback(
    (dtMs = 100) => {
      const engine = engineRef.current;
      if (!engine) return;

      // Tank simulation closed-loop for PID
      if (graphId === "tank-pid") {
        // Read valve position from current CV output (or last valve command)
        const valveKey = makePortKey("lv", "in");
        const pidCvKey = makePortKey("pid", "cv");
        const valvePos = Number(engine.step(0).signals[valveKey] ?? engine.step(0).signals[pidCvKey] ?? 0);

        // Tank physics: Inflow = valve% * 30% / s; Outflow = 12% / s
        const dtSec = dtMs / 1000;
        const inflow = (valvePos / 100) * 35;
        const outflow = 14;
        const newLevel = Math.max(0, Math.min(100, tankLevelRef.current + (inflow - outflow) * dtSec));
        tankLevelRef.current = newLevel;

        // Feed tank level into sensor LT-301
        engine.setInput("lt", "pv", Number(newLevel.toFixed(1)));
      }

      // Apply forced inputs
      for (const [key, val] of Object.entries(forcedInputs)) {
        const [nodeId, portId] = key.split(":");
        engine.setInput(nodeId, portId, val);
      }

      const res = engine.step(dtMs);
      setCycle(res.cycle);
      setSignals(res.signals);

      // Build chart trend record
      const nodeByTag = new Map(graph.nodes.map((n) => [n.id, n.tag]));
      const timeStr = `${(res.cycle * 0.1).toFixed(1)}s`;
      const point: TrendPoint = { time: timeStr, cycle: res.cycle };

      for (const [key, val] of Object.entries(res.signals)) {
        const [nodeId, portId] = key.split(":");
        const tag = nodeByTag.get(nodeId) || nodeId;
        const friendlyName = `${tag}.${portId.toUpperCase()}`;
        point[friendlyName] = typeof val === "boolean" ? (val ? 1 : 0) : Number(Number(val).toFixed(2));
      }

      setTrendHistory((prev) => {
        const next = [...prev, point];
        return next.length > 50 ? next.slice(next.length - 50) : next;
      });
    },
    [forcedInputs, graphId, graph.nodes],
  );

  // Simulation timer loop (100ms scan cycle)
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      executeScanStep(100);
    }, 100);

    return () => clearInterval(interval);
  }, [isRunning, executeScanStep]);

  // Run / Pause / Step / Reset controls
  const handleRun = () => setIsRunning(true);
  const handlePause = () => setIsRunning(false);
  const handleStep = () => {
    setIsRunning(false);
    executeScanStep(100);
  };
  const handleReset = () => {
    setIsRunning(false);
    engineRef.current.reset();
    tankLevelRef.current = 20;
    setCycle(0);
    setSignals({});
    setTrendHistory([]);
    setForcedInputs({});
  };

  // Toggle forced input for digital or analog inputs
  const handleToggleInput = (nodeId: string, portId: string, currentVal: boolean) => {
    const key = makePortKey(nodeId, portId);
    const nextVal = !currentVal;
    setForcedInputs((prev) => ({ ...prev, [key]: nextVal }));
    engineRef.current.setInput(nodeId, portId, nextVal);
  };

  const handleSliderInput = (nodeId: string, portId: string, value: number) => {
    const key = makePortKey(nodeId, portId);
    setForcedInputs((prev) => ({ ...prev, [key]: value }));
    engineRef.current.setInput(nodeId, portId, value);
  };

  // Active wire calculation
  const edges: Edge[] = useMemo(() => {
    return graph.edges.map((e) => {
      const srcKey = makePortKey(e.from.nodeId, e.from.portId);
      const val = signals[srcKey];
      const isActive = typeof val === "boolean" ? val : typeof val === "number" && val > 0;

      return {
        id: e.id,
        source: e.from.nodeId,
        sourceHandle: e.from.portId,
        target: e.to.nodeId,
        targetHandle: e.to.portId,
        type: "smoothstep",
        animated: isActive,
        style: {
          stroke: isActive ? "var(--primary)" : "var(--muted-foreground)",
          strokeWidth: isActive ? 2 : 1,
          transition: "stroke 150ms ease, stroke-width 150ms ease",
        },
      };
    });
  }, [graph, signals]);

  const switchGraph = (id: string) => {
    const next = graphs.find((g) => g.id === id);
    if (!next) return;
    setIsRunning(false);
    setGraphId(id);
    setSelectedId(null);
    setFlowNodes(toFlowNodes(next));
  };

  const onNodesChange = (changes: NodeChange<LogicFlowNode>[]) =>
    setFlowNodes((ns) => applyNodeChanges(changes, ns));

  const updateParam = (key: string, value: LogicParamValue) => {
    if (!selectedId) return;
    engineRef.current.updateNodeParams(selectedId, { [key]: value });
    const update = (g: LogicGraph): LogicGraph => ({
      ...g,
      nodes: g.nodes.map((n) =>
        n.id === selectedId ? { ...n, params: { ...n.params, [key]: value } } : n,
      ),
    });
    setGraphs((gs) => gs.map((g) => (g.id === graphId ? update(g) : g)));
    setFlowNodes((ns) =>
      ns.map((fn) => {
        if (fn.id !== selectedId) return fn;
        const node = update(graph).nodes.find((n) => n.id === selectedId);
        return node ? { ...fn, data: { node } } : fn;
      }),
    );
  };

  const reviewCount = graph.nodes.filter((n) => n.needsReview).length;

  // Available input nodes for force toggles
  const inputNodes = graph.nodes.filter(
    (n) => n.type === "DI" || n.type === "AI" || n.tag.endsWith(".SP"),
  );

  // Available signals for trend selector
  const availableSignals = useMemo(() => {
    const list: string[] = [];
    for (const node of graph.nodes) {
      for (const p of [...node.inputs, ...node.outputs]) {
        const name = `${node.tag}.${p.id.toUpperCase()}`;
        if (!list.includes(name)) list.push(name);
      }
    }
    return list;
  }, [graph]);

  return (
    <div className="flex h-full flex-col gap-6 p-6 overflow-y-auto">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Simulate</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Run imported control logic and observe signal behavior with active wire tracing and live trends.
        </p>
      </div>

      {/* Control Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={graphId} onValueChange={switchGraph}>
          <SelectTrigger className="h-8 w-56">
            <SelectValue placeholder="Select sample" />
          </SelectTrigger>
          <SelectContent>
            {graphs.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="h-6" />

        {isRunning ? (
          <Button size="sm" variant="secondary" onClick={handlePause}>
            <Pause className="mr-2 h-4 w-4" />
            Pause
          </Button>
        ) : (
          <Button size="sm" onClick={handleRun}>
            <Play className="mr-2 h-4 w-4" />
            Run
          </Button>
        )}

        <Button size="sm" variant="outline" onClick={handleStep} disabled={isRunning}>
          <StepForward className="mr-2 h-4 w-4" />
          Step
        </Button>

        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <div className="flex items-center gap-2">
          <Badge variant={isRunning ? "default" : "secondary"} className="text-xs">
            {isRunning ? "Running (100ms)" : cycle > 0 ? "Paused" : "Idle"}
          </Badge>
          <span className="text-xs text-muted-foreground">Cycle #{cycle}</span>
        </div>

        {warnings.length > 0 && (
          <Badge variant="destructive" className="text-xs">
            Feedback loop detected
          </Badge>
        )}

        <Badge variant="secondary" className="ml-auto text-xs">
          {graph.nodes.length} nodes · {reviewCount} need review
        </Badge>
      </div>

      {/* Interactive Input Force Panel */}
      {inputNodes.length > 0 && (
        <Card className="p-4 bg-card/60">
          <div className="flex items-center gap-2 mb-3">
            <Sliders className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
              Input Force & Overrides
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {inputNodes.map((n) => {
              if (n.type === "DI") {
                const key = makePortKey(n.id, "out");
                const currentVal = Boolean(forcedInputs[key] ?? signals[key] ?? false);
                return (
                  <div
                    key={n.id}
                    className="flex items-center justify-between rounded-md border p-2 bg-card"
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">{n.tag}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {String(n.params.description ?? n.params.address ?? "Digital Input")}
                      </span>
                    </div>
                    <Switch
                      checked={currentVal}
                      onCheckedChange={() => handleToggleInput(n.id, "out", currentVal)}
                    />
                  </div>
                );
              }

              if (n.type === "AI") {
                const port = n.outputs[0]?.id || "pv";
                const key = makePortKey(n.id, port);
                const currentVal = Number(forcedInputs[key] ?? signals[key] ?? n.params.value ?? 0);
                const isTankLevel = n.id === "lt";

                return (
                  <div
                    key={n.id}
                    className="flex flex-col gap-2 rounded-md border p-2 bg-card col-span-1 sm:col-span-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{n.tag}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {currentVal} {String(n.params.unit ?? "%")}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Slider
                        value={[currentVal]}
                        min={Number(n.params.rangeMin ?? 0)}
                        max={Number(n.params.rangeMax ?? 100)}
                        step={1}
                        disabled={isTankLevel && isRunning}
                        onValueChange={([val]) => handleSliderInput(n.id, port, val)}
                        className="flex-1"
                      />
                      {isTankLevel && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          (Tank Level)
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        </Card>
      )}

      {/* Main Graph Canvas and Params Inspector */}
      <div className="flex min-h-[420px] flex-1 gap-6">
        <div className="min-h-96 flex-1 overflow-hidden rounded-md border" style={flowTheme}>
          <ReactFlow
            key={graphId}
            nodes={flowNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            nodesConnectable={false}
            colorMode="dark"
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <NodeParamsPanel node={selectedNode} onParamChange={updateParam} />
      </div>

      {/* Live Trend Chart (Recharts) */}
      <Card className="rounded-md border bg-card">
        <CardHeader className="p-4 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Live Signal Monitor & Trends</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {availableSignals.slice(0, 6).map((sig) => {
                const isSelected = selectedChartSignals.includes(sig);
                return (
                  <Badge
                    key={sig}
                    variant={isSelected ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => {
                      setSelectedChartSignals((prev) =>
                        isSelected ? prev.filter((s) => s !== sig) : [...prev, sig],
                      );
                    }}
                  >
                    {isSelected && <Check className="mr-1 h-3 w-3" />}
                    {sig}
                  </Badge>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {trendHistory.length === 0 ? (
            <div className="flex h-44 items-center justify-center text-xs text-muted-foreground border border-dashed rounded-md">
              Start or step the simulation to observe live signals.
            </div>
          ) : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendHistory} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="time"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: "0.375rem",
                      fontSize: "12px",
                      color: "var(--foreground)",
                    }}
                  />
                  {selectedChartSignals.map((sig, idx) => {
                    const strokeColors = [
                      "var(--primary)",
                      "var(--muted-foreground)",
                      "var(--foreground)",
                      "oklch(0.7 0.12 258)",
                    ];
                    return (
                      <Line
                        key={sig}
                        type="monotone"
                        dataKey={sig}
                        stroke={strokeColors[idx % strokeColors.length]}
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Background,
  ReactFlow,
  applyNodeChanges,
  type Edge,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { RoutedEdge } from "@/components/logic-graph/routed-edge";
import { RouteManager } from "@/components/logic-graph/route-manager";
import { bundleNetRoutes, junctionPoints, type Pt } from "@/lib/logic-graph/route-edges";
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Check,
  Expand,
  Focus,
  Gauge,
  Maximize2,
  Minimize,
  Minimize2,
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
import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebar } from "@/components/ui/sidebar";
import { focusMode, useFocusMode } from "@/lib/focus-mode";

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
const edgeTypes = { routed: RoutedEdge };

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
  const isMobile = useIsMobile();
  // A graph loaded from graph JSON is offered first and selected by default.
  const imported = review.graph.id === "json-import" ? structuredClone(review.graph) : null;
  const [graphs, setGraphs] = useState<LogicGraph[]>(() => (imported ? [imported, ...sampleGraphs] : sampleGraphs));
  const [graphId, setGraphId] = useState(imported?.id ?? defaultGraph.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routes, setRoutes] = useState<Record<string, Pt[]>>({});
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
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const focus = useFocusMode();
  const { open: appSidebarOpen, setOpen: setAppSidebarOpen } = useSidebar();
  const prevSidebarOpen = useRef(appSidebarOpen);
  const setAppSidebarOpenRef = useRef(setAppSidebarOpen);
  setAppSidebarOpenRef.current = setAppSidebarOpen;
  const flowInstanceRef = useRef<ReactFlowInstance<LogicFlowNode, Edge> | null>(null);
  const leftOpenRef = useRef(false);
  const rightOpenRef = useRef(false);
  const isMobileRef = useRef(false);
  leftOpenRef.current = leftDrawerOpen;
  rightOpenRef.current = rightDrawerOpen;
  isMobileRef.current = isMobile;
  const fitAll = useCallback(
    (duration = 150) => {
      // Keep the whole logic inside the part of the canvas that no drawer covers.
      const left = leftOpenRef.current && !isMobileRef.current ? 304 : 16;
      const right = rightOpenRef.current && !isMobileRef.current ? 336 : 16;
      flowInstanceRef.current?.fitView({
        padding: { top: "16px", right: `${right}px`, bottom: "64px", left: `${left}px` },
        minZoom: 0.1,
        maxZoom: 1.25,
        duration,
      });
    },
    [],
  );

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

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    // Inputs and outputs are on the canvas now, so start with the whole logic in view.
    setLeftDrawerOpen(false);
    setRightDrawerOpen(false);
  }, [isMobile]);

  // Simulate is canvas-first: collapse the app sidebar while here and restore it on leave.
  useEffect(() => {
    setAppSidebarOpenRef.current(false);
    const restore = prevSidebarOpen.current;
    return () => {
      focusMode.set(false);
      setAppSidebarOpenRef.current(restore);
    };
  }, []);

  // Auto-fit whenever the canvas itself changes size (sidebar, header, window, fullscreen).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => fitAll(200), 250);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [fitAll]);

  // Esc leaves focus mode.
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") focusMode.set(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);

  const toggleFocus = () => {
    const next = !focus;
    focusMode.set(next);
    if (next) {
      setAppSidebarOpen(false);
      setLeftDrawerOpen(false);
      setRightDrawerOpen(false);
      setMonitorOpen(false);
    }
  };

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

  // Terminals show live state and (for inputs) a switch right on the canvas.
  const displayNodes = useMemo(
    () =>
      flowNodes.map((n) => {
        const t = n.data.node.type;
        if (t !== "DI" && t !== "DO") return n;
        const key = makePortKey(n.id, t === "DI" ? "out" : "in");
        const keyOut = makePortKey(n.id, "out");
        const value = t === "DI" ? Boolean(forcedInputs[key] ?? signals[key] ?? false) : Boolean(signals[keyOut] ?? signals[key] ?? false);
        return {
          ...n,
          data: { ...n.data, value, ...(t === "DI" ? { onToggle: () => handleToggleInput(n.id, "out", value) } : {}) },
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flowNodes, signals, forcedInputs],
  );

  // Physical DXF nets are rendered once. Multiple logical edges that share the same source
  // therefore appear as one trunk with branch/junction geometry instead of stacked lines.
  const netOf = useMemo(() => {
    const out: Record<string, string> = {};
    for (const e of graph.edges) out[e.id] = `${e.from.nodeId}:${e.from.portId}`;
    return out;
  }, [graph]);

  const junctions = useMemo(() => junctionPoints(routes, netOf), [routes, netOf]);
  const netBundles = useMemo(() => bundleNetRoutes(routes, netOf), [routes, netOf]);

  const edges: Edge[] = useMemo(() => {
    return graph.edges.map((e) => {
      const srcKey = makePortKey(e.from.nodeId, e.from.portId);
      const val = signals[srcKey];
      const live = typeof val === "boolean" ? val : typeof val === "number" && val > 0;
      const net = netOf[e.id];
      const bundle = netBundles[net];
      const bundleOwner = !!bundle && bundle.owner === e.id;
      return {
        id: e.id,
        source: e.from.nodeId,
        sourceHandle: e.from.portId,
        target: e.to.nodeId,
        targetHandle: e.to.portId,
        type: "routed",
        data: {
          points: routes[e.id],
          junctions: junctions[e.id],
          bundlePath: bundle?.path,
          bundleOwner: bundle ? bundleOwner : undefined,
        },
        animated: live,
        style: {
          stroke: live ? "#ef4444" : "var(--foreground)",
          strokeWidth: live ? 2.25 : 1.25,
          opacity: 1,
          transition: "stroke 150ms ease, stroke-width 150ms ease",
        },
      };
    });
  }, [graph, signals, routes, junctions, netOf, netBundles]);

  const switchGraph = (id: string) => {
    const next = graphs.find((g) => g.id === id);
    if (!next) return;
    setIsRunning(false);
    setGraphId(id);
    setRoutes({});
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

  const toggleFullscreen = async () => {
    if (!workspaceRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await workspaceRef.current.requestFullscreen();
  };

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
    <div ref={workspaceRef} className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b bg-card px-2 sm:flex">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            size="icon"
            variant={leftDrawerOpen ? "secondary" : "ghost"}
            className="h-8 w-8 shrink-0"
            onClick={() => {
              setLeftDrawerOpen((open) => !open);
              setTimeout(() => fitAll(200), 220);
              if (isMobile) setRightDrawerOpen(false);
            }}
            aria-label={leftDrawerOpen ? "Close inputs" : "Open inputs"}
            title={leftDrawerOpen ? "Close inputs" : "Open inputs"}
          >
            {leftDrawerOpen ? <ChevronLeft /> : <Sliders />}
          </Button>
        <Select value={graphId} onValueChange={switchGraph}>
          <SelectTrigger className="h-8 min-w-0 w-48 sm:w-56">
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

        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          {isRunning ? (
            <Button size="sm" variant="secondary" onClick={handlePause} aria-label="Pause simulation">
              <Pause /> <span className="hidden md:inline">Pause</span>
            </Button>
          ) : (
            <Button size="sm" onClick={handleRun} aria-label="Run simulation">
              <Play /> <span className="hidden md:inline">Run</span>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleStep} disabled={isRunning} aria-label="Step simulation">
            <StepForward /> <span className="hidden md:inline">Step</span>
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleReset} aria-label="Reset simulation" title="Reset">
            <RotateCcw />
          </Button>
          <Separator orientation="vertical" className="hidden h-6 lg:block" />
          <div className="hidden items-center gap-2 lg:flex">
          <Badge variant={isRunning ? "default" : "secondary"} className="text-xs">
            {isRunning ? "Running (100ms)" : cycle > 0 ? "Paused" : "Idle"}
          </Badge>
          <span className="text-xs text-muted-foreground">
              Cycle #{cycle}{reviewCount > 0 ? ` · ${reviewCount} to review` : ""}
            </span>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => fitAll()} aria-label="Fit view" title="Fit view">
            <Focus />
          </Button>
          <Button size="icon" variant={focus ? "secondary" : "ghost"} className="h-8 w-8" onClick={toggleFocus} aria-label={focus ? "Exit focus mode" : "Focus mode"} title={focus ? "Exit focus mode (Esc)" : "Focus mode: hide sidebar and header"}>
            {focus ? <Minimize2 /> : <Maximize2 />}
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize /> : <Expand />}
          </Button>
          <Button
            size="icon"
            variant={rightDrawerOpen ? "secondary" : "ghost"}
            className="h-8 w-8"
            onClick={() => {
              setRightDrawerOpen((open) => !open);
              setTimeout(() => fitAll(200), 220);
              if (isMobile) setLeftDrawerOpen(false);
            }}
            aria-label={rightDrawerOpen ? "Close outputs and parameters" : "Open outputs and parameters"}
            title={rightDrawerOpen ? "Close outputs and parameters" : "Open outputs and parameters"}
          >
            {rightDrawerOpen ? <ChevronRight /> : <Gauge />}
          </Button>
        </div>
      </div>

      <div ref={canvasRef} className="relative min-h-0 flex-1">
        <ReactFlow
          key={graphId}
          nodes={displayNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={(instance) => { flowInstanceRef.current = instance; }}
          onNodesChange={onNodesChange}
          onNodeClick={(_, n) => { setSelectedId(n.id); setRightDrawerOpen(true); if (isMobile) setLeftDrawerOpen(false); }}
          onPaneClick={() => setSelectedId(null)}
          nodesConnectable={false}
          colorMode="light"
          className="paper"
          style={flowTheme}
          fitView
          minZoom={0.1}
          maxZoom={1.5}
          fitViewOptions={{ padding: { top: "16px", right: rightDrawerOpen && !isMobile ? "336px" : "16px", bottom: "64px", left: leftDrawerOpen && !isMobile ? "304px" : "16px" }, minZoom: 0.1, maxZoom: 1.25 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} />
          <RouteManager edges={graph.edges} nativeRoutes={graph.geometry?.edgePaths} onRoutes={setRoutes} />
        </ReactFlow>

        <aside className={`absolute inset-y-0 left-0 z-10 flex w-72 max-w-[calc(100%-3rem)] flex-col border-r bg-card transition-transform duration-150 ${leftDrawerOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center border-b px-4">
            <div className="flex min-w-0 items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
              <span className="truncate text-xs font-semibold uppercase text-muted-foreground">Inputs & overrides</span>
            </div>
            <Badge variant="secondary" className="text-xs">{inputNodes.length}</Badge>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
            {inputNodes.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No forceable inputs.</p>}
            {inputNodes.map((n) => {
              if (n.type === "DI") {
                const key = makePortKey(n.id, "out");
                const currentVal = Boolean(forcedInputs[key] ?? signals[key] ?? false);
                return (
                  <div
                    key={n.id}
                    className="flex items-center justify-between rounded-md border bg-background p-2"
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
                    className="flex flex-col gap-2 rounded-md border bg-background p-2"
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
        </aside>

        <aside className={`absolute inset-y-0 right-0 z-10 flex w-80 max-w-[calc(100%-3rem)] flex-col border-l bg-card transition-transform duration-150 ${rightDrawerOpen ? "translate-x-0" : "translate-x-full"}`}>
          <div className="grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center border-b px-4">
            <div className="flex min-w-0 items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <span className="truncate text-xs font-semibold uppercase text-muted-foreground">Outputs & parameters</span>
            </div>
            <Badge variant="secondary" className="text-xs">{graph.nodes.length} nodes</Badge>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {warnings.length > 0 && <div className="border-b p-2"><Badge variant="destructive" className="text-xs">Feedback loop detected</Badge></div>}
            <section className="border-b p-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium">Outputs</span>
                <span className="text-xs text-muted-foreground">{outputLamps.length}</span>
              </div>
              {outputLamps.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No output lamps in this graph.</p>}
              <div className="flex flex-col gap-2">
            {outputLamps.map((n) => {
              const on = Boolean(signals[makePortKey(n.id, "out")]);
              return (
                <div key={n.id} data-testid={`lamp-${n.id}`} data-on={on} className="flex items-center justify-between gap-2 rounded-md border bg-background p-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">{n.tag}</span>
                    {n.params.description !== undefined && n.params.description !== n.tag && (
                      <span className="text-[10px] text-muted-foreground">{String(n.params.description)}</span>
                    )}
                  </div>
                  <span className={on ? "h-4 w-4 rounded-full bg-primary" : "h-4 w-4 rounded-full border bg-muted"} aria-label={on ? "On" : "Off"} />
                </div>
              );
            })}
              </div>
            </section>
            <NodeParamsPanel node={selectedNode} onParamChange={updateParam} />
          </div>
        </aside>

        <section className={`absolute inset-x-0 bottom-0 z-20 flex flex-col border-t bg-card transition-transform duration-150 ${monitorOpen ? "h-72 translate-y-0" : "h-72 translate-y-[calc(100%-3rem)]"}`}>
          <div className="grid h-12 shrink-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4" onClick={() => setMonitorOpen((open) => !open)}>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="truncate text-sm font-semibold">Live Signal Monitor</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">{selectedChartSignals.length} traces · {trendHistory.length} samples</span>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={monitorOpen ? "Close signal monitor" : "Open signal monitor"} title={monitorOpen ? "Close signal monitor" : "Open signal monitor"} onClick={(event) => { event.stopPropagation(); setMonitorOpen((open) => !open); }}>
              {monitorOpen ? <ChevronDown /> : <ChevronUp />}
            </Button>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 border-t lg:grid-cols-[18rem_minmax(0,1fr)]">
            <div className="flex content-start flex-wrap gap-2 overflow-y-auto border-b p-2 lg:border-b-0 lg:border-r">
              {availableSignals.slice(0, 6).map((sig) => {
                const isSelected = selectedChartSignals.includes(sig);
                return (
                  <Badge
                    key={sig}
                    variant={isSelected ? "default" : "outline"}
                    className="h-6 cursor-pointer text-xs"
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
            <div className="min-h-0 p-2">
          {trendHistory.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
              Start or step the simulation to observe live signals.
            </div>
          ) : (
                <div className="h-full w-full">
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
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}


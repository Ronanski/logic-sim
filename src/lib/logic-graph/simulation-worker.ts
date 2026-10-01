import { SimulationEngine, type FeedbackLoopWarning, type ScanCycleResult } from "./engine";
import type { LogicGraph, LogicParamValue } from "./types";

export type WorkerInMessage =
  | { type: "INIT"; graph: LogicGraph }
  | { type: "START"; intervalMs?: number }
  | { type: "STOP" }
  | { type: "STEP"; dtMs?: number }
  | { type: "RESET" }
  | { type: "SET_INPUT"; nodeId: string; portId: string; value: number | boolean }
  | { type: "UPDATE_PARAMS"; nodeId: string; params: Record<string, LogicParamValue> };

export type WorkerOutMessage =
  | { type: "INITIALIZED"; warnings: FeedbackLoopWarning[]; order: string[] }
  | { type: "CYCLE_TICK"; result: ScanCycleResult }
  | { type: "STATUS"; isRunning: boolean; cycle: number }
  | { type: "ERROR"; error: string };

let engine: SimulationEngine | null = null;
let timerId: ReturnType<typeof setInterval> | null = null;
let currentIntervalMs = 100;

function handleStep(dtMs = currentIntervalMs) {
  if (!engine) return;
  try {
    const result = engine.step(dtMs);
    self.postMessage({ type: "CYCLE_TICK", result } satisfies WorkerOutMessage);
  } catch (err: unknown) {
    self.postMessage({
      type: "ERROR",
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerOutMessage);
  }
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case "INIT": {
      try {
        engine = new SimulationEngine(msg.graph);
        const warnings = engine.getWarnings();
        const order = engine.getEvaluationOrder();
        self.postMessage({
          type: "INITIALIZED",
          warnings,
          order,
        } satisfies WorkerOutMessage);
      } catch (err: unknown) {
        self.postMessage({
          type: "ERROR",
          error: err instanceof Error ? err.message : String(err),
        } satisfies WorkerOutMessage);
      }
      break;
    }

    case "START": {
      if (!engine) return;
      if (timerId !== null) clearInterval(timerId);

      currentIntervalMs = msg.intervalMs ?? 100;
      timerId = setInterval(() => {
        handleStep(currentIntervalMs);
      }, currentIntervalMs);

      self.postMessage({
        type: "STATUS",
        isRunning: true,
        cycle: 0,
      } satisfies WorkerOutMessage);
      break;
    }

    case "STOP": {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
      self.postMessage({
        type: "STATUS",
        isRunning: false,
        cycle: 0,
      } satisfies WorkerOutMessage);
      break;
    }

    case "STEP": {
      handleStep(msg.dtMs ?? 100);
      break;
    }

    case "RESET": {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
      if (engine) {
        engine.reset();
        handleStep(0);
      }
      self.postMessage({
        type: "STATUS",
        isRunning: false,
        cycle: 0,
      } satisfies WorkerOutMessage);
      break;
    }

    case "SET_INPUT": {
      if (engine) {
        engine.setInput(msg.nodeId, msg.portId, msg.value);
      }
      break;
    }

    case "UPDATE_PARAMS": {
      if (engine) {
        engine.updateNodeParams(msg.nodeId, msg.params);
      }
      break;
    }
  }
};

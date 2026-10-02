import { useCallback, useEffect, useRef, useState } from 'react';
import { initialState, stepSim } from '@/lib/logic/engine';

const DT = 0.1;

export default function useSimulation(nodes, wires, active) {
  const [running, setRunning] = useState(true);
  const [values, setValues] = useState({});
  const manual = useRef({});
  const state = useRef(initialState());
  const latest = useRef({ nodes, wires });
  latest.current = { nodes, wires };

  const tick = useCallback(() => {
    const r = stepSim(latest.current.nodes, latest.current.wires, manual.current, state.current, DT);
    state.current = r.state;
    setValues(r.values);
  }, []);

  useEffect(() => {
    if (!active || !running) return undefined;
    tick();
    const id = setInterval(tick, DT * 1000);
    return () => clearInterval(id);
  }, [active, running, tick]);

  const setInput = useCallback((id, action) => {
    if (action === 'toggle') manual.current = { ...manual.current, [id]: !manual.current[id] };
    else manual.current = { ...manual.current, [id]: action === 'down' };
    if (!running) tick();
  }, [running, tick]);

  const reset = useCallback(() => {
    manual.current = {};
    state.current = initialState();
    setValues({});
    setRunning(true);
  }, []);

  return { values: active ? values : {}, running, setRunning, setInput, reset };
}
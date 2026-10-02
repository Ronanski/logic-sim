// Symbol library for DCS logic diagrams (also used to describe symbols for image recognition)
export const SYMBOLS = {
  input: { label: 'Signal Input', group: 'Inputs', inputs: 0, source: true, wide: true,
    desc: 'Signal entering the logic (IRP / ARP / hardwire / CRT). Click the switch to toggle during simulation.',
    truth: [] },
  pushbutton: { label: 'Push Button (CRT)', group: 'Inputs', inputs: 0, source: true, wide: true,
    desc: 'Momentary CRT push button. Hold the button during simulation to send the signal to this input.',
    truth: [] },
  limit_switch: { label: 'Limit Switch', group: 'Inputs', inputs: 0, source: true, wide: true,
    desc: 'Limit switch contact. Toggle during simulation.', truth: [] },
  hilo: { label: 'Hi / Lo Limit', group: 'Inputs', inputs: 0, source: true, wide: true,
    desc: 'High or low limit alarm contact. Toggle during simulation.', truth: [] },
  and: { label: 'AND', group: 'Logic', inputs: 2, min: 2, max: 8,
    desc: 'Output is 1 only when ALL inputs are 1.', truth: ['A B → C', '0 0 → 0', '1 0 → 0', '0 1 → 0', '1 1 → 1'] },
  or: { label: 'OR', group: 'Logic', inputs: 2, min: 2, max: 8,
    desc: 'Output is 1 when ANY input is 1.', truth: ['A B → C', '0 0 → 0', '1 0 → 1', '0 1 → 1', '1 1 → 1'] },
  not: { label: 'NOT', group: 'Logic', inputs: 1,
    desc: 'Inverts the input.', truth: ['A → B', '0 → 1', '1 → 0'] },
  ton: { label: 'ON Delay', group: 'Timers', inputs: 1, delay: true,
    desc: 'Output turns 1 after the input has been 1 for X seconds. Drops immediately with the input.', truth: [] },
  tof: { label: 'OFF Delay', group: 'Timers', inputs: 1, delay: true,
    desc: 'Output turns 1 immediately and stays 1 for X seconds after the input drops.', truth: [] },
  pulse: { label: 'Pulse Delay', group: 'Timers', inputs: 1, delay: true,
    desc: 'On a rising input edge the output pulses 1 for X seconds.', truth: [] },
  sr: { label: 'SR Flip-Flop', group: 'Logic', inputs: 2,
    desc: 'Port S sets Q to 1, port R resets Q to 0 (reset has priority). Q is remembered.', truth: ['S R → Q', '1 0 → 1', '0 1 → 0', '0 0 → hold', '1 1 → 0'] },
  output: { label: 'Command Output', group: 'Outputs', inputs: 1, out: false, wide: true,
    desc: 'Signal leaving the logic to the TO column, field device or another sheet.', truth: [] },
  lamp: { label: 'Indicating Lamp', group: 'Outputs', inputs: 1, out: false, wide: true,
    desc: 'Indicating display or lamp.', truth: [] },
  sv: { label: 'Solenoid (SV)', group: 'Outputs', inputs: 1, out: false, wide: true,
    desc: 'Solenoid valve output.', truth: [] },
  ann: { label: 'Announce / Alarm', group: 'Outputs', inputs: 1, out: false, wide: true,
    desc: 'Announce display or alarm window.', truth: [] },
};

SYMBOLS.text = { label: 'Text / Note', group: 'Annotation', inputs: 0, out: false,
  desc: 'Free text label for notes, headings and annotations.', truth: [] };

export const GROUPS = ['Inputs', 'Logic', 'Timers', 'Outputs', 'Annotation'];
export const ADDRESS_KINDS = ['', 'IRP', 'ARP', 'CRT', 'HW'];
export const KIND_LABEL = { '': 'None', IRP: 'IRP', ARP: 'ARP', CRT: 'CRT display', HW: 'Hardwire' };

export const portCount = (n) => n.inputs ?? SYMBOLS[n.type]?.inputs ?? 0;
export const hasOut = (n) => SYMBOLS[n.type]?.out !== false;

export function nodeSize(n) {
  const s = SYMBOLS[n.type];
  const c = portCount(n);
  if (n.type === 'text') {
    const fs = n.fontSize || 14;
    return { w: Math.max(40, Math.round((n.text || 'Text').length * fs * 0.62) + 16), h: fs + 16 };
  }
  if (s?.wide) return { w: 190, h: 54 };
  if (n.type === 'not') return { w: 70, h: 44 };
  if (n.type === 'sr') return { w: 84, h: 72 };
  if (s?.delay) return { w: 96, h: 62 };
  return { w: 84, h: Math.max(56, c * 22 + 18) };
}

export const inPort = (n, i) => {
  const { h } = nodeSize(n);
  return { x: n.x, y: n.y + (h * (i + 1)) / (portCount(n) + 1) };
};
export const outPort = (n) => {
  const { w, h } = nodeSize(n);
  return { x: n.x + w, y: n.y + h / 2 };
};

export function wirePath(a, b) {
  if (b.x >= a.x + 24) {
    const mx = a.x + (b.x - a.x) / 2;
    return `M${a.x},${a.y} H${mx} V${b.y} H${b.x}`;
  }
  const my = (a.y + b.y) / 2 + (b.y === a.y ? 40 : 0);
  return `M${a.x},${a.y} H${a.x + 14} V${my} H${b.x - 14} V${b.y} H${b.x}`;
}

export const isSource = (type) => !!SYMBOLS[type]?.source;
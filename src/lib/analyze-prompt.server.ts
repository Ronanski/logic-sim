export const TYPES = ['input','pushbutton','limit_switch','hilo','and','or','not','ton','tof','pulse','sr','output','lamp','sv','ann'];

export const PROMPT = `You are an expert in DCS / power-plant interlock logic drawings (Formosa Heavy Industries style "LOGIC (INTERLOCK)" sheets).
Read the attached drawing image and convert it into a machine-readable logic graph.

SYMBOL LIBRARY (use ONLY these types):
- input: a signal that enters the logic from the FROM column / a tag (field contact, IRP, ARP, hardwire, memory bit like M.011F/21F or L0012/332).
- pushbutton: a CRT/operator push button signal (look for words like PB, PUSH BUTTON, START/STOP command from CRT).
- limit_switch: limit switch symbol (a lever-contact symbol).
- hilo: low limit "/L/" or high limit "/H/" boxes.
- and: gate drawn as a vertical bar with an AND circle/label. Output goes right.
- or: gate drawn as a vertical bar with a circle labeled OR.
- not: a small box with an X inside and the label NOT, inverts one input.
- ton: ON DELAY timer (circle with "X SEC", label ON DELAY): output turns on X seconds after input becomes 1.
- tof: OFF DELAY timer (label OFF DELAY): output stays on X seconds after input drops.
- pulse: PULSE DELAY timer: output is a pulse of X seconds on the input rising edge.
- sr: flip-flop box with S and R inputs (port 0 = S set, port 1 = R reset) and Q output.
- output: a signal leaving the logic to the TO column / field / another sheet (e.g. "INSERT BURNER A COMMAND", "OPEN BURNER A OIL VALVE").
- lamp: indicating display or lamp (box with an X). sv: solenoid (circle SV). ann: announce display/alarm "( ANN )".

RULES:
- Each gate input is a numbered port starting at 0 from TOP to BOTTOM. "to_port" is the port index on the destination node.
- Create one wire for each line between a source node output and a destination node input. A line that splits to several destinations becomes several wires with the same "from".
- For inputs/outputs fill: tag (TAG NO.), service (the SERVICE description text), address (the address text such as M.011F/21F or 0087/407/727/1047), address_kind one of IRP, ARP, CRT, HW or "" if unknown (use ARP for output address groups like 0087/407/727/1047, IRP for M./L. memory/input addresses, HW if clearly a hardwire/station wiring, CRT for operator push buttons/displays).
- For timers set "delay" in seconds when readable (else 3) and mention the timer id (e.g. TR23) in "label".
- nx and ny are the approximate CENTER position of the symbol in the drawing, normalized 0..1 (0,0 is top-left of the logic area). Preserve the left-to-right flow.
- confidence is 0..1; give < 0.7 if you are unsure about the symbol type, a wire, or the text, and explain in "note".
- Add short strings to "warnings" for anything you could not read or interpret.
- Node ids must be unique short strings like n1, n2...
Return ONLY JSON matching the schema.`;

export const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: TYPES },
          label: { type: 'string' },
          tag: { type: 'string' },
          service: { type: 'string' },
          address: { type: 'string' },
          address_kind: { type: 'string', enum: ['IRP', 'ARP', 'CRT', 'HW', ''] },
          delay: { type: 'number' },
          inputs: { type: 'integer' },
          nx: { type: 'number' },
          ny: { type: 'number' },
          confidence: { type: 'number' },
          note: { type: 'string' },
        },
        required: ['id', 'type', 'nx', 'ny'],
      },
    },
    wires: {
      type: 'array',
      items: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' }, to_port: { type: 'integer' } },
        required: ['from', 'to'],
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['nodes', 'wires'],
};

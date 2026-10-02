const n = (id, type, x, y, extra = {}) => ({ id, type, x, y, ...extra });

export const SAMPLE = {
  name: 'Burner A Light-Off Sequence (sample)',
  description: 'Simplified burner A insert interlock based on the DITL light-off sheet.',
  nodes: [
    n('i1', 'pushbutton', 20, 20, { tag: 'PB-A1', service: 'BURNER A LIGHTING CYCLE', address: 'M.0134/234/1634/1734', addrKind: 'CRT' }),
    n('i2', 'input', 20, 110, { tag: 'L0012', service: 'IGNITER A IN INSERT POSITION', address: 'L0012/332/0652/972', addrKind: 'HW' }),
    n('i3', 'input', 20, 210, { tag: 'L0010', service: 'BURNER A IN INSERT POSITION', address: 'L0010/330/0650/970', addrKind: 'HW' }),
    n('i4', 'input', 20, 310, { tag: 'M.011F', service: 'BURNER A CLEANING ON', address: 'M.011F/21F/161F/171F', addrKind: 'IRP' }),
    n('i5', 'limit_switch', 20, 410, { tag: 'M.012A', service: 'BURNER A PURGE VALVE CLOSED', address: 'M.012A/22A/162A/172A', addrKind: 'IRP' }),
    n('and1', 'and', 300, 50, { label: 'AND' }),
    n('not1', 'not', 300, 215, { label: 'NOT' }),
    n('p1', 'pulse', 295, 305, { label: 'TR23', delay: 1 }),
    n('and2', 'and', 480, 110, { label: 'AND' }),
    n('or1', 'or', 680, 190, { label: 'OR' }),
    n('out1', 'output', 860, 196, { tag: 'INSERT-A', service: 'INSERT BURNER A COMMAND', address: '0087/407/727/1047', addrKind: 'ARP' }),
    n('and3', 'and', 480, 390, { label: 'AND' }),
    n('t1', 'ton', 640, 392, { label: 'TON', delay: 3 }),
    n('l1', 'lamp', 800, 396, { tag: 'RDY-A', service: 'BURNER A READY', address: 'CRT PAGE 1', addrKind: 'CRT' }),
  ],
  wires: [
    ['i1', 'and1', 0], ['i2', 'and1', 1], ['i3', 'not1', 0], ['and1', 'and2', 0], ['not1', 'and2', 1],
    ['i4', 'p1', 0], ['and2', 'or1', 0], ['p1', 'or1', 1], ['or1', 'out1', 0], ['and2', 'and3', 0],
    ['i5', 'and3', 1], ['and3', 't1', 0], ['t1', 'l1', 0],
  ].map(([from, to, toPort], i) => ({ id: `w${i + 1}`, from, to, toPort })),
};
import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Copy, ClipboardPaste, Group, Ungroup, Trash2,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from 'lucide-react';

const Sep = () => <div className="mx-1 h-5 w-px bg-border" />;

export default function SelectionBar({ count, canPaste, canUngroup, onCopy, onPaste, onGroup, onUngroup, onArrange, onDelete }) {
  const B = ({ icon: Icon, title, onClick, disabled }) => (
    <Button size="icon" variant="ghost" className="h-8 w-8" title={title} disabled={disabled} onClick={onClick}><Icon className="h-4 w-4" /></Button>
  );
  return (
    <div className="absolute left-1/2 top-3 z-10 flex max-w-[94%] -translate-x-1/2 flex-wrap items-center justify-center rounded-lg border bg-card/95 p-1 shadow-md backdrop-blur">
      <span className="px-2 text-xs text-muted-foreground">{count} selected</span>
      <Sep />
      <B icon={Copy} title="Copy (Ctrl+C)" disabled={!count} onClick={onCopy} />
      <B icon={ClipboardPaste} title="Paste (Ctrl+V)" disabled={!canPaste} onClick={onPaste} />
      <Sep />
      <B icon={Group} title="Group (Ctrl+G)" disabled={count < 2} onClick={onGroup} />
      <B icon={Ungroup} title="Ungroup (Ctrl+Shift+G)" disabled={!canUngroup} onClick={onUngroup} />
      <Sep />
      <B icon={AlignStartVertical} title="Align left" disabled={count < 2} onClick={() => onArrange('left')} />
      <B icon={AlignCenterVertical} title="Align center" disabled={count < 2} onClick={() => onArrange('center')} />
      <B icon={AlignEndVertical} title="Align right" disabled={count < 2} onClick={() => onArrange('right')} />
      <B icon={AlignStartHorizontal} title="Align top" disabled={count < 2} onClick={() => onArrange('top')} />
      <B icon={AlignCenterHorizontal} title="Align middle" disabled={count < 2} onClick={() => onArrange('middle')} />
      <B icon={AlignEndHorizontal} title="Align bottom" disabled={count < 2} onClick={() => onArrange('bottom')} />
      <B icon={AlignHorizontalDistributeCenter} title="Distribute horizontally (3+)" disabled={count < 3} onClick={() => onArrange('distH')} />
      <B icon={AlignVerticalDistributeCenter} title="Distribute vertically (3+)" disabled={count < 3} onClick={() => onArrange('distV')} />
      <Sep />
      <B icon={Trash2} title="Delete (Del)" disabled={!count} onClick={onDelete} />
    </div>
  );
}
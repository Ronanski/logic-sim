import React from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Play, Pause, RotateCcw, ZoomIn, ZoomOut, Maximize, Upload, Hammer, Activity, PanelRight, Shapes, Check, Loader2 } from 'lucide-react';
import ThemeSwitcher from '@/components/logic/ThemeSwitcher';
import NativeSelect from '@/components/logic/NativeSelect';

export default function EditorToolbar({ name, onName, saving, mode, onMode, running, onRun, onReset, canvas, onImport, showInfo, onInfo, showPalette, onPalette, symStyle, onSymStyle }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3">
      <Button asChild variant="ghost" size="icon"><Link to="/"><ArrowLeft className="h-4 w-4" /></Link></Button>
      <Input value={name} onChange={(e) => onName(e.target.value)} className="h-8 w-40 border-transparent bg-transparent px-1 font-semibold hover:border-input sm:w-64" />
      <span className="hidden items-center gap-1 text-xs text-muted-foreground md:flex">
        {saving ? <><Loader2 className="h-3 w-3 animate-spin" />Saving</> : <><Check className="h-3 w-3" />Saved</>}
      </span>
      <div className="mx-auto flex items-center gap-1 rounded-lg border bg-muted/50 p-0.5">
        <Button size="sm" variant={mode === 'edit' ? 'default' : 'ghost'} className="h-7" onClick={() => onMode('edit')}><Hammer className="mr-1 h-3.5 w-3.5" />Build</Button>
        <Button size="sm" variant={mode === 'sim' ? 'default' : 'ghost'} className="h-7" onClick={() => onMode('sim')}><Activity className="mr-1 h-3.5 w-3.5" />Simulate</Button>
      </div>
      {mode === 'sim' && (
        <>
          <Button size="sm" variant="outline" onClick={onRun}>{running ? <><Pause className="mr-1 h-4 w-4" />Pause</> : <><Play className="mr-1 h-4 w-4" />Run</>}</Button>
          <Button size="sm" variant="outline" onClick={onReset}><RotateCcw className="mr-1 h-4 w-4" />Reset</Button>
        </>
      )}
      <div className="flex items-center">
        <Button size="icon" variant="ghost" title="Zoom out" onClick={() => canvas.current?.zoomOut()}><ZoomOut className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" title="Fit to screen" onClick={() => canvas.current?.fit()}><Maximize className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" title="Zoom in" onClick={() => canvas.current?.zoomIn()}><ZoomIn className="h-4 w-4" /></Button>
      </div>
      <Button size="sm" variant="outline" onClick={onImport}><Upload className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Import</span></Button>
      <div className="hidden w-40 lg:block" title="Logic symbol style">
        <NativeSelect value={symStyle} onChange={onSymStyle} className="h-8"
          options={[{ value: 'dcs', label: 'DCS (square / circle)' }, { value: 'traditional', label: 'Traditional' }, { value: 'block', label: 'Block (names)' }]} />
      </div>
      <div className="hidden sm:block"><ThemeSwitcher /></div>
      {mode === 'edit' && <Button size="icon" variant={showPalette ? 'secondary' : 'ghost'} title="Symbol library" onClick={onPalette}><Shapes className="h-4 w-4" /></Button>}
      <Button size="icon" variant={showInfo ? 'secondary' : 'ghost'} title="Information panel" onClick={onInfo}><PanelRight className="h-4 w-4" /></Button>
    </header>
  );
}
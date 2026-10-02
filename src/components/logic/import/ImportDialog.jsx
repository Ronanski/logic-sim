
import React, { useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { analyzeDiagram } from '@/lib/analyze.functions';

const toDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error('Could not read the file.'));
  r.readAsDataURL(file);
});

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, FileImage, Upload } from 'lucide-react';
import ReviewStep from '@/components/logic/import/ReviewStep';
import { buildFromAnalysis } from '@/lib/logic/importMap';

export default function ImportDialog({ open, onOpenChange, hasExisting, onConfirm }) {
  const [step, setStep] = useState('upload');
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const input = useRef(null);
  const analyze = useServerFn(analyzeDiagram);

  const close = (v) => {
    if (!v) { setStep('upload'); setError(''); setData(null); }
    onOpenChange(v);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    setImageUrl(URL.createObjectURL(file));
    setStep('analyzing');
    try {
      const image = await toDataUrl(file);
      const result = await analyze({ data: { image } });
      setData(buildFromAnalysis(result));
      setStep('review');
    } catch (e) {
      setError(e.message || 'Could not read the drawing.');
      setStep('upload');
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[92vh] max-w-6xl flex-col">
        <DialogHeader>
          <DialogTitle>Import logic drawing</DialogTitle>
          <DialogDescription>Upload a screenshot or photo of a logic sheet. Symbols are recognised against the built-in library, then you review before anything is imported.</DialogDescription>
        </DialogHeader>
        {step === 'upload' && (
          <div className="space-y-3">
            <button onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-muted-foreground transition hover:border-primary hover:text-foreground">
              <Upload className="h-8 w-8" /><span className="font-medium">Choose a screenshot (PNG / JPG)</span>
              <span className="text-xs">Files are stored privately — no public link.</span>
            </button>
            <input ref={input} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
            {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          </div>
        )}
        {step === 'analyzing' && (
          <div className="flex flex-col items-center gap-3 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" /><FileImage className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm">Reading symbols and wires… this can take up to a minute.</p>
          </div>
        )}
        {step === 'review' && data && (
          <ReviewStep data={data} setData={setData} imageUrl={imageUrl} hasExisting={hasExisting}
            onConfirm={(d) => { onConfirm(d); close(false); }} onCancel={() => close(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
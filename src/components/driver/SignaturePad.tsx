'use client';

import { useRef, useState } from 'react';

/**
 * Pad de signature dessiné à la main (pointer events — unifie souris et
 * tactile) et converti en PNG au moment de valider. Remplace l'ancien champ
 * texte libre qui prétendait recueillir une "signature" sans jamais rien
 * capturer réellement.
 */
export function SignaturePad({ onChange }: { onChange: (blob: Blob | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);

  function getContext() {
    return canvasRef.current?.getContext('2d') ?? null;
  }

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getContext();
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = getContext();
    if (!ctx) return;
    const { x, y } = pointFromEvent(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0b0b0b';
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasStroke) setHasStroke(true);
  }

  function handlePointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    emitBlob();
  }

  function emitBlob() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => onChange(blob), 'image/png');
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    onChange(null);
  }

  return (
    <div className="space-y-1.5">
      <canvas
        ref={canvasRef}
        width={280}
        height={140}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="w-full touch-none rounded-md border border-hairline bg-white"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-muted">Faites signer le client dans le cadre ci-dessus.</p>
        {hasStroke && (
          <button type="button" onClick={clear} className="text-xs font-medium text-brand-600 hover:underline">
            Effacer
          </button>
        )}
      </div>
    </div>
  );
}

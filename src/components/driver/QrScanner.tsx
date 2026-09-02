'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/**
 * Scan QR réel via la caméra — capture des frames vidéo dans un canvas
 * caché à chaque `requestAnimationFrame`, décodées par jsQR (pur JS, pas de
 * service externe). Remplace un simple bouton "Colis récupéré" par une
 * vérification physique : le livreur doit avoir le bon colis en main pour
 * scanner le QR imprimé sur son bordereau (voir DeliveryLabel.tsx, même
 * code `LOGIFLOW:<numéro>`).
 */
export function QrScanner({ onScan, onCancel }: { onScan: (value: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch {
        // Caméra refusée/indisponible — repli explicite sur la saisie
        // manuelle plutôt que de bloquer le livreur sans issue.
        setError("Caméra indisponible. Saisissez le code affiché sous le QR du bordereau.");
        setShowManual(true);
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        onScan(code.data);
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface p-3">
      <div className="text-sm font-medium text-ink-primary">Scanner le QR du bordereau</div>

      {!showManual && (
        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/70" />
        </div>
      )}

      {error && <p className="text-xs text-status-critical">{error}</p>}

      {showManual ? (
        <div className="space-y-2">
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Code sous le QR (ex: LOGIFLOW:ORD-2026-000001)"
            className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="flex-1 rounded-md border border-hairline py-2 text-sm font-medium text-ink-primary">
              Annuler
            </button>
            <button
              type="button"
              onClick={() => manualCode.trim() && onScan(manualCode.trim())}
              className="flex-1 rounded-md bg-brand-600 py-2 text-sm font-semibold text-white"
            >
              Valider
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-md border border-hairline py-2 text-sm font-medium text-ink-primary">
            Annuler
          </button>
          <button type="button" onClick={() => setShowManual(true)} className="flex-1 text-xs text-brand-600 hover:underline">
            Saisir le code à la main
          </button>
        </div>
      )}
    </div>
  );
}

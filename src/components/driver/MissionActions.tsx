'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';
import { SignaturePad } from '@/components/driver/SignaturePad';
import { QrScanner } from '@/components/driver/QrScanner';

type TransitStatus = 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY';
type FailureResult = 'CUSTOMER_ABSENT' | 'WRONG_ADDRESS' | 'CUSTOMER_REFUSED' | 'OTHER_FAILURE';
type ProofType = 'OTP' | 'SIGNATURE' | 'PHOTO' | 'GPS';

const PROOF_TYPES: { value: ProofType; label: string }[] = [
  { value: 'OTP', label: 'Code OTP' },
  { value: 'SIGNATURE', label: 'Signature' },
  { value: 'PHOTO', label: 'Photo' },
  { value: 'GPS', label: 'GPS uniquement' },
];

/** Best-effort : ne bloque jamais une action si la géoloc est refusée/absente. */
function getGeo(): Promise<{ latitude?: number; longitude?: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve({}),
      { timeout: 3000 }
    );
  });
}

function appendGeo(formData: FormData, geo: { latitude?: number; longitude?: number }) {
  if (geo.latitude !== undefined) formData.append('latitude', String(geo.latitude));
  if (geo.longitude !== undefined) formData.append('longitude', String(geo.longitude));
}

export function MissionActions({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showPodForm, setShowPodForm] = useState(false);
  const [proofType, setProofType] = useState<ProofType>('PHOTO');
  const [otpValue, setOtpValue] = useState('');
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  function selectProofType(next: ProofType) {
    setProofType(next);
    setError(null);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function advance(toStatus: TransitStatus) {
    setLoading(toStatus);
    setError(null);
    try {
      const geo = await getGeo();
      await apiFetch(`/api/v1/deliveries/orders/${orderId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: toStatus, ...geo }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setLoading(null);
    }
  }

  async function confirmPickup(pickupCode: string) {
    setShowScanner(false);
    setLoading('PICKED_UP');
    setError(null);
    try {
      const geo = await getGeo();
      await apiFetch(`/api/v1/deliveries/orders/${orderId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'PICKED_UP', pickupCode, ...geo }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Confirmation impossible.');
    } finally {
      setLoading(null);
    }
  }

  async function recordFailure(result: FailureResult) {
    setLoading(result);
    setError(null);
    try {
      const geo = await getGeo();
      const formData = new FormData();
      formData.append('result', result);
      if (notes) formData.append('notes', notes);
      appendGeo(formData, geo);

      await apiFetch(`/api/v1/deliveries/orders/${orderId}/attempts`, { method: 'POST', body: formData });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setLoading(null);
    }
  }

  async function confirmDelivered() {
    if (proofType === 'OTP' && !otpValue.trim()) {
      setError('Saisissez le code reçu par le client.');
      return;
    }
    if (proofType === 'SIGNATURE' && !signatureBlob) {
      setError('Faites signer le client avant de confirmer.');
      return;
    }
    if (proofType === 'PHOTO' && !photoFile) {
      setError('Prenez une photo avant de confirmer.');
      return;
    }

    setLoading('SUCCESS');
    setError(null);
    try {
      const geo = await getGeo();
      const formData = new FormData();
      formData.append('result', 'SUCCESS');
      formData.append('proofType', proofType);
      appendGeo(formData, geo);

      if (proofType === 'OTP') {
        formData.append('proofValue', otpValue.trim());
      } else if (proofType === 'SIGNATURE' && signatureBlob) {
        formData.append('file', signatureBlob, 'signature.png');
      } else if (proofType === 'PHOTO' && photoFile) {
        formData.append('file', photoFile, photoFile.name);
      }

      await apiFetch(`/api/v1/deliveries/orders/${orderId}/attempts`, { method: 'POST', body: formData });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Confirmation impossible.');
    } finally {
      setLoading(null);
    }
  }

  async function retryDelivery() {
    await advance('OUT_FOR_DELIVERY');
  }

  async function resolveAs(toStatus: 'RESCHEDULED' | 'RETURNED') {
    setLoading(toStatus);
    setError(null);
    try {
      await apiFetch(`/api/v1/deliveries/orders/${orderId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ status: toStatus }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
          {error}
        </p>
      )}

      {status === 'ASSIGNED' && !showScanner && (
        <Button className="w-full py-3 text-base" loading={loading === 'PICKED_UP'} onClick={() => setShowScanner(true)}>
          📷 Scanner le colis
        </Button>
      )}

      {status === 'ASSIGNED' && showScanner && (
        <QrScanner onScan={confirmPickup} onCancel={() => setShowScanner(false)} />
      )}

      {status === 'PICKED_UP' && (
        <Button className="w-full py-3 text-base" loading={loading === 'IN_TRANSIT'} onClick={() => advance('IN_TRANSIT')}>
          Démarrer le trajet
        </Button>
      )}

      {status === 'IN_TRANSIT' && (
        <Button
          className="w-full py-3 text-base"
          loading={loading === 'OUT_FOR_DELIVERY'}
          onClick={() => advance('OUT_FOR_DELIVERY')}
        >
          Arrivé — en livraison
        </Button>
      )}

      {status === 'OUT_FOR_DELIVERY' && !showPodForm && (
        <div className="space-y-2">
          <Button className="w-full py-3 text-base" onClick={() => setShowPodForm(true)}>
            ✓ Livraison réussie
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              loading={loading === 'CUSTOMER_ABSENT'}
              onClick={() => recordFailure('CUSTOMER_ABSENT')}
            >
              Client absent
            </Button>
            <Button
              variant="secondary"
              loading={loading === 'WRONG_ADDRESS'}
              onClick={() => recordFailure('WRONG_ADDRESS')}
            >
              Adresse erronée
            </Button>
            <Button
              variant="secondary"
              loading={loading === 'CUSTOMER_REFUSED'}
              onClick={() => recordFailure('CUSTOMER_REFUSED')}
            >
              Refusé
            </Button>
            <Button
              variant="secondary"
              loading={loading === 'OTHER_FAILURE'}
              onClick={() => recordFailure('OTHER_FAILURE')}
            >
              Autre problème
            </Button>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Note (optionnel, jointe à l'issue choisie)"
            className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
            rows={2}
          />
        </div>
      )}

      {status === 'OUT_FOR_DELIVERY' && showPodForm && (
        <div className="space-y-3 rounded-lg border border-hairline bg-surface p-3">
          <div className="text-sm font-medium text-ink-primary">Preuve de livraison</div>
          <div className="flex gap-2">
            {PROOF_TYPES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => selectProofType(p.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  proofType === p.value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-secondary'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {proofType === 'OTP' && (
            <input
              value={otpValue}
              onChange={(e) => setOtpValue(e.target.value)}
              placeholder="Code reçu par le client"
              className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
            />
          )}

          {proofType === 'SIGNATURE' && <SignaturePad onChange={setSignatureBlob} />}

          {proofType === 'PHOTO' && (
            <div className="space-y-2">
              {photoPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreviewUrl} alt="Photo de livraison" className="h-40 w-full rounded-md border border-hairline object-cover" />
              ) : (
                <p className="text-xs text-ink-muted">Prenez une photo du colis livré (ou de l&apos;emplacement de dépôt).</p>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                className="w-full text-sm"
              />
            </div>
          )}

          {proofType === 'GPS' && (
            <p className="text-xs text-ink-muted">Votre position actuelle sera jointe comme preuve de passage.</p>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowPodForm(false)}>
              Annuler
            </Button>
            <Button className="flex-1" loading={loading === 'SUCCESS'} onClick={confirmDelivered}>
              Confirmer la livraison
            </Button>
          </div>
        </div>
      )}

      {['CUSTOMER_ABSENT', 'WRONG_ADDRESS', 'CUSTOMER_REFUSED'].includes(status) && (
        <div className="rounded-lg border border-status-warning/40 bg-status-warning/10 p-3">
          <p className="text-sm text-ink-secondary">Tentative échouée — en attente de décision.</p>
          <div className="mt-2 flex gap-2">
            <Button loading={loading === 'RESCHEDULED'} onClick={() => resolveAs('RESCHEDULED')}>
              Reprogrammer
            </Button>
            <Button variant="danger" loading={loading === 'RETURNED'} onClick={() => resolveAs('RETURNED')}>
              Retourner
            </Button>
          </div>
        </div>
      )}

      {status === 'RESCHEDULED' && (
        <Button className="w-full py-3 text-base" loading={loading === 'OUT_FOR_DELIVERY'} onClick={retryDelivery}>
          Reprendre la livraison
        </Button>
      )}
    </div>
  );
}

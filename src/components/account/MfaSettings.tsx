'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';

interface SetupData {
  qrCodeDataUrl: string;
  secret: string;
}

/**
 * Activation/désactivation de la double authentification (TOTP). Le flux
 * d'activation en deux temps (setup → confirm) est délibéré : on ne bascule
 * mfaEnabled qu'après preuve que l'utilisateur a bien enregistré le secret
 * dans son application d'authentification, sinon un compte pourrait se
 * retrouver verrouillé derrière un secret qu'il n'a jamais eu la chance de lire.
 */
export function MfaSettings({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSetup() {
    setError(null);
    setBusy(true);
    try {
      const data = await apiFetch<SetupData>('/api/v1/auth/mfa/setup', { method: 'POST' });
      setSetupData(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de démarrer l'activation.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/auth/mfa/confirm', {
        method: 'POST',
        body: JSON.stringify({ code: confirmCode }),
      });
      setEnabled(true);
      setSetupData(null);
      setConfirmCode('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Code invalide.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/api/v1/auth/mfa/disable', {
        method: 'POST',
        body: JSON.stringify({ password: disablePassword }),
      });
      setEnabled(false);
      setDisabling(false);
      setDisablePassword('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de désactiver.');
    } finally {
      setBusy(false);
    }
  }

  if (enabled) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-status-good">✓ La double authentification est activée sur ce compte.</p>
        {!disabling ? (
          <button
            type="button"
            onClick={() => setDisabling(true)}
            className="rounded-md border border-status-critical px-4 py-2 text-sm font-medium text-status-critical"
          >
            Désactiver
          </button>
        ) : (
          <form onSubmit={handleDisable} className="space-y-2 rounded-lg border border-hairline p-3">
            <label className="block text-sm font-medium text-ink-primary">
              Confirmez votre mot de passe pour désactiver
            </label>
            <input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              required
              className="w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {error && <p className="text-sm text-status-critical">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-status-critical px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Désactivation…' : 'Confirmer la désactivation'}
              </button>
              <button
                type="button"
                onClick={() => { setDisabling(false); setError(null); }}
                className="rounded-md border border-hairline px-4 py-2 text-sm font-medium text-ink-primary"
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  if (setupData) {
    return (
      <form onSubmit={confirmSetup} className="space-y-3">
        <p className="text-sm text-ink-secondary">
          Scannez ce code avec Google Authenticator, Authy ou une application équivalente, puis saisissez le
          code à 6 chiffres affiché pour confirmer l&apos;activation.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setupData.qrCodeDataUrl} alt="QR code MFA" className="h-44 w-44 rounded-md border border-hairline" />
        <p className="text-xs text-ink-muted">
          Impossible de scanner ? Saisissez ce code manuellement : <code className="font-mono">{setupData.secret}</code>
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-primary">Code de vérification</label>
          <input
            value={confirmCode}
            onChange={(e) => setConfirmCode(e.target.value)}
            required
            maxLength={6}
            inputMode="numeric"
            placeholder="123456"
            className="w-40 rounded-md border border-hairline px-3 py-2 text-sm tracking-widest focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        {error && <p className="text-sm text-status-critical">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Vérification…' : 'Confirmer l\'activation'}
          </button>
          <button
            type="button"
            onClick={() => { setSetupData(null); setError(null); }}
            className="rounded-md border border-hairline px-4 py-2 text-sm font-medium text-ink-primary"
          >
            Annuler
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-secondary">
        La double authentification ajoute un code à usage unique (généré par une application) en plus de
        votre mot de passe à chaque connexion.
      </p>
      {error && <p className="text-sm text-status-critical">{error}</p>}
      <button
        type="button"
        onClick={startSetup}
        disabled={busy}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Préparation…' : 'Activer la double authentification'}
      </button>
    </div>
  );
}

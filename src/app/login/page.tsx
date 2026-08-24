'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const [justRegistered, setJustRegistered] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Lu côté client (pas useSearchParams) pour éviter d'imposer une frontière
  // Suspense à toute la page juste pour cette bannière secondaire.
  useEffect(() => {
    setJustRegistered(new URLSearchParams(window.location.search).get('registered') === '1');
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password, mfaCode: mfaRequired ? mfaCode : undefined }),
      });
      router.push('/');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Échec de connexion.';
      // Le serveur répond ce message précis quand le mot de passe est correct
      // mais qu'un compte MFA attend encore son code — on révèle alors le
      // champ dédié au lieu d'afficher une simple erreur de connexion.
      if (message === 'Code MFA requis.') {
        setMfaRequired(true);
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-brand-700">LogiFlow</h1>
          <p className="mt-1 text-sm text-ink-secondary">Connectez-vous à votre espace</p>
        </div>

        {justRegistered && (
          <p className="mb-4 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700">
            Compte créé — connectez-vous pour suivre l&apos;état de votre demande.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-hairline bg-surface p-6">
          <div>
            <label htmlFor="identifier" className="block text-sm font-medium text-ink-primary">
              Téléphone ou email
            </label>
            <input
              id="identifier"
              type="text"
              required
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="admin@logiflow.ma"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink-primary">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="••••••••"
            />
          </div>

          {mfaRequired && (
            <div>
              <label htmlFor="mfaCode" className="block text-sm font-medium text-ink-primary">
                Code de double authentification
              </label>
              <input
                id="mfaCode"
                type="text"
                required
                autoFocus
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm tracking-widest focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="123456"
              />
              <p className="mt-1 text-xs text-ink-muted">Saisissez le code généré par votre application d&apos;authentification.</p>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
              {error}
            </p>
          )}

          <Button type="submit" loading={loading} className="w-full">
            {mfaRequired ? 'Valider le code' : 'Se connecter'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          Pas encore de compte ?{' '}
          <Link href="/register" className="text-brand-600 hover:underline">
            S&apos;inscrire
          </Link>
        </p>
      </div>
    </main>
  );
}

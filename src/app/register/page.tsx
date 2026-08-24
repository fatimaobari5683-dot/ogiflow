import Link from 'next/link';

export default function RegisterChoicePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-brand-700">LogiFlow</h1>
          <p className="mt-1 text-sm text-ink-secondary">Rejoindre la plateforme</p>
        </div>

        <div className="space-y-3">
          <Link
            href="/register/supplier"
            className="block rounded-lg border border-hairline bg-surface p-4 hover:border-brand-500 hover:bg-brand-50"
          >
            <div className="font-medium text-ink-primary">Je suis fournisseur</div>
            <div className="mt-1 text-sm text-ink-secondary">Créez des commandes et confiez-en la livraison à notre réseau.</div>
          </Link>

          <Link
            href="/register/driver"
            className="block rounded-lg border border-hairline bg-surface p-4 hover:border-brand-500 hover:bg-brand-50"
          >
            <div className="font-medium text-ink-primary">Je suis livreur</div>
            <div className="mt-1 text-sm text-ink-secondary">Recevez des missions de livraison avec votre propre véhicule.</div>
          </Link>
        </div>

        <p className="mt-6 text-center text-sm text-ink-muted">
          Déjà inscrit ?{' '}
          <Link href="/login" className="text-brand-600 hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </main>
  );
}

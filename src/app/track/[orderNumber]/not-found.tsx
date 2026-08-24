import Link from 'next/link';

export default function TrackingNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-brand-700">LogiFlow</h1>
        <p className="mt-6 text-sm text-ink-secondary">
          Aucune commande ne correspond à ce numéro. Vérifiez qu'il est correctement saisi.
        </p>
        <Link
          href="/track"
          className="mt-6 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Réessayer
        </Link>
      </div>
    </main>
  );
}

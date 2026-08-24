import Link from 'next/link';
import { RegisterForm } from '@/components/auth/RegisterForm';

export default function RegisterSupplierPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-brand-700">LogiFlow</h1>
          <p className="mt-1 text-sm text-ink-secondary">Créer un compte fournisseur</p>
        </div>

        <RegisterForm role="SUPPLIER" />

        <p className="mt-6 text-center text-sm text-ink-muted">
          <Link href="/register" className="text-brand-600 hover:underline">
            ← Retour
          </Link>
        </p>
      </div>
    </main>
  );
}

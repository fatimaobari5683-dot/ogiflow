import { redirect } from 'next/navigation';
import { requirePageUser } from '@/shared/http/page-auth';
import { SupplierNav } from '@/components/SupplierNav';
import { LogoutButton } from '@/components/LogoutButton';
import { prisma } from '@/infrastructure/database/client';

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser(['SUPPLIER']);
  const supplier = await prisma.supplier.findUnique({ where: { userId: user.id }, select: { companyName: true, status: true } });

  // Un compte inscrit mais pas encore approuvé (ou refusé/suspendu) ne doit
  // jamais atteindre l'espace fournisseur — même règle que le blocage déjà
  // appliqué côté service (createOrderForSupplier), en défense en profondeur.
  if (!supplier || supplier.status !== 'ACTIVE') {
    redirect('/onboarding/pending');
  }

  return (
    <div className="flex min-h-screen bg-surface-page">
      <aside className="w-60 shrink-0 border-r border-hairline bg-surface px-4 py-6">
        <div className="mb-8 px-2">
          <span className="text-lg font-semibold text-brand-700">LogiFlow</span>
          <div className="text-xs text-ink-muted">Espace fournisseur</div>
        </div>
        <SupplierNav />
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-hairline bg-surface px-6 py-3">
          <div className="text-sm font-medium text-ink-primary">{supplier?.companyName}</div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-ink-primary">
                {user.firstName} {user.lastName}
              </div>
              <div className="text-xs text-ink-muted">Fournisseur</div>
            </div>
            <LogoutButton />
          </div>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

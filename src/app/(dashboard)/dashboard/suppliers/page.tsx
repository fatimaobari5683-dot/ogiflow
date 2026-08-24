import Link from 'next/link';
import { listSuppliers } from '@/modules/suppliers/suppliers.service';
import { Card } from '@/components/ui/Card';
import clsx from 'clsx';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'En attente',
  ACTIVE: 'Actif',
  REJECTED: 'Refusé',
  SUSPENDED: 'Suspendu',
  TERMINATED: 'Résilié',
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING_APPROVAL: 'bg-slate-100 text-ink-secondary',
  ACTIVE: 'bg-[#0ca30c]/10 text-[#006300]',
  REJECTED: 'bg-status-critical/10 text-status-critical',
  SUSPENDED: 'bg-status-warning/15 text-[#8a5a00]',
  TERMINATED: 'bg-slate-100 text-ink-muted',
};

export default async function SuppliersPage() {
  const suppliers = await listSuppliers();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Fournisseurs</h1>
          <p className="text-sm text-ink-secondary">{suppliers.length} fournisseur{suppliers.length > 1 ? 's' : ''}</p>
        </div>
        <Link href="/dashboard/onboarding" className="text-sm text-brand-600 hover:underline">
          Voir les inscriptions en attente →
        </Link>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted">
              <th className="pb-2 font-medium">Entreprise</th>
              <th className="pb-2 font-medium">Contact</th>
              <th className="pb-2 font-medium">Commission</th>
              <th className="pb-2 font-medium">Commandes</th>
              <th className="pb-2 font-medium">Produits</th>
              <th className="pb-2 pr-0 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {suppliers.map((supplier) => (
              <tr key={supplier.id}>
                <td className="py-2.5">
                  <Link href={`/dashboard/suppliers/${supplier.id}`} className="font-medium text-brand-600 hover:underline">
                    {supplier.companyName}
                  </Link>
                </td>
                <td className="py-2.5 text-ink-secondary">
                  {supplier.user.firstName} {supplier.user.lastName} · {supplier.user.phone}
                </td>
                <td className="py-2.5 text-ink-secondary">{Number(supplier.defaultCommissionRate)}%</td>
                <td className="py-2.5 text-ink-secondary">{supplier._count.orders}</td>
                <td className="py-2.5 text-ink-secondary">{supplier._count.products}</td>
                <td className="py-2.5">
                  <span className={clsx('rounded-full px-2.5 py-1 text-xs font-medium', STATUS_CLASSES[supplier.status])}>
                    {STATUS_LABELS[supplier.status]}
                  </span>
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-ink-muted">
                  Aucun fournisseur enregistré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

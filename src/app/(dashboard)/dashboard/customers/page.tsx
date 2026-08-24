import Link from 'next/link';
import { listCustomers } from '@/modules/customers/customers.service';
import { Card } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

export default async function CustomersPage({ searchParams }: { searchParams: { q?: string } }) {
  const customers = await listCustomers(searchParams.q);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Clients</h1>
        <p className="text-sm text-ink-secondary">{customers.length} client{customers.length > 1 ? 's' : ''}</p>
      </div>

      <form className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={searchParams.q}
          placeholder="Rechercher par nom ou téléphone…"
          className="w-full max-w-sm rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button type="submit" className="rounded-md border border-hairline px-4 py-2 text-sm font-medium text-ink-primary hover:bg-slate-50">
          Rechercher
        </button>
      </form>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted">
              <th className="pb-2 font-medium">Nom</th>
              <th className="pb-2 font-medium">Téléphone</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Client depuis</th>
              <th className="pb-2 pr-0 text-right font-medium">Commandes</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-b border-hairline last:border-0">
                <td className="py-2">
                  <Link href={`/dashboard/customers/${customer.id}`} className="font-medium text-brand-600 hover:underline">
                    {customer.fullName}
                  </Link>
                </td>
                <td className="py-2 text-ink-secondary">{customer.phone}</td>
                <td className="py-2 text-ink-secondary">{customer.email ?? '—'}</td>
                <td className="py-2 text-ink-secondary">
                  {new Date(customer.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td className="py-2 pr-0 text-right text-ink-primary">{customer._count.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {customers.length === 0 && <p className="py-6 text-center text-sm text-ink-muted">Aucun client trouvé.</p>}
      </Card>
    </div>
  );
}

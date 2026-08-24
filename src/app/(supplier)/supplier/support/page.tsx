import { requirePageUser } from '@/shared/http/page-auth';
import { listMyTickets } from '@/modules/support/support.service';
import { TicketListView } from '@/components/support/TicketListView';
import { NewTicketForm } from '@/components/support/NewTicketForm';

export const dynamic = 'force-dynamic';

export default async function SupplierSupportPage() {
  const user = await requirePageUser(['SUPPLIER']);
  const tickets = await listMyTickets(user.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Aide</h1>
        <p className="text-sm text-ink-secondary">Vos demandes envoyées au support LogiFlow.</p>
      </div>
      <NewTicketForm basePath="/supplier/support" />
      <TicketListView tickets={tickets} basePath="/supplier/support" />
    </div>
  );
}

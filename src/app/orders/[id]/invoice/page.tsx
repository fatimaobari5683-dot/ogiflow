import { notFound, redirect } from 'next/navigation';
import { requirePageUser } from '@/shared/http/page-auth';
import { getOrderDetail, OrderError } from '@/modules/orders/orders.service';
import { prisma } from '@/infrastructure/database/client';
import { OrderInvoice } from '@/components/orders/OrderInvoice';
import { PrintButton, BackButton } from '@/components/orders/PrintButton';

export const dynamic = 'force-dynamic';

const INTERNAL_ROLES = ['SUPER_ADMIN', 'LOGISTICS_MANAGER', 'FINANCE_MANAGER', 'SUPPORT_AGENT'];

/**
 * Même gabarit partagé que /orders/[id]/label — hors des groupes de layout,
 * même vérification de propriété (interne, fournisseur propriétaire, ou
 * livreur assigné). Le livreur n'a normalement pas besoin de la facture,
 * mais l'y autoriser évite un cas particulier de plus alors que l'accès
 * n'expose rien qu'il ne voit déjà sur sa mission.
 */
export default async function OrderInvoicePage({ params }: { params: { id: string } }) {
  const user = await requirePageUser();

  const order = await getOrderDetail(params.id).catch((err) => {
    if (err instanceof OrderError) return null;
    throw err;
  });
  if (!order) notFound();

  const isInternal = INTERNAL_ROLES.includes(user.role);
  let isOwner = false;
  if (!isInternal) {
    if (user.role === 'SUPPLIER') {
      const supplier = await prisma.supplier.findUnique({ where: { userId: user.id }, select: { id: true } });
      isOwner = supplier?.id === order.supplierId;
    } else if (user.role === 'DRIVER') {
      const driver = await prisma.driver.findUnique({ where: { userId: user.id }, select: { id: true } });
      isOwner = driver?.id === order.delivery?.driverId;
    }
  }
  if (!isInternal && !isOwner) redirect('/');

  return (
    <main className="min-h-screen bg-surface-page px-4 py-8 print:min-h-0 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-lg items-center justify-between print:hidden">
        <BackButton />
        <PrintButton />
      </div>

      <div className="mt-4 print:mt-0">
        <OrderInvoice order={order} />
      </div>
    </main>
  );
}

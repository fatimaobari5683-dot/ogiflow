import { notFound, redirect } from 'next/navigation';
import { requirePageUser } from '@/shared/http/page-auth';
import { getOrderDetail, OrderError } from '@/modules/orders/orders.service';
import { prisma } from '@/infrastructure/database/client';
import { DeliveryLabel } from '@/components/orders/DeliveryLabel';
import { PrintButton, BackButton } from '@/components/orders/PrintButton';

export const dynamic = 'force-dynamic';

const INTERNAL_ROLES = ['SUPER_ADMIN', 'LOGISTICS_MANAGER', 'FINANCE_MANAGER', 'SUPPORT_AGENT'];

/**
 * Route volontairement HORS des groupes (dashboard)/(supplier)/(driver) —
 * une page d'impression n'a pas besoin (et ne doit pas avoir) de barre
 * latérale à masquer au moment d'imprimer. Un seul gabarit partagé plutôt
 * qu'une copie par espace : un agent interne, le fournisseur propriétaire de
 * la commande, ou le livreur qui lui est assigné peuvent tous y accéder —
 * vérifié ici (pas de restriction de rôle à l'entrée), pas au niveau route.
 */
export default async function OrderLabelPage({ params }: { params: { id: string } }) {
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
      <div className="mx-auto flex max-w-md items-center justify-between print:hidden">
        <BackButton />
        <PrintButton />
      </div>

      <div className="mt-4 print:mt-0">
        <DeliveryLabel order={order} />
      </div>
    </main>
  );
}

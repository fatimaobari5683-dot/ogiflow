import { notFound, redirect } from 'next/navigation';
import { requirePageUser } from '@/shared/http/page-auth';
import { getSettlementDetail, SettlementError } from '@/modules/settlements/settlements.service';
import { prisma } from '@/infrastructure/database/client';
import { SettlementStatement } from '@/components/settlements/SettlementStatement';
import { PrintButton, BackButton } from '@/components/orders/PrintButton';

export const dynamic = 'force-dynamic';

const INTERNAL_ROLES = ['SUPER_ADMIN', 'LOGISTICS_MANAGER', 'FINANCE_MANAGER', 'SUPPORT_AGENT'];

/**
 * Même gabarit partagé que /orders/[id]/label et /orders/[id]/invoice —
 * hors des groupes de layout, un agent interne ou le fournisseur
 * propriétaire du versement peut y accéder.
 */
export default async function SettlementStatementPage({ params }: { params: { id: string } }) {
  const user = await requirePageUser();

  const settlement = await getSettlementDetail(params.id).catch((err) => {
    if (err instanceof SettlementError) return null;
    throw err;
  });
  if (!settlement) notFound();

  const isInternal = INTERNAL_ROLES.includes(user.role);
  let isOwner = false;
  if (!isInternal && user.role === 'SUPPLIER') {
    const supplier = await prisma.supplier.findUnique({ where: { userId: user.id }, select: { id: true } });
    isOwner = supplier?.id === settlement.supplierId;
  }
  if (!isInternal && !isOwner) redirect('/');

  return (
    <main className="min-h-screen bg-surface-page px-4 py-8 print:min-h-0 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-lg items-center justify-between print:hidden">
        <BackButton />
        <PrintButton />
      </div>

      <div className="mt-4 print:mt-0">
        <SettlementStatement settlement={settlement} />
      </div>
    </main>
  );
}

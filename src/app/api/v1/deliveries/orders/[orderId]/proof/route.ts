import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/shared/http/auth-context';
import { getOrderDetail, OrderError } from '@/modules/orders/orders.service';
import { getDeliveryProofFile, DeliveryError } from '@/modules/deliveries/deliveries.service';
import { prisma } from '@/infrastructure/database/client';
import { toErrorResponse } from '@/shared/http/api-error';

const INTERNAL_ROLES = ['SUPER_ADMIN', 'LOGISTICS_MANAGER', 'FINANCE_MANAGER', 'SUPPORT_AGENT'];

/**
 * Sert la photo/signature capturée à la livraison — jamais depuis /public,
 * même garde d'ownership que le bordereau imprimable (orders/[id]/label) :
 * un agent interne, le fournisseur propriétaire, ou le livreur assigné.
 */
export async function GET(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const context = await getAuthContext(req);

    const order = await getOrderDetail(params.orderId).catch((err) => {
      if (err instanceof OrderError) throw new DeliveryError('Commande introuvable.', 404);
      throw err;
    });

    const isInternal = INTERNAL_ROLES.includes(context.role);
    let isOwner = false;
    if (!isInternal) {
      if (context.role === 'SUPPLIER') {
        const supplier = await prisma.supplier.findUnique({ where: { userId: context.userId }, select: { id: true } });
        isOwner = supplier?.id === order.supplierId;
      } else if (context.role === 'DRIVER') {
        const driver = await prisma.driver.findUnique({ where: { userId: context.userId }, select: { id: true } });
        isOwner = driver?.id === order.delivery?.driverId;
      }
    }
    if (!isInternal && !isOwner) {
      throw new DeliveryError('Accès refusé à cette preuve de livraison.', 403);
    }

    const { buffer, mimeType } = await getDeliveryProofFile(params.orderId);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': 'inline; filename="preuve-livraison"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return toErrorResponse(err, 'DELIVERY_PROOF_FILE_ERROR');
  }
}

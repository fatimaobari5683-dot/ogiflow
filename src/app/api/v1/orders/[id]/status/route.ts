import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/shared/http/auth-context';
import { Permission, hasPermission, assertPermission, ForbiddenError } from '@/shared/constants/permissions';
import { prisma } from '@/infrastructure/database/client';
import { updateOrderStatusSchema } from '@/modules/orders/orders.validators';
import { transitionOrderStatus } from '@/modules/orders/orders.service';
import { toErrorResponse } from '@/shared/http/api-error';

/**
 * Transitions manuelles pré-dispatch (PENDING→CONFIRMED→READY_FOR_PICKUP),
 * réservées aux managers, et annulation (CANCELLED), également ouverte au
 * fournisseur propriétaire de la commande (permission ORDERS_CANCEL). Les
 * transitions suivantes (ASSIGNED, PICKED_UP, DELIVERED...) passent par les
 * modules dispatch et deliveries, pas par cette route.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthContext(req);
    const body = await req.json();
    const { status, reason } = updateOrderStatusSchema.parse(body);

    if (status === 'CANCELLED') {
      const canManage = hasPermission(context.role, Permission.ORDERS_UPDATE_STATUS);
      const canCancelOwn = hasPermission(context.role, Permission.ORDERS_CANCEL);

      if (!canManage && !canCancelOwn) {
        throw new ForbiddenError("Ce rôle ne peut pas annuler de commande.");
      }
      if (!canManage && context.role === 'SUPPLIER') {
        const order = await prisma.order.findUniqueOrThrow({ where: { id: params.id }, select: { supplierId: true } });
        const supplier = await prisma.supplier.findUnique({ where: { userId: context.userId }, select: { id: true } });
        if (supplier?.id !== order.supplierId) {
          throw new ForbiddenError("Cette commande n'appartient pas à votre compte fournisseur.");
        }
      }
    } else {
      assertPermission(context.role, Permission.ORDERS_UPDATE_STATUS);
    }

    const order = await transitionOrderStatus(params.id, status, { actorId: context.userId, reason });
    return NextResponse.json({ success: true, data: order });
  } catch (err) {
    return toErrorResponse(err, 'ORDER_STATUS_UPDATE_ERROR');
  }
}

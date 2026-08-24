import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/shared/http/auth-context';
import { Permission, hasPermission, ForbiddenError } from '@/shared/constants/permissions';
import { prisma } from '@/infrastructure/database/client';
import { getOrderDetail } from '@/modules/orders/orders.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthContext(req);
    const order = await getOrderDetail(params.id);

    if (!hasPermission(context.role, Permission.ORDERS_VIEW_ALL)) {
      if (context.role === 'SUPPLIER') {
        const supplier = await prisma.supplier.findUnique({ where: { userId: context.userId }, select: { id: true } });
        if (supplier?.id !== order.supplierId) {
          throw new ForbiddenError("Cette commande n'appartient pas à votre compte fournisseur.");
        }
      } else {
        throw new ForbiddenError("Ce rôle n'a pas accès au détail de cette commande.");
      }
    }

    return NextResponse.json({ success: true, data: order });
  } catch (err) {
    return toErrorResponse(err, 'ORDER_DETAIL_ERROR');
  }
}

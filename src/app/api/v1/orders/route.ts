import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/shared/http/auth-context';
import { Permission, hasPermission, assertPermission, ForbiddenError } from '@/shared/constants/permissions';
import { prisma } from '@/infrastructure/database/client';
import { createOrderSchema, listOrdersQuerySchema } from '@/modules/orders/orders.validators';
import { createOrderForSupplier, listOrders } from '@/modules/orders/orders.service';
import { toErrorResponse } from '@/shared/http/api-error';
import { withIdempotency } from '@/shared/http/idempotency';

export async function GET(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    const { searchParams } = new URL(req.url);
    const { supplierId, status } = listOrdersQuerySchema.parse({
      supplierId: searchParams.get('supplierId') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    });

    let effectiveSupplierId = supplierId;

    if (hasPermission(context.role, Permission.ORDERS_VIEW_ALL)) {
      // pas de restriction supplémentaire — filtre optionnel déjà appliqué
    } else if (context.role === 'SUPPLIER') {
      const supplier = await prisma.supplier.findUnique({ where: { userId: context.userId }, select: { id: true } });
      if (!supplier) throw new ForbiddenError('Profil fournisseur introuvable.');
      effectiveSupplierId = supplier.id; // un fournisseur ne voit jamais les commandes d'un autre
    } else {
      throw new ForbiddenError("Ce rôle n'a pas accès à la liste des commandes.");
    }

    const orders = await listOrders({ supplierId: effectiveSupplierId, status });
    return NextResponse.json({ success: true, data: orders });
  } catch (err) {
    return toErrorResponse(err, 'ORDERS_LIST_ERROR');
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    assertPermission(context.role, Permission.ORDERS_CREATE);

    const body = await req.json();
    const input = createOrderSchema.parse(body);

    if (context.role === 'SUPPLIER') {
      const supplier = await prisma.supplier.findUnique({ where: { userId: context.userId }, select: { id: true } });
      if (!supplier || supplier.id !== input.supplierId) {
        throw new ForbiddenError('Vous ne pouvez créer des commandes que pour votre propre compte fournisseur.');
      }
    }

    const { statusCode, body: order } = await withIdempotency(
      { scope: 'orders:create', key: req.headers.get('idempotency-key'), requestBody: input },
      async () => ({ statusCode: 201, body: await createOrderForSupplier(input) })
    );

    return NextResponse.json({ success: true, data: order }, { status: statusCode });
  } catch (err) {
    return toErrorResponse(err, 'ORDER_CREATE_ERROR');
  }
}

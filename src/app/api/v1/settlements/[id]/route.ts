import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/shared/http/auth-context';
import { Permission, hasPermission, ForbiddenError } from '@/shared/constants/permissions';
import { prisma } from '@/infrastructure/database/client';
import { getSettlementDetail } from '@/modules/settlements/settlements.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthContext(req);
    const settlement = await getSettlementDetail(params.id);

    if (!hasPermission(context.role, Permission.SETTLEMENTS_MANAGE)) {
      if (context.role === 'SUPPLIER') {
        const supplier = await prisma.supplier.findUnique({ where: { userId: context.userId }, select: { id: true } });
        if (supplier?.id !== settlement.supplierId) {
          throw new ForbiddenError('Ce versement ne concerne pas votre compte fournisseur.');
        }
      } else {
        throw new ForbiddenError("Ce rôle n'a pas accès à ce versement.");
      }
    }

    return NextResponse.json({ success: true, data: settlement });
  } catch (err) {
    return toErrorResponse(err, 'SETTLEMENT_DETAIL_ERROR');
  }
}

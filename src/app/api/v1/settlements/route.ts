import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, requirePermission } from '@/shared/http/auth-context';
import { Permission, hasPermission, ForbiddenError } from '@/shared/constants/permissions';
import { prisma } from '@/infrastructure/database/client';
import { generateSettlementSchema, listSettlementsQuerySchema } from '@/modules/settlements/settlements.validators';
import { generateSettlement, listSettlements } from '@/modules/settlements/settlements.service';
import { toErrorResponse } from '@/shared/http/api-error';

/**
 * Les managers finance voient tous les versements (filtre optionnel).
 * Un fournisseur ne voit que les siens — jamais confiance dans un
 * `supplierId` de requête pour ce rôle.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    const { searchParams } = new URL(req.url);
    const { status } = listSettlementsQuerySchema.parse({
      supplierId: searchParams.get('supplierId') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    });

    let supplierId: string | undefined = searchParams.get('supplierId') ?? undefined;

    if (hasPermission(context.role, Permission.SETTLEMENTS_MANAGE)) {
      // pas de restriction supplémentaire — filtre optionnel déjà appliqué
    } else if (context.role === 'SUPPLIER') {
      const supplier = await prisma.supplier.findUnique({ where: { userId: context.userId }, select: { id: true } });
      if (!supplier) throw new ForbiddenError('Profil fournisseur introuvable.');
      supplierId = supplier.id;
    } else {
      throw new ForbiddenError("Ce rôle n'a pas accès aux versements.");
    }

    const settlements = await listSettlements({ supplierId, status });
    return NextResponse.json({ success: true, data: settlements });
  } catch (err) {
    return toErrorResponse(err, 'SETTLEMENTS_LIST_ERROR');
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, Permission.SETTLEMENTS_MANAGE);
    const body = await req.json();
    const { supplierId, periodStart, periodEnd } = generateSettlementSchema.parse(body);

    const settlement = await generateSettlement(supplierId, periodStart, periodEnd);
    return NextResponse.json({ success: true, data: settlement }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, 'SETTLEMENT_GENERATE_ERROR');
  }
}

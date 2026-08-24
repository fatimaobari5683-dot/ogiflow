import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { assignDriverSchema } from '@/modules/dispatch/dispatch.validators';
import { assignDriverToOrder, autoAssignBestDriver } from '@/modules/dispatch/dispatch.service';
import { toErrorResponse } from '@/shared/http/api-error';

/**
 * Assignation d'un livreur à une commande. Si `driverId` est fourni dans le
 * corps de la requête, l'assignation est manuelle (choix du responsable
 * logistique parmi les candidats) ; sinon, le meilleur livreur disponible
 * est sélectionné automatiquement par le moteur de dispatch.
 */
export async function POST(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const context = await requirePermission(req, Permission.DISPATCH_MANAGE);
    const body = await req.json().catch(() => ({}));

    const result = body?.driverId
      ? await assignDriverToOrder(params.orderId, assignDriverSchema.parse(body).driverId, {
          actorId: context.userId,
        })
      : await autoAssignBestDriver(params.orderId, { actorId: context.userId });

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return toErrorResponse(err, 'DISPATCH_ASSIGN_ERROR');
  }
}

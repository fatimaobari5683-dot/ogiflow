import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { recordAttemptSchema } from '@/modules/deliveries/deliveries.validators';
import { recordDeliveryAttempt } from '@/modules/deliveries/deliveries.service';
import { toErrorResponse } from '@/shared/http/api-error';

/**
 * Enregistre une tentative de livraison — succès (avec preuve de livraison
 * obligatoire) ou échec. Le point d'entrée central du module POD.
 */
export async function POST(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const context = await requirePermission(req, Permission.DELIVERIES_UPDATE_STATUS);
    const body = await req.json();
    const input = recordAttemptSchema.parse(body);

    const order = await recordDeliveryAttempt(params.orderId, {
      ...input,
      actorId: context.userId,
      actorRole: context.role,
    });

    return NextResponse.json({ success: true, data: order });
  } catch (err) {
    return toErrorResponse(err, 'DELIVERY_ATTEMPT_ERROR');
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { resolveFailedDeliverySchema } from '@/modules/deliveries/deliveries.validators';
import { resolveFailedDelivery } from '@/modules/deliveries/deliveries.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const context = await requirePermission(req, Permission.DELIVERIES_UPDATE_STATUS);
    const body = await req.json();
    const { status, reason } = resolveFailedDeliverySchema.parse(body);

    const order = await resolveFailedDelivery(params.orderId, status, {
      actorId: context.userId,
      actorRole: context.role,
      reason,
    });

    return NextResponse.json({ success: true, data: order });
  } catch (err) {
    return toErrorResponse(err, 'DELIVERY_RESOLVE_ERROR');
  }
}

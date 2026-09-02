import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { advanceStatusSchema } from '@/modules/deliveries/deliveries.validators';
import { advanceDeliveryStatus } from '@/modules/deliveries/deliveries.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const context = await requirePermission(req, Permission.DELIVERIES_UPDATE_STATUS);
    const body = await req.json();
    const { status, latitude, longitude, pickupCode } = advanceStatusSchema.parse(body);

    const order = await advanceDeliveryStatus(params.orderId, status, {
      actorId: context.userId,
      actorRole: context.role,
      latitude,
      longitude,
      pickupCode,
    });

    return NextResponse.json({ success: true, data: order });
  } catch (err) {
    return toErrorResponse(err, 'DELIVERY_STATUS_ERROR');
  }
}

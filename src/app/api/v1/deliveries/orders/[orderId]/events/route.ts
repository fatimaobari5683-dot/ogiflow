import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { recordEventSchema } from '@/modules/deliveries/deliveries.validators';
import { recordDeliveryEvent } from '@/modules/deliveries/deliveries.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const context = await requirePermission(req, Permission.DELIVERIES_UPDATE_STATUS);
    const body = await req.json();
    const { eventType, latitude, longitude, metadata } = recordEventSchema.parse(body);

    const event = await recordDeliveryEvent(params.orderId, eventType, {
      actorId: context.userId,
      actorRole: context.role,
      latitude,
      longitude,
      metadata,
    });

    return NextResponse.json({ success: true, data: event }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, 'DELIVERY_EVENT_ERROR');
  }
}

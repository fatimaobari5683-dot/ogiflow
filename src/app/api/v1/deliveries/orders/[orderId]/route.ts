import { NextRequest, NextResponse } from 'next/server';
import { requireAnyPermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { getDeliveryDetail } from '@/modules/deliveries/deliveries.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const context = await requireAnyPermission(req, [Permission.ORDERS_VIEW_ALL, Permission.DELIVERIES_UPDATE_STATUS]);
    const delivery = await getDeliveryDetail(params.orderId, { actorId: context.userId, actorRole: context.role });
    return NextResponse.json({ success: true, data: delivery });
  } catch (err) {
    return toErrorResponse(err, 'DELIVERY_DETAIL_ERROR');
  }
}

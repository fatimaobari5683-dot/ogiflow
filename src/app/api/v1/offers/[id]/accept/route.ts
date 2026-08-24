import { NextRequest, NextResponse } from 'next/server';
import { requireAnyPermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { acceptOffer } from '@/modules/dispatch/offers.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await requireAnyPermission(req, [Permission.DELIVERIES_UPDATE_STATUS, Permission.DISPATCH_MANAGE]);
    const result = await acceptOffer(params.id, { actorId: context.userId, actorRole: context.role });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return toErrorResponse(err, 'OFFER_ACCEPT_ERROR');
  }
}

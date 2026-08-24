import { NextRequest, NextResponse } from 'next/server';
import { requireDriverAccess } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { getMyPendingOffers } from '@/modules/dispatch/offers.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireDriverAccess(req, params.id, Permission.DRIVERS_MANAGE);
    const offers = await getMyPendingOffers(params.id);
    return NextResponse.json({ success: true, data: offers });
  } catch (err) {
    return toErrorResponse(err, 'DRIVER_OFFERS_ERROR');
  }
}

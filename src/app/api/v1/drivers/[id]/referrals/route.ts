import { NextRequest, NextResponse } from 'next/server';
import { requireDriverAccess } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { getDriverReferralOverview } from '@/modules/drivers/referrals.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireDriverAccess(req, params.id, Permission.DRIVERS_MANAGE);
    const overview = await getDriverReferralOverview(params.id);
    return NextResponse.json({ success: true, data: overview });
  } catch (err) {
    return toErrorResponse(err, 'DRIVER_REFERRALS_ERROR');
  }
}

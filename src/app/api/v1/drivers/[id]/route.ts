import { NextRequest, NextResponse } from 'next/server';
import { requireDriverAccess } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { getDriverProfile } from '@/modules/drivers/drivers.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireDriverAccess(req, params.id, Permission.DRIVERS_MANAGE);
    const driver = await getDriverProfile(params.id);
    return NextResponse.json({ success: true, data: driver });
  } catch (err) {
    return toErrorResponse(err, 'DRIVER_DETAIL_ERROR');
  }
}

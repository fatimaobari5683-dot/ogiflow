import { NextRequest, NextResponse } from 'next/server';
import { requireAnyPermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { listDriverLocations } from '@/modules/drivers/drivers.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest) {
  try {
    await requireAnyPermission(req, [Permission.DRIVERS_MANAGE, Permission.DISPATCH_MANAGE]);
    const locations = await listDriverLocations();
    return NextResponse.json({ success: true, data: locations });
  } catch (err) {
    return toErrorResponse(err, 'DRIVER_LOCATIONS_ERROR');
  }
}

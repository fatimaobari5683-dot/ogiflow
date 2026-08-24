import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { listDriversQuerySchema } from '@/modules/drivers/drivers.validators';
import { listDrivers } from '@/modules/drivers/drivers.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, Permission.DRIVERS_MANAGE);

    const { searchParams } = new URL(req.url);
    const { status, zoneId } = listDriversQuerySchema.parse({
      status: searchParams.get('status') ?? undefined,
      zoneId: searchParams.get('zoneId') ?? undefined,
    });

    const drivers = await listDrivers({ status, zoneId });
    return NextResponse.json({ success: true, data: drivers });
  } catch (err) {
    return toErrorResponse(err, 'DRIVERS_LIST_ERROR');
  }
}

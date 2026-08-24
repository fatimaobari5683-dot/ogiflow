import { NextRequest, NextResponse } from 'next/server';
import { requireDriverAccess } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { updateDriverLocationSchema } from '@/modules/drivers/drivers.validators';
import { updateDriverLocation } from '@/modules/drivers/drivers.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireDriverAccess(req, params.id, Permission.DRIVERS_MANAGE);
    const body = await req.json();
    const { latitude, longitude } = updateDriverLocationSchema.parse(body);
    const driver = await updateDriverLocation(params.id, latitude, longitude);
    return NextResponse.json({ success: true, data: driver });
  } catch (err) {
    return toErrorResponse(err, 'DRIVER_LOCATION_ERROR');
  }
}

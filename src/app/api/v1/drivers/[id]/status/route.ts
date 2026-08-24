import { NextRequest, NextResponse } from 'next/server';
import { requireDriverAccess } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { updateDriverStatusSchema } from '@/modules/drivers/drivers.validators';
import { setDriverAvailability } from '@/modules/drivers/drivers.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireDriverAccess(req, params.id, Permission.DRIVERS_MANAGE);
    const body = await req.json();
    const { status } = updateDriverStatusSchema.parse(body);
    const driver = await setDriverAvailability(params.id, status);
    return NextResponse.json({ success: true, data: driver });
  } catch (err) {
    return toErrorResponse(err, 'DRIVER_STATUS_ERROR');
  }
}

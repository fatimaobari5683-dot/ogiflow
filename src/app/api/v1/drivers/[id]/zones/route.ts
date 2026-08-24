import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { assignZoneSchema } from '@/modules/drivers/drivers.validators';
import { assignDriverToZone, removeDriverFromZone } from '@/modules/drivers/drivers.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(req, Permission.DRIVERS_MANAGE);
    const body = await req.json();
    const { zoneId } = assignZoneSchema.parse(body);
    const driverZone = await assignDriverToZone(params.id, zoneId);
    return NextResponse.json({ success: true, data: driverZone }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, 'DRIVER_ZONE_ASSIGN_ERROR');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission(req, Permission.DRIVERS_MANAGE);
    const { searchParams } = new URL(req.url);
    const zoneId = searchParams.get('zoneId');
    if (!zoneId) {
      return NextResponse.json({ success: false, error: 'Paramètre zoneId requis.' }, { status: 422 });
    }
    await removeDriverFromZone(params.id, zoneId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err, 'DRIVER_ZONE_REMOVE_ERROR');
  }
}

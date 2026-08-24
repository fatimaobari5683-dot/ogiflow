import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { approveDriver } from '@/modules/onboarding/onboarding.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await requirePermission(req, Permission.DRIVERS_MANAGE);
    const driver = await approveDriver(params.id, context.userId);
    return NextResponse.json({ success: true, data: driver });
  } catch (err) {
    return toErrorResponse(err, 'DRIVER_APPROVE_ERROR');
  }
}

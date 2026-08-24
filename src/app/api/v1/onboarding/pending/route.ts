import { NextRequest, NextResponse } from 'next/server';
import { requireAnyPermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { listPendingSuppliers, listPendingDrivers } from '@/modules/onboarding/onboarding.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest) {
  try {
    await requireAnyPermission(req, [Permission.SUPPLIERS_MANAGE, Permission.DRIVERS_MANAGE]);
    const [suppliers, drivers] = await Promise.all([listPendingSuppliers(), listPendingDrivers()]);
    return NextResponse.json({ success: true, data: { suppliers, drivers } });
  } catch (err) {
    return toErrorResponse(err, 'ONBOARDING_PENDING_LIST_ERROR');
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { getDispatchCandidates, countIneligibleAvailableDrivers } from '@/modules/dispatch/dispatch.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    await requirePermission(req, Permission.DISPATCH_MANAGE);
    const [candidates, excludedForCompliance] = await Promise.all([
      getDispatchCandidates(params.orderId),
      countIneligibleAvailableDrivers(),
    ]);
    return NextResponse.json({ success: true, data: { candidates, excludedForCompliance } });
  } catch (err) {
    return toErrorResponse(err, 'DISPATCH_CANDIDATES_ERROR');
  }
}

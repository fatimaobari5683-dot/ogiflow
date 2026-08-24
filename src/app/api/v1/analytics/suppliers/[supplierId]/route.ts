import { NextRequest, NextResponse } from 'next/server';
import { requireSupplierAccess } from '@/shared/http/auth-context';
import { Permission } from '@/shared/constants/permissions';
import { getSupplierAnalytics } from '@/modules/analytics/analytics.service';
import { toErrorResponse } from '@/shared/http/api-error';

export async function GET(req: NextRequest, { params }: { params: { supplierId: string } }) {
  try {
    await requireSupplierAccess(req, params.supplierId, Permission.ANALYTICS_VIEW);
    const analytics = await getSupplierAnalytics(params.supplierId);
    return NextResponse.json({ success: true, data: analytics });
  } catch (err) {
    return toErrorResponse(err, 'ANALYTICS_SUPPLIER_ERROR');
  }
}
